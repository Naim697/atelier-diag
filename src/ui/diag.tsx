import { useEffect, useMemo, useState } from 'preact/hooks';
import type { App } from './app';
import { emptyDraft } from './app';
import type { Case, DtcEntry, Fuel, StepOutcome, StepResult } from '../core/types';
import { blankCase, deletePhoto, lookupCodes, putCase, putDef, type Draft } from '../db/db';
import { parseDictation } from '../core/voice';
import { codesToText, formatCode, parseCodes } from '../core/codes';
import { BRANDS, brandLabel, detectBrand } from '../core/brands';
import { buildPrompt, claudeLink, diagnose, type CodeAnalysis, type Diagnosis, type Hypothesis, type PlanStep } from '../core/engine';
import { LEVELS } from '../core/testlib';
import { CATS } from '../core/classify';
import { parseFiches } from '../core/fiche';
import { violatesEmissionRule } from '../core/guard';
import { ConfirmButton, Field, Fold, Icon, Mic, PhotoStrip, Select, TextMic } from './bits';

const FUELS: [string, string][] = [['', 'Carburant'], ['essence', 'Essence'], ['diesel', 'Diesel'], ['hybride', 'Hybride'], ['gpl', 'GPL ou E85'], ['electrique', 'Électrique']];
const DIFF: Record<string, string> = { easy: 'Facile', medium: 'Moyenne', hard: 'Difficile', expert: 'Expert', shop_only: 'Atelier équipé' };
const OUT: Record<StepOutcome, string> = { ok: 'Bon', nok: 'Mauvais', skip: 'Passé' };

export function resultsToText(d: Diagnosis | null, results: StepResult[]): string {
  return results.filter((r) => r.outcome !== 'skip').map((r) => `${d?.plan.find((s) => s.id === r.testId)?.title || r.title} : ${r.outcome === 'ok' ? 'bon' : 'MAUVAIS'}${r.measured ? ' (' + r.measured + ')' : ''}`).join('\n');
}

export function draftToCase(draft: Draft, d: Diagnosis | null, existing?: Case): Case {
  const base = existing || blankCase(draft.caseId ? { id: draft.caseId } : {});
  return { ...base, ...draft.vehicle, codes: draft.codes, codeStatus: draft.codeStatus, sym: draft.sym, live: draft.live, steps: draft.results, tests: resultsToText(d, draft.results) || base.tests, photoIds: draft.photoIds };
}

