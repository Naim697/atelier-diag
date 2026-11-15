import type { Case, CodeRef, DtcEntry, Fuel, MyDef, StepResult, VehicleInfo } from './types';
import { CATS, NATURE_FR, causeCat, detectFamily, detectNature, isElectrical, type Family, type Nature } from './classify';
import { COMMON, TEST_BY_ID, testsFor, type TestDef } from './testlib';
import { ftbLabel } from './ftb';
import { formatCode, isOemRange, obdSystem } from './codes';
import { brandLabel, OEM_KEYS } from './brands';
import { findSimilar, type SimilarCase } from './similar';
import { KNOWN, type KnownPattern } from '../data/pannes-connues';
import { violatesEmissionRule } from './guard';
import { FICHE_INSTRUCTION } from './fiche';

export interface CodeInput { ref: CodeRef; entries: DtcEntry[]; myDef?: MyDef }

export interface Hypothesis {
  key: string;
  code: string;          // '' = piste globale
  cat: string;
  text: string;          // libellé français
  detail: string;        // texte d'origine de la base, si différent
  source: 'base' | 'type' | 'cas' | 'connue' | 'controle';
  weight: number;
  pct: number;
  seen: number;          // nombre de tes cas résolus sur cette cause
  status: '' | 'confirmed' | 'cleared';
}

export interface CodeAnalysis {
  ref: CodeRef;
  title: string;
  titleOrig: string;
  desc: string;
  sources: string[];
  family: Family;
  nature: Nature;
  ftLabel: string;
  system: string;
  flags: string;
  components: string[];
  symptoms: string[];
  repair: DtcEntry['r'] | null;
  related: string[];
  oemTitle: string;
  otherBrands: [string, string][];
  variants: NonNullable<DtcEntry['variants']>;
  myDef?: MyDef;
  hypotheses: Hypothesis[];
  documented: boolean;
}

export interface PlanStep extends TestDef {
  codes: string[];
  group: 'prelim' | 'cas' | 'connue' | 'test';
  result?: StepResult;
  lowValue: boolean;
}

export interface KnownMatch { pattern: KnownPattern; codes: string[] }

export interface Diagnosis {
  codes: CodeAnalysis[];
  hints: string[];
  shared: [string, string[]][];
  similar: SimilarCase[];
  known: KnownMatch[];
  plan: PlanStep[];
  lead: Hypothesis | null;
  next: PlanStep | null;
  progress: { done: number; total: number };
}

export interface DiagInput {
  codes: CodeInput[];
  vehicle: VehicleInfo;
  sym: string;
  cases: Case[];
  results: StepResult[];
  excludeCaseId?: string;
}

const PRIOR: Record<number, number> = { 3: 4, 2: 2, 1: 1 };

function pick(entries: DtcEntry[], pack: string) { return entries.find((e) => e.pack === pack); }