export function DiagView({ app }: { app: App }) {
  const { draft, db } = app;
  const set = (patch: Partial<Draft>) => app.setDraft({ ...draft, ...patch });
  const setV = (patch: Partial<Draft['vehicle']>) => set({ vehicle: { ...draft.vehicle, ...patch } });
  const [entries, setEntries] = useState<Record<string, DtcEntry[]>>({});
  const [interim, setInterim] = useState('');
  const [openStep, setOpenStep] = useState('');
  const [showAll, setShowAll] = useState(false);

  const key = draft.codes.map((c) => c.code).join(',');
  useEffect(() => { let alive = true; void lookupCodes(db, draft.codes.map((c) => c.code)).then((r) => { if (alive) setEntries(r); }); return () => { alive = false; }; }, [key, app.packs]);

  const diag = useMemo<Diagnosis | null>(() => {
    if (!draft.started) return null;
    if (draft.codes.some((c) => !(c.code in entries))) return null;
    return diagnose({
      codes: draft.codes.map((ref) => ({ ref, entries: entries[ref.code] || [], myDef: app.defs.find((x) => x.code === ref.code) })),
      vehicle: draft.vehicle, sym: draft.sym, cases: app.cases, results: draft.results, excludeCaseId: draft.caseId || undefined,
    });
  }, [draft, entries, app.cases, app.defs]);

  const launch = () => {
    const p = parseDictation(draft.input);
    const brand = draft.vehicle.brand || p.brand;
    const codes = parseCodes(joinInput(draft.input), { hexHint: brand === 'BMW' });
    const finalCodes = codes.length ? codes : p.codes;
    const sym = draft.sym || (finalCodes.length || p.brand || p.km ? p.sym : draft.input.trim());
    if (!finalCodes.length && !sym.trim()) { app.toast('Entre au moins un code ou un symptôme.'); return; }
    const sameCodes = codesToText(finalCodes) === codesToText(draft.codes);
    const v = draft.vehicle;
    set({
      codes: finalCodes, started: true, sym, results: sameCodes ? draft.results : [],
      vehicle: { plate: v.plate || p.plate, brand, model: v.model || p.model, engine: v.engine || p.engine, fuel: v.fuel || p.fuel, km: v.km ?? p.km },
    });
    setOpenStep(''); setShowAll(false);
    setTimeout(() => document.getElementById('result')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
  };

  const record = (s: PlanStep, outcome: StepOutcome, measured?: string) => {
    const r: StepResult = { testId: s.id, title: s.title, outcome, measured: measured ?? s.result?.measured, at: new Date().toISOString() };
    set({ results: [...draft.results.filter((x) => x.testId !== s.id), r] });
    setOpenStep('');
  };
  const undo = (s: PlanStep) => set({ results: draft.results.filter((x) => x.testId !== s.id) });

  const reset = async () => {
    if (!draft.caseId) for (const id of draft.photoIds) await deletePhoto(db, id);
    app.setDraft(emptyDraft()); setEntries({}); window.scrollTo(0, 0);
  };

  const saveWip = async () => {
    const existing = draft.caseId ? app.cases.find((c) => c.id === draft.caseId) : undefined;
    const c = await putCase(db, draftToCase(draft, diag, existing));
    set({ caseId: c.id }); await app.reload(); app.toast('Fiche enregistrée, tu peux reprendre plus tard.');
  };

  const close = (h?: Hypothesis) => {
    const existing = draft.caseId ? app.cases.find((c) => c.id === draft.caseId) : undefined;
    const c = draftToCase(draft, diag, existing);
        const cause = h ? (h.source === 'base' ? (h.detail && isFrench(h.detail) ? h.detail : '') : h.source === 'type' || h.source === 'controle' ? '' : h.text) : c.cause;
    app.editCase({ ...c, status: 'ok', cause, causeCat: h && !h.cat.includes(':') ? h.cat : c.causeCat }, (saved) => {
      if (saved.status === 'ok') { app.setDraft(emptyDraft()); app.toast('Cas résolu enregistré. Il ressortira en premier la prochaine fois.'); window.scrollTo(0, 0); }
      else set({ caseId: saved.id });
    });
  };

  const copyPrompt = async () => {
    if (!diag) return;
    const text = buildPrompt({ codes: [], vehicle: draft.vehicle, sym: draft.sym, cases: app.cases, results: draft.results }, diag, app.settings.tool);
    try { await navigator.clipboard.writeText(text); app.toast('Copié. Colle-le dans Claude.'); }
    catch { app.toast('Copie bloquée par le navigateur.'); }
  };

  const v = draft.vehicle;
  const vehSummary = [v.plate, brandLabel(v.brand).split(',')[0], v.model, v.engine, v.km ? v.km.toLocaleString('fr-FR') + ' km' : ''].filter(Boolean).join(' · ');
  const preview = useMemo(() => (draft.input.trim() ? parseDictation(draft.input) : null), [draft.input]);

  return (
    <>
      <section class="readout">
        <label for="input">Codes, véhicule, symptômes : tape ou dicte tout d’un trait</label>
        <textarea id="input" value={draft.input + (interim ? ' ' + interim : '')} autocapitalize="characters" spellcheck={false} placeholder="P0299 Clio 4 1.5 dCi 148 000 km perte de puissance"
          onInput={(e) => set({ input: (e.target as HTMLTextAreaElement).value })} />
        {preview && (preview.codes.length > 0 || preview.brand) && (
          <div class="chips">
            {preview.codes.map((c) => <span class="chip code" key={c.code}>{formatCode(c)}</span>)}
            {preview.brand && !v.brand && <span class="chip">{brandLabel(preview.brand).split(',')[0]}</span>}
            {preview.engine && !v.engine && <span class="chip">{preview.engine}</span>}
            {preview.km != null && v.km == null && <span class="chip">{preview.km.toLocaleString('fr-FR')} km</span>}
          </div>
        )}
        <div class="row" style="margin-top:12px">
          <Mic big toast={app.toast} label="Dicter" onInterim={setInterim} onText={(t) => set({ input: (draft.input ? draft.input.trim() + ' ' : '') + t })} />
          <button class="btn pri grow" onClick={launch}><Icon.search />{draft.started ? 'Relancer' : 'Chercher la panne'}</button>
        </div>
      </section>

      <Fold title="Véhicule et relevés" hint={vehSummary || 'rend la recherche plus précise'}>
        <div class="grid">
          <Field id="v_plate" label="Immatriculation ou VIN" value={v.plate} onChange={(x) => setV({ plate: x.toUpperCase() })} placeholder="AB-123-CD" upper full />
          <Select id="v_brand" label="Marque" value={v.brand in BRANDS || !v.brand ? v.brand : ''} onChange={(x) => setV({ brand: x })} options={[['', 'Marque inconnue'], ...Object.entries(BRANDS).sort((a, b) => a[1].localeCompare(b[1]))]} />
          <Field id="v_model" label="Modèle et année" value={v.model} onChange={(x) => setV({ model: x, brand: v.brand || detectBrand(x) })} placeholder="308 II 2016" />
          <Field id="v_engine" label="Moteur" value={v.engine} onChange={(x) => setV({ engine: x })} placeholder="1.6 BlueHDi 120" />
          <Select id="v_fuel" label="Carburant" value={v.fuel} onChange={(x) => setV({ fuel: x as Fuel })} options={FUELS} />
          <Field id="v_km" label="Kilométrage" value={v.km == null ? '' : String(v.km)} onChange={(x) => { const n = parseInt(x.replace(/\D/g, ''), 10); setV({ km: Number.isFinite(n) ? n : null }); }} inputmode="numeric" placeholder="148000" />
          <Select id="v_state" label="Statut des codes" value={draft.codeStatus} onChange={(x) => set({ codeStatus: x })} options={[['', 'Non précisé'], ['Permanent', 'Permanent'], ['Intermittent', 'Intermittent'], ['Mémorisé', 'Mémorisé'], ['Revient après effacement', 'Revient après effacement']]} />
          <TextMic id="v_sym" label="Symptômes" value={draft.sym} onChange={(x) => set({ sym: x })} toast={app.toast} placeholder="Trou à l’accélération à froid, voyant moteur allumé…" />
          <TextMic id="v_live" label="Freeze frame et données live" value={draft.live} onChange={(x) => set({ live: x })} toast={app.toast} placeholder="Régime 2100, charge 62 %, LTFT +18 %, eau 88 °C…" />
        </div>
        <p class="lbl" style="margin:12px 0 0">Photos : écran de la valise, pièce, connecteur</p>
        <PhotoStrip db={db} ownerId={draft.caseId || 'brouillon'} ids={draft.photoIds} onChange={(ids) => set({ photoIds: ids })} toast={app.toast} />
      </Fold>

      {!draft.started && <Welcome app={app} />}
      {draft.started && !diag && <p class="note">Lecture des bases…</p>}
      {diag && (
        <div id="result">
          {diag.codes.map((a) => <CodeCard key={a.ref.code} a={a} app={app} brand={v.brand} onItWas={close} onAdd={(c) => { set({ input: (draft.input + ' ' + c).trim() }); app.toast(c + ' ajouté : touche « Relancer »'); }} />)}

          <div class="card accent"><div class="bd">
            <h2>Me faire guider pas à pas</h2>
            <p class="note">Claude reçoit tout le dossier (codes, véhicule, symptômes, contrôles déjà faits), t’explique le code en français, cherche les pannes connues sur le web et te guide une vérification à la fois. Tu peux lui parler et lui envoyer des photos de la valise.</p>
            <a class="btn pri block" href={claudeLink(buildPrompt({ codes: [], vehicle: draft.vehicle, sym: draft.sym, cases: app.cases, results: draft.results }, diag, app.settings.tool))} target="_blank" rel="noopener">Ouvrir le guidage dans Claude</a>
            <button class="btn small ghost block" style="margin-top:8px" onClick={copyPrompt}>Ou copier le dossier</button>
            <PasteFiche app={app} />
          </div></div>
          {diag.plan.length > 0 && <LeadCard d={diag} onClose={close} />}
          <Similar d={diag} app={app} />
          {diag.known.length > 0 && (
            <div class="card info"><div class="bd">
              <h2>Panne connue sur ce moteur</h2>
              {diag.known.map((k) => (
                <div key={k.pattern.id} style="margin-top:8px">
                  <b>{k.pattern.engine}</b>{k.codes.length > 0 && <span class="muted"> · {k.codes.join(', ')}</span>}
                  <div>{k.pattern.cause}</div>
                </div>
              ))}
              <p class="note">Connaissance générale d’atelier, pas un de tes cas : le plan ci-dessous contient le contrôle qui confirme ou écarte.</p>
            </div></div>
          )}
          {(diag.hints.length > 0 || diag.shared.length > 0) && (
            <div class="card accent"><div class="bd">
              <h2>Ce qui relie tes codes</h2>
              {diag.hints.map((h) => <div class="hint" key={h}>{h}</div>)}
              {diag.shared.length > 0 && <p class="note">Pièces communes à plusieurs codes : {diag.shared.map(([k, c]) => `${k} (${c.join(', ')})`).join(' ; ')}.</p>}
            </div></div>
          )}

          {diag.plan.length > 0 && <div class="card"><div class="bd">
            <div class="row between"><h2>Contrôles à faire sur ce code</h2><span class="tag">{diag.progress.done} / {diag.progress.total}</span></div>
            <p class="note">Du moins cher au plus cher. Dis « bon » ou « mauvais » à chaque contrôle : les pistes se reclassent toutes seules.</p>
            {(showAll ? diag.plan : visibleSteps(diag)).map((s, i) => (
              <Step key={s.id} s={s} n={diag.plan.indexOf(s) + 1} open={openStep ? openStep === s.id : diag.next?.id === s.id} first={i === 0}
                toggle={() => setOpenStep(openStep === s.id || (!openStep && diag.next?.id === s.id) ? '-' : s.id)} record={record} undo={undo} app={app} />
            ))}
            {!showAll && visibleSteps(diag).length < diag.plan.length && <button class="btn small ghost block" style="margin-top:8px" onClick={() => setShowAll(true)}>Voir les {diag.plan.length - visibleSteps(diag).length} contrôles suivants</button>}
          </div></div>}


          <div class="card"><div class="bd">
            <div class="row">
              <button class="btn good grow" onClick={() => close(diag.lead?.status === 'confirmed' ? diag.lead : undefined)}><Icon.check />Panne trouvée</button>
              <button class="btn grow" onClick={saveWip}>Enregistrer et reprendre plus tard</button>
            </div>
            <div class="row" style="margin-top:8px">
              <ConfirmButton class="small ghost grow" label="Nouvelle recherche" confirm="Effacer cette recherche ?" onConfirm={() => void reset()} />
            </div>
          </div></div>
        </div>
      )}
    </>
  );
}

const isFrench = (t: string) => /[éèêàçùî’]|\b(de|du|la|le|les|en|ou|au|un|une)\b/i.test(t);
/** Titre et sous-titre d'une piste : le texte précis en français d'abord, la catégorie ensuite. */
function hypLabel(h: Hypothesis): [string, string] {
  if (h.source === 'base' && h.detail && isFrench(h.detail)) return [h.detail, CATS[h.cat] || ''];
  if (h.source === 'cas' || h.source === 'connue') return [h.text, h.detail];
  return [h.text, h.detail && h.detail !== h.text ? h.detail : h.source === 'type' ? 'Déduit du type de composant et de défaut' : ''];
}

/** Enregistre dans la base du téléphone la fiche que Claude écrit à la fin du guidage. */
export function PasteFiche({ app }: { app: App }) {
  const [manual, setManual] = useState(false);
  const [text, setText] = useState('');
  const save = async (raw: string) => {
    const fiches = parseFiches(raw).filter((f) => !violatesEmissionRule(`${f.text} ${f.causes.join(' ')} ${f.checks}`));
    if (!fiches.length) { setManual(true); app.toast('Pas de fiche trouvée. Copie le bloc « FICHE ATELIER DIAG » de Claude, puis colle-le ici.'); return; }
    for (const f of fiches) await putDef(app.db, { code: f.code, brand: f.brand, text: f.text, notes: f.checks ? 'Contrôles : ' + f.checks : '', causes: f.causes });
    await app.reload(); setText(''); setManual(false);
    app.toast(`${fiches.map((f) => f.code).join(', ')} enregistré${fiches.length > 1 ? 's' : ''} dans ta base. Le code sera reconnu la prochaine fois.`);
  };
  const fromClipboard = async () => {
    try { const t = await navigator.clipboard.readText(); if (t.trim()) { await save(t); return; } } catch { /* lecture refusée : on passe à la saisie */ }
    setManual(true);
  };
  return (
    <div style="margin-top:12px;border-top:1px solid var(--line);padding-top:12px">
      <p class="note" style="margin-top:0">À la fin du guidage, Claude écrit une fiche du code. Copie-la, reviens ici et enregistre-la : le code sera dans ta base pour toujours.</p>
      <button class="btn block" onClick={() => void fromClipboard()}>Coller la fiche de Claude</button>
      {manual && (
        <div class="f" style="margin-top:8px">
          <label for="fiche_txt">Colle ici la fiche copiée depuis Claude</label>
          <textarea id="fiche_txt" rows={5} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} placeholder="FICHE ATELIER DIAG&#10;CODE: …" />
          <button class="btn pri" onClick={() => void save(text)}>Enregistrer la fiche</button>
        </div>
      )}
    </div>
  );
}