function describe(input: CodeInput, v: VehicleInfo): CodeAnalysis {
  const { ref, entries, myDef } = input;
  const gen = pick(entries, 'generique');
  const oem = pick(entries, 'constructeurs');
  const psa = pick(entries, 'psa');
  const vag = pick(entries, 'vag5');
  const other = entries.filter((e) => !['generique', 'constructeurs', 'psa', 'vag5'].includes(e.pack));
  const sources: string[] = [];
  let oemTitle = '';
  if (oem?.brands) {
    for (const k of OEM_KEYS[v.brand] || [v.brand]) if (oem.brands[k]) { oemTitle = oem.brands[k]; break; }
  }
  // Marque non précisée : si toutes les marques donnent le même sens, on le prend.
  if (!oemTitle && oem?.brands) { const distinct = [...new Set(Object.values(oem.brands).map((x) => x.toLowerCase()))]; if (distinct.length === 1) oemTitle = Object.values(oem.brands)[0]; }
  const psaFirst = v.brand === 'PSA' && psa?.variants?.length ? (psa.variants.find((x) => ref.ecu && x[0] === ref.ecu) || psa.variants[0])[1] : '';
  const vagTitle = ref.format === 'vag5' && vag ? (vag.tf || vag.t || '').split(';')[0] : '';
  const o = other[0];
  const titleOrig = gen?.t || oemTitle || psaFirst || vagTitle || o?.t || '';
  const title = psaFirst || gen?.tf || (oemTitle && (oem?.tf && Object.values(oem.brands || {})[0] === oemTitle ? oem.tf : '')) || o?.tf || myDef?.text || titleOrig || ref.label || '';
  if (gen) sources.push('Base générique');
  if (oemTitle) sources.push('Base constructeurs');
  if (psaFirst) sources.push('Base PSA');
  if (vagTitle) sources.push('Base VAG');
  if (o) sources.push(o.pack);
  if (myDef) sources.push('Ta définition');
  const classText = [title, titleOrig, myDef?.text, ref.label, ...(gen?.k || [])].filter(Boolean).join(' ');
  const family = detectFamily(classText, ref.code);
  const nature = detectNature([titleOrig, title, myDef?.text, ref.label].filter(Boolean).join(' '), ref.ft);
  // Pas de titre français dans la base : on en construit un à partir du composant et du type de défaut.
  const hasFrench = !!(psaFirst || gen?.tf || o?.tf || myDef?.text);
  const frTitle = !hasFrench && titleOrig && family.id !== 'unknown' ? `${family.label} : ${NATURE_FR[nature]}` : '';
  const otherBrands: [string, string][] = !oemTitle && oem?.brands && isOemRange(ref.code) ? Object.entries(oem.brands).map(([b, t]) => [brandLabel(b), t]) : [];
  return {
    ref, title: frTitle || title, titleOrig: frTitle ? titleOrig : titleOrig !== title ? titleOrig : '', desc: gen?.d || o?.d || '', sources, family, nature,
    ftLabel: ftbLabel(ref.ft), system: ref.format === 'obd' ? obdSystem(ref.code) : '',
    flags: gen?.f || '', components: gen?.k || [], symptoms: gen?.s || [], repair: gen?.r || null, related: gen?.x || [],
    oemTitle: gen && oemTitle ? oemTitle : '', otherBrands, variants: psa?.variants || [], myDef, hypotheses: [],
    documented: !!(title || myDef),
  };
}

function baseHypotheses(a: CodeAnalysis, entries: DtcEntry[], myDef?: MyDef): Hypothesis[] {
  const code = a.ref.code;
  const gen = entries.find((e) => e.cs?.length);
  const hyp: Hypothesis[] = [];
  const mk = (cat: string, w: number, detail: string, source: Hypothesis['source']): Hypothesis =>
    ({ key: `${code}|${cat}|${hyp.length}`, code, cat, text: CATS[cat] || CATS.other, detail, source, weight: w, pct: 0, seen: 0, status: '' });
  if (gen?.cs) {
    for (const [text, lk] of gen.cs) {
      if (violatesEmissionRule(text)) continue;
      let cat = causeCat(text);
      if (cat === 'other') cat = 'part';
      hyp.push(mk(cat, PRIOR[lk] ?? 1, text, 'base'));
    }
  }
  // Causes venues d'une fiche enregistrée par l'utilisateur (guidage Claude) : la première pèse le plus.
  if (!hyp.length && myDef?.causes?.length) {
    myDef.causes.forEach((text, i) => {
      if (violatesEmissionRule(text)) return;
      let cat = causeCat(text);
      if (cat === 'other') cat = 'part';
      hyp.push(mk(cat, i === 0 ? 4 : i < 3 ? 2 : 1, text, 'base'));
    });
  }
  if (!hyp.length) {
    const el = isElectrical(a.nature);
    let d: [string, number][];
    if (a.family.id === 'can') d = [['power', 3], ['network', 3], ['wiring', 2], ['ecu', 1]];
    else if (a.family.id === 'ecu') d = [['power', 3], ['wiring', 2], ['ecu', 2]];
    else if (a.family.kind === 'sensor') d = el ? [['wiring', 4], ['sensor', 3], ['power', 1], ['ecu', 0.5]] : [['sensor', 3], ['wiring', 2], ['clog', 1], ['mechanical', 1]];
    else if (a.family.kind === 'actuator') d = el ? [['wiring', 3], ['actuator', 3], ['power', 2], ['ecu', 0.5]] : [['actuator', 3], ['clog', 2], ['wiring', 2], ['power', 1]];
    else if (a.family.id === 'unknown') d = [['wiring', 2], ['power', 2], ['part', 2]];
    else d = [['part', 3], ['wiring', 2], ['clog', 1.5], ['sensor', 1.5], ['power', 1]];
    for (const [cat, w] of d) hyp.push(mk(cat, w, '', 'type'));
  }
  const boost = (cats: string[], f: number) => hyp.forEach((h) => { if (cats.includes(h.cat)) h.weight *= f; });
  if (isElectrical(a.nature)) boost(['wiring'], a.nature === 'intermittent' ? 2 : 1.5);
  if (a.nature === 'stuck') boost(['actuator', 'clog'], 1.5);
  if (a.nature === 'comm') boost(['power', 'network'], 1.5);
  return hyp;
}

function vehicleText(v: VehicleInfo) { return `${brandLabel(v.brand)} ${v.model} ${v.engine}`.toLowerCase(); }

export function matchKnown(v: VehicleInfo, codes: CodeRef[], sym: string): KnownMatch[] {
  const vt = vehicleText(v).trim();
  if (!vt) return [];
  const out: KnownMatch[] = [];
  for (const p of KNOWN) {
    if (!p.match.test(vt)) continue;
    const hit = codes.filter((c) => p.codes.test(c.code)).map((c) => c.code);
    if (hit.length || (p.sym && sym && p.sym.test(sym.toLowerCase()))) out.push({ pattern: p, codes: hit });
  }
  return out;
}

function synthesis(list: CodeAnalysis[], fuel: Fuel): { hints: string[]; shared: [string, string[]][] } {
  const codes = list.map((x) => x.ref.code);
  const hints: string[] = [];
  const comp: Record<string, string[]> = {};
  list.forEach((x) => new Set(x.components).forEach((k) => (comp[k] = comp[k] || []).push(x.ref.code)));
  const shared = Object.entries(comp).filter(([, v]) => v.length > 1).sort((a, b) => b[1].length - a[1].length).slice(0, 8);
  const fam = new Set(codes.map((c) => c[0]));
  const u = list.filter((x) => x.family.id === 'can').length;
  if (u >= 2 || (fam.size >= 3 && codes.length >= 4) || codes.length >= 6)
    hints.push('Beaucoup de codes sur des systèmes différents ou de communication : commence par la batterie, les masses et l’alimentation des calculateurs avant de suivre un code en particulier.');
  const elecSensors = list.filter((x) => x.family.kind === 'sensor' && isElectrical(x.nature));
  if (elecSensors.length >= 2)
    hints.push('Plusieurs capteurs en défaut électrique en même temps : ils partagent souvent la même alimentation 5 V ou la même masse. Un seul capteur en court-circuit peut faire tomber tous les autres : débranche-les un par un.');
  if (list.some((x) => x.family.id === 'misfire') && fuel !== 'diesel')
    hints.push('Ratés d’allumage : regarde si le raté suit la pièce. Permute bobine, puis bougie, puis injecteur avec un cylindre voisin.');
  if (list.some((x) => x.family.id === 'maf') && list.some((x) => x.family.id === 'mixture'))
    hints.push('Code débitmètre et code de richesse ensemble : traite le débitmètre en premier, c’est souvent lui qui fausse les correcteurs.');
  if (list.some((x) => x.family.id === 'misfire') && list.some((x) => x.family.id === 'catalyst'))
    hints.push('Ratés et code catalyseur ensemble : règle les ratés d’abord. Le code catalyseur en est souvent la conséquence.');
  if (list.some((x) => x.family.id === 'dpf') && list.some((x) => ['egr', 'turbo', 'glow', 'thermostat', 'injector'].includes(x.family.id)))
    hints.push('Filtre à particules avec un autre défaut moteur : le filtre se charge parce que l’autre défaut empêche les régénérations. Traite l’autre défaut d’abord.');
  if (list.some((x) => x.family.id === 'turbo') && list.some((x) => x.family.id === 'egr'))
    hints.push('Suralimentation et EGR ensemble : une vanne EGR qui reste ouverte fait chuter la pression de turbo. Contrôle la vanne en premier.');
  if (list.some((x) => x.family.id === 'vvt') && list.some((x) => x.family.id === 'oil'))
    hints.push('Calage et pression d’huile ensemble : arrête-toi sur l’huile. Niveau, norme, crépine et pression réelle avant tout le reste.');
  return { hints, shared };
}