function joinInput(s: string) { return parseDictation(s).codes.length ? codesToText(parseDictation(s).codes) + ' ' + s : s; }

/** Par défaut : les contrôles déjà faits, le prochain, et les quatre suivants. */
function visibleSteps(d: Diagnosis): PlanStep[] {
  let pending = 0;
  return d.plan.filter((s) => s.result || (!s.lowValue && pending++ < 5));
}

function Welcome({ app }: { app: App }) {
  const solved = app.cases.filter((c) => c.status === 'ok').length;
  return (
    <div class="card"><div class="bd">
      <h2>Comment ça marche</h2>
      <ol style="padding-left:20px;margin:8px 0">
        <li>Relève tous les codes et le freeze frame avant d’effacer quoi que ce soit.</li>
        <li>Dicte ou tape tout en une phrase : codes, voiture, kilométrage, symptômes.</li>
        <li>Suis le plan : un contrôle à la fois, du gratuit vers le coûteux, et réponds bon ou mauvais.</li>
        <li>Quand c’est trouvé, touche « Panne trouvée » : la cause réelle rejoint ta base et ressortira en premier.</li>
      </ol>
      <p class="note">{app.cases.length ? `${app.cases.length} cas dans ta base, dont ${solved} résolu${solved > 1 ? 's' : ''}.` : 'Ta base de cas est vide pour l’instant.'} Pas de code ? Décris seulement les symptômes et le véhicule.</p>
    </div></div>
  );
}