/** Le cœur de l'appli : transforme des codes, un véhicule et des résultats de contrôle en diagnostic classé. */
export function diagnose(input: DiagInput): Diagnosis {
  const v = input.vehicle;
  const list = input.codes.map((c) => describe(c, v));
  list.forEach((a, i) => (a.hypotheses = baseHypotheses(a, input.codes[i].entries, input.codes[i].myDef)));
  const refs = list.map((a) => a.ref);
  const similar = findSimilar(input.cases, { codes: refs, vehicle: v, sym: input.sym }, input.excludeCaseId);
  const known = matchKnown(v, refs, input.sym);
  const globalHyp: Hypothesis[] = [];
  const steps: PlanStep[] = [];
  const byId = new Map<string, PlanStep>();
  const addStep = (t: TestDef, code: string, group: PlanStep['group']) => {
    const ex = byId.get(t.id);
    if (ex) { if (code && !ex.codes.includes(code)) ex.codes.push(code); return; }
    const s: PlanStep = { ...t, codes: code ? [code] : [], group, lowValue: false };
    byId.set(t.id, s); steps.push(s);
  };


  // 1. Tes cas résolus : ils passent avant tout le reste.
  const seenCause = new Map<string, Hypothesis>();
  for (const s of similar) {
    const c = s.case;
    if (c.status !== 'ok' || !c.cause || s.hidden || !s.sharedCodes.length) continue;
    const norm = c.cause.toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
    const existing = seenCause.get(norm);
    if (existing) { existing.seen++; existing.weight += 2; continue; }
    const cat = `u:${c.id}`;
    const vdesc = [brandLabel(c.brand).split(',')[0], c.model, c.engine].filter(Boolean).join(' ') || 'un véhicule';
    for (const code of s.sharedCodes) {
      const a = list.find((x) => x.ref.code === code);
      if (!a) continue;
      const h: Hypothesis = { key: `${code}|${cat}`, code, cat, text: c.cause, detail: `Ton cas du ${c.date} sur ${vdesc}`, source: 'cas', weight: 6 + s.score / 2, pct: 0, seen: 1, status: '' };
      a.hypotheses.unshift(h);
      if (!seenCause.has(norm)) seenCause.set(norm, h);
    }
    addStep({ id: cat, level: 0, title: `Déjà vu chez toi : ${c.cause.slice(0, 90)}${c.cause.length > 90 ? '…' : ''}`,
      how: `Sur ${vdesc}${c.km ? ' à ' + c.km + ' km' : ''}, la cause était : ${c.cause}${c.tests ? '\nContrôles faits à l’époque : ' + c.tests.split('\n').slice(0, 4).join(' ; ') : ''}${c.notes ? '\nPiège noté : ' + c.notes : ''}`,
      expect: 'Ce point est bon sur ce véhicule : ce n’est pas la même panne.',
      bad: `Même cause que la dernière fois.${c.fix ? ' Réparation faite alors : ' + c.fix : ''}`, targets: [cat], ok: { [cat]: 0.1 }, nok: { [cat]: 10 } }, s.sharedCodes[0], 'cas');
    s.sharedCodes.slice(1).forEach((code) => byId.get(cat)!.codes.push(code));
  }

  // 2. Pannes connues sur ce moteur.
  for (const k of known) {
    const p = k.pattern, cat = `k:${p.id}`;
    const targetsCodes = k.codes.length ? k.codes : [''];
    for (const code of targetsCodes) {
      const h: Hypothesis = { key: `${code}|${cat}`, code, cat, text: p.cause, detail: `Panne connue : ${p.engine}`, source: 'connue', weight: 5, pct: 0, seen: 0, status: '' };
      const a = list.find((x) => x.ref.code === code);
      if (a) a.hypotheses.splice(a.hypotheses.findIndex((x) => x.source !== 'cas') < 0 ? a.hypotheses.length : a.hypotheses.findIndex((x) => x.source !== 'cas'), 0, h);
      else globalHyp.push(h);
    }
    addStep({ id: cat, level: p.level, title: `Panne connue sur ${p.engine}`, how: p.check, expect: 'Ce point est bon : la panne connue est écartée.',
      bad: `${p.cause} ${p.fix}`, targets: [cat], ok: { [cat]: 0.1 }, nok: { [cat]: 10 } }, k.codes[0] || '', 'connue');
    k.codes.slice(1).forEach((code) => byId.get(cat)!.codes.push(code));
  }

  // 3. Contrôles par famille de composant.
  const { hints, shared } = synthesis(list, v.fuel);
  // Batterie et masses seulement quand plusieurs calculateurs se plaignent : là, c'est la cause n° 1.
  const many = list.filter((a) => a.family.id === 'can').length >= 2;
  if (many) { addStep(COMMON.BAT, '', 'test'); addStep(COMMON.GROUND, '', 'test'); }
  for (const a of list) for (const t of testsFor(a.family, a.nature, v.fuel)) addStep(t, a.ref.code, 'test');

  // 4. Effet des contrôles déjà faits.
  const hypsFor = (s: PlanStep): Hypothesis[] => {
    const own = list.filter((a) => !s.codes.length || s.codes.includes(a.ref.code)).flatMap((a) => a.hypotheses);
    return [...own, ...globalHyp];
  };
  for (const r of input.results) {
    const s = byId.get(r.testId);
    if (!s) continue;
    s.result = r;
    if (r.outcome === 'skip') continue;
    const eff = r.outcome === 'ok' ? (s.ok ?? Object.fromEntries(s.targets.map((t) => [t, 0.2]))) : (s.nok ?? Object.fromEntries(s.targets.map((t) => [t, 5])));
    const hs = hypsFor(s);
    for (const h of hs) {
      const f = eff[h.cat];
      if (f == null) continue;
      h.weight *= f;
      if (r.outcome === 'nok' && f > 1.9) h.status = 'confirmed';
      if (r.outcome === 'ok' && f <= 0.25 && h.status !== 'confirmed') h.status = 'cleared';
    }
    if (r.outcome === 'nok') {
      // Un contrôle mauvais sur une catégorie absente crée la piste.
      for (const cat of s.targets) {
        if (cat.includes(':') || (eff[cat] ?? 5) <= 1) continue;
        for (const a of list.filter((x) => !s.codes.length || s.codes.includes(x.ref.code))) {
          if (a.hypotheses.some((h) => h.cat === cat)) continue;
          a.hypotheses.push({ key: `${a.ref.code}|${cat}|t`, code: a.ref.code, cat, text: CATS[cat] || CATS.other, detail: `Mis en cause par le contrôle « ${s.title} »`, source: 'controle', weight: 3 * (eff[cat] ?? 5), pct: 0, seen: 0, status: 'confirmed' });
        }
      }
    }
  }

  // 5. Classement.
  for (const a of list) {
    const sum = a.hypotheses.reduce((n, h) => n + h.weight, 0) || 1;
    a.hypotheses.forEach((h) => (h.pct = Math.round((h.weight / sum) * 100)));
    a.hypotheses.sort((x, y) => y.weight - x.weight);
  }
  const all = [...list.flatMap((a) => a.hypotheses), ...globalHyp];
  const gsum = globalHyp.reduce((n, h) => n + h.weight, 0) || 1;
  globalHyp.forEach((h) => (h.pct = Math.round((h.weight / gsum) * 100)));
  const lead = all.slice().sort((x, y) => Number(y.status === 'confirmed') - Number(x.status === 'confirmed') || y.weight - x.weight)[0] || null;

  const order = { prelim: 0, cas: 1, connue: 2, test: 3 } as const;
  const score = (s: PlanStep) => hypsFor(s).filter((h) => s.targets.includes(h.cat) || (s.ok && h.cat in s.ok) || (s.nok && h.cat in s.nok)).reduce((n, h) => n + h.weight, 0);
  const idx = new Map(steps.map((s, i) => [s.id, i]));
  const scores = new Map(steps.map((s) => [s.id, score(s)]));
  steps.forEach((s) => { s.lowValue = s.group === 'test' && s.targets.length > 0 && !s.result && (scores.get(s.id) || 0) < 0.25 && s.id !== 'swap'; });
  steps.sort((a, b) => order[a.group] - order[b.group] || a.level - b.level || Number(b.targets.length === 0) - Number(a.targets.length === 0) || (scores.get(b.id)! - scores.get(a.id)!) || idx.get(a.id)! - idx.get(b.id)!);
  const pending = steps.filter((s) => !s.result);
  const next = pending.find((s) => !s.lowValue) || pending[0] || null;
  return { codes: list, hints, shared, similar, known, plan: steps, lead, next, progress: { done: steps.length - pending.length, total: steps.length } };
}