function LeadCard({ d, onClose }: { d: Diagnosis; onClose(h: Hypothesis): void }) {
  const h = d.lead;
  if (!h) return null;
  const confirmed = h.status === 'confirmed';
  return (
    <div class="lead">
      <div class="k">{confirmed ? 'Cause mise en évidence' : d.progress.done ? 'Piste n° 1 pour l’instant' : 'Piste de départ'}{h.code ? ' · ' + h.code : ''}</div>
      <div class="v">{hypLabel(h)[0]}</div>
      <div class="d">{hypLabel(h)[1] || 'D’après la base de codes'}{h.seen > 1 ? ` · vu ${h.seen} fois chez toi` : ''}</div>
      <div class="bar"><i style={`width:${Math.max(4, h.pct)}%`} /></div>
      <div class="row between" style="margin-top:10px">
        <span class="d">{d.next ? `Prochain contrôle : ${d.next.title}` : 'Tous les contrôles sont faits.'}</span>
        {confirmed && <button class="btn small pri" onClick={() => onClose(h)}>C’était ça</button>}
      </div>
    </div>
  );
}

function Similar({ d, app }: { d: Diagnosis; app: App }) {
  if (!d.similar.length) return null;
  return (
    <div class="card ok"><div class="bd">
      <h2>Déjà vu dans tes cas ({d.similar.length})</h2>
      {d.similar.slice(0, 5).map((s) => {
        const c = s.case;
        return (
          <button class="item" key={c.id} onClick={() => app.editCase(c)}>
            <div class="t1"><b>{[brandLabel(c.brand).split(',')[0], c.model, c.engine].filter(Boolean).join(' ') || 'Véhicule non précisé'}</b><span class={`status ${c.status}`}>{c.status === 'ok' ? 'Résolu' : 'En cours'}</span></div>
            <div class="muted" style="font-size:14px">{codesToText(c.codes) || 'Sans code'} · {s.why.join(', ')}{c.km ? ` · ${c.km.toLocaleString('fr-FR')} km` : ''}</div>
            {c.cause && !s.hidden && <div style="margin-top:4px"><b>Cause : </b>{c.cause}</div>}
            {s.hidden && <div class="note">Réparation non reprise comme suggestion (règle antipollution).</div>}
          </button>
        );
      })}
    </div></div>
  );
}

function Step(props: { s: PlanStep; n: number; open: boolean; first: boolean; toggle(): void; record(s: PlanStep, o: StepOutcome, m?: string): void; undo(s: PlanStep): void; app: App }) {
  const { s } = props;
  const [measured, setMeasured] = useState(s.result?.measured || '');
  useEffect(() => setMeasured(s.result?.measured || ''), [s.result?.measured, s.id]);
  const st = s.result?.outcome || '';
  const info = s.targets.length === 0;
  return (
    <div class={`step ${st}${s.lowValue ? ' low' : ''}`}>
      <button class="hd" onClick={props.toggle} aria-expanded={props.open}>
        <span class="n">{st === 'ok' ? '✓' : st === 'nok' ? '!' : props.n}</span>
        <span class="grow">
          <span class="t">{s.title}</span>
          <span class="meta">
            <span class={`tag ${s.group === 'cas' ? 'g' : s.group === 'connue' ? 'b' : s.level === 0 ? 'g' : s.level >= 4 ? 'r' : 'a'}`}>{s.group === 'cas' ? 'Ton cas' : s.group === 'connue' ? 'Panne connue' : LEVELS[s.level]}</span>
            {s.codes.slice(0, 4).map((c) => <span class="tag" key={c}>{c}</span>)}
            {st && <span class={`tag ${st === 'ok' ? 'g' : st === 'nok' ? 'r' : ''}`}>{OUT[st]}{s.result?.measured ? ' : ' + s.result.measured : ''}</span>}
            {s.lowValue && <span class="tag">peu utile maintenant</span>}
          </span>
        </span>
      </button>
      {props.open && (
        <div class="body">
          <p>{s.how}</p>
          <div class="exp"><b>Résultat attendu</b>{s.expect}</div>
          {!info && <div class="badc"><b>Si c’est mauvais</b>{s.bad}</div>}
          {!info && (
            <div class="withmic" style="margin-bottom:8px">
              <input class="search" value={measured} placeholder="Valeur mesurée (facultatif)" onInput={(e) => setMeasured((e.target as HTMLInputElement).value)} aria-label="Valeur mesurée" />
              <Mic toast={props.app.toast} label="Dicter la valeur mesurée" onText={(t) => setMeasured((measured ? measured + ' ' : '') + t)} />
            </div>
          )}
          <div class="row">
            {info ? <button class="btn good grow" onClick={() => props.record(s, 'ok')}>Fait</button> : (
              <>
                <button class="btn good grow" onClick={() => props.record(s, 'ok', measured)}>Bon</button>
                <button class="btn badb grow" onClick={() => props.record(s, 'nok', measured)}>Mauvais</button>
              </>
            )}
            <button class="btn ghost" onClick={() => props.record(s, 'skip')}>Passer</button>
            {st && <button class="btn ghost" onClick={() => props.undo(s)}>Annuler</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function CodeCard({ a, app, brand, onItWas, onAdd }: { a: CodeAnalysis; app: App; brand: string; onItWas(h: Hypothesis): void; onAdd(code: string): void }) {
  const [editDef, setEditDef] = useState(false);
  const [defText, setDefText] = useState(a.myDef?.text || a.ref.label || '');
  const [defNotes, setDefNotes] = useState(a.myDef?.notes || '');
  const r = a.repair;
  const saveDef = async () => {
    if (!defText.trim()) { app.toast('Écris au moins la définition.'); return; }
    await putDef(app.db, { id: a.myDef?.id, code: a.ref.code, brand: a.myDef?.brand || brandLabel(brand), text: defText.trim(), notes: defNotes.trim() });
    await app.reload(); setEditDef(false); app.toast('Définition enregistrée');
  };
  const groups: Record<string, typeof a.variants> = {};
  a.variants.forEach((x) => (groups[x[0]] = groups[x[0]] || []).push(x));
  return (
    <article class="card"><div class="bd">
      <div class="codehd">
        <div class="code">{a.ref.code}{a.ref.ft != null && <small>-{a.ref.ft.toString(16).toUpperCase().padStart(2, '0')}</small>}</div>
        <div class="grow">
          <div class="ttl">{a.title || (a.otherBrands.length ? 'Code constructeur : choisis la marque' : 'Code absent des bases')}</div>
          {a.titleOrig && <div class="orig">{a.titleOrig}</div>}
        </div>
      </div>
      <div class="chips" style="margin-top:8px">
        <span class="tag b">{a.family.label}</span>
        {a.ftLabel && <span class="tag a">Type {a.ref.ft!.toString(16).toUpperCase().padStart(2, '0')} : {a.ftLabel}</span>}
        {a.flags.includes('M') && <span class="tag a">Allume le voyant</span>}
        {a.flags.includes('L') && <span class="tag r">Mode dégradé possible</span>}
        {a.flags.includes('E') && <span class="tag">Antipollution</span>}
        {a.flags.includes('D') && <span class="tag">Cycle de conduite pour valider</span>}
      </div>
      {a.ref.label && <p class="note"><b>Affiché par la valise :</b> {a.ref.label}</p>}
      {a.oemTitle && <div class="hint"><b>Sens constructeur :</b> {a.oemTitle}</div>}
      {a.myDef && <div class="seen"><b>Ta définition{a.myDef.brand ? ` (${a.myDef.brand})` : ''} :</b> {a.myDef.text}{a.myDef.notes && <div style="margin-top:4px">{a.myDef.notes}</div>}</div>}
      {!a.documented && (
        <div class="hint">
          {a.ref.format === 'df' ? 'Code Renault DF : son sens dépend du calculateur et il n’existe pas de base libre fiable.' : a.ref.format === 'hex' ? 'Code hexadécimal constructeur : pas de base libre fiable.' : 'Ce code n’est dans aucune base installée.'} Touche « Ouvrir le guidage dans Claude » : il cherchera ce code pour ce véhicule. Tu peux aussi noter ci-dessous le libellé de ta valise, il sera gardé.
        </div>
      )}

      {a.documented && <h3>Causes, de la plus probable à la moins probable</h3>}
      {a.documented && a.hypotheses.slice(0, 7).map((h) => (
        <div class={`hyp ${h.status}`} key={h.key}>
          <div class="l"><b>{hypLabel(h)[0]}</b><span class="pc">{h.pct} %</span></div>
          <div class="barh"><i style={`width:${h.pct}%`} /></div>
          <div class="row between">
            <small>{hypLabel(h)[1]}{h.seen > 1 ? ` · ${h.seen} fois chez toi` : ''}{h.status === 'cleared' ? ' · écartée par un contrôle' : h.status === 'confirmed' ? ' · mise en cause par un contrôle' : ''}</small>
            <button class="btn small ghost" onClick={() => onItWas(h)}>C’était ça</button>
          </div>
        </div>
      ))}

      {(a.desc || a.symptoms.length > 0 || r || a.related.length > 0 || a.system) && (
        <details class="fold" style="margin:12px 0 0"><summary>Explication détaillée<span>en anglais, seuils constructeurs</span></summary><div class="bd">
          {a.system && <p class="note">{a.system}</p>}
          {a.desc && <p class="desc">{a.desc}</p>}
          {a.symptoms.length > 0 && <><h3>Symptômes typiques</h3><ul>{a.symptoms.map((s) => <li key={s}>{s}</li>)}</ul></>}
          {r && <div class="facts">
            <div class="fact"><b>{DIFF[r[0]] || r[0] || '?'}</b><span>Difficulté</span></div>
            {r[2] && <div class="fact"><b>{r[2][0]} à {r[2][1]} €</b><span>Coût garage indicatif</span></div>}
            {r[3] && <div class="fact"><b>{r[3][0]} à {r[3][1]} h</b><span>Temps</span></div>}
          </div>}
          {a.components.length > 0 && <p class="note">Pièces concernées : {a.components.join(', ')}</p>}
          {a.related.length > 0 && <><h3>Codes liés</h3><div class="row">{a.related.slice(0, 12).map((c) => <button class="chip" key={c} onClick={() => onAdd(c)}>{c}</button>)}</div></>}
          {a.sources.length > 0 && <p class="note">Sources : {a.sources.join(', ')}.</p>}
        </div></details>
      )}
      {a.otherBrands.length > 0 && (
        <details class="fold" style="margin:12px 0 0"><summary>Sens selon la marque ({a.otherBrands.length})</summary><div class="bd"><ul class="plain">{a.otherBrands.map(([b, t]) => <li key={b} style="padding:4px 0"><b>{b.split(',')[0]}</b> : {t}</li>)}</ul></div></details>
      )}
      {a.variants.length > 0 && (
        <details class="fold" style="margin:12px 0 0" open={brand === 'PSA' && a.variants.length <= 6}><summary>Définitions Peugeot, Citroën, DS ({a.variants.length})</summary><div class="bd">
          {Object.entries(groups).slice(0, 12).map(([ecu, arr]) => (
            <div key={ecu} style="padding:6px 0;border-top:1px solid var(--line)"><b>{ecu}</b>
              {arr.slice(0, 4).map((e, i) => (
                <div key={i} style="padding:3px 0">{e[1]}
                  {e[2].length > 0 && <div class="ft">Type de défaut : {e[2].slice(0, 10).map((f, j) => { const [k, val] = f.split('='); const n = parseInt(k, 16); const txt = `${n.toString(16).toUpperCase().padStart(2, '0')} ${val}`; return <span key={j}>{j > 0 && ' ; '}{a.ref.ft === n ? <mark>{txt}</mark> : txt}</span>; })}</div>}
                </div>
              ))}
              {arr.length > 4 && <div class="ft">+ {arr.length - 4} autres variantes</div>}
            </div>
          ))}
          <p class="note">Tape le code avec son octet (ex. {a.ref.code}-13) pour surligner le type de défaut.</p>
        </div></details>
      )}

      {editDef ? (
        <div class="grid" style="margin-top:12px">
          <TextMic id={'def_' + a.ref.code} label={`Définition de ${a.ref.code}, telle que ta valise l’affiche`} value={defText} onChange={setDefText} toast={app.toast} rows={2} />
          <TextMic id={'defn_' + a.ref.code} label="Notes : pièce, emplacement, piège" value={defNotes} onChange={setDefNotes} toast={app.toast} rows={2} />
          <div class="row f full"><button class="btn pri grow" onClick={() => void saveDef()}>Enregistrer</button><button class="btn ghost" onClick={() => setEditDef(false)}>Annuler</button></div>
        </div>
      ) : <button class="btn small ghost" style="margin-top:12px" onClick={() => setEditDef(true)}>{a.myDef ? 'Modifier ma définition' : 'Ajouter ma définition'}</button>}
    </div></article>
  );
}