/** Texte prêt à coller dans Claude pour aller plus loin, avec tout le contexte. */
export function buildPrompt(input: DiagInput, d: Diagnosis, tool: string): string {
  const v = input.vehicle;
  const veh = [brandLabel(v.brand).split(',')[0], v.model, v.engine].filter(Boolean).join(' ');
  let t = `Tu es mon chef d’atelier, expert en diagnostic automobile. Guide-moi pour résoudre cette panne.\n`;
  t += `1. Explique en français simple ce que veut dire chaque code sur ce véhicule précis. Cherche sur le web si besoin, surtout pour les codes constructeur.\n`;
  t += `2. Donne les pannes connues de ce moteur pour ces codes.\n`;
  t += `3. Ensuite guide-moi : UNE seule vérification à la fois, avec où ça se trouve, comment mesurer et la valeur attendue. Attends ma réponse avant la suivante. Du moins cher au plus cher.\n`;
  t += `Je peux t’envoyer des photos de ma valise. Ne propose jamais de suppression de FAP, d’EGR ou d’AdBlue.\n\n`;
  t += `Véhicule : ${veh || 'non précisé'}${v.km ? ', ' + v.km + ' km' : ''}\nValise : ${tool || 'non précisée'}\nSymptômes : ${input.sym || 'non précisés'}\nCodes :\n`;
  for (const a of d.codes.slice(0, 10)) {
    t += `- ${formatCode(a.ref)}${a.ftLabel ? ' (' + a.ftLabel + ')' : ''} : ${a.titleOrig || a.title || a.ref.label || 'pas dans ma base, à identifier'}\n`;
  }
  const done = d.plan.filter((s) => s.result && s.result.outcome !== 'skip').slice(0, 8);
  if (done.length) t += `Déjà contrôlé :\n` + done.map((s) => `- ${s.title} : ${s.result!.outcome === 'ok' ? 'bon' : 'MAUVAIS'}${s.result!.measured ? ' (' + s.result!.measured + ')' : ''}`).join('\n') + '\n';
  const sim = d.similar.filter((s) => s.case.cause && !s.hidden).slice(0, 2);
  if (sim.length) t += `Mes cas réels proches :\n` + sim.map((s) => `- ${[brandLabel(s.case.brand).split(',')[0], s.case.model, s.case.engine].filter(Boolean).join(' ')} : ${s.case.cause.slice(0, 160)}`).join('\n') + '\n';
  return t + '\n' + FICHE_INSTRUCTION;
}

/** Lien qui ouvre Claude avec le dossier déjà rempli. */
export function claudeLink(prompt: string): string {
  return 'https://claude.ai/new?q=' + encodeURIComponent(prompt.slice(0, 3200));
}

export { TEST_BY_ID };
