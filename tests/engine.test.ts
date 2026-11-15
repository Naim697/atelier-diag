import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { diagnose, buildPrompt, type CodeInput, type DiagInput } from '../src/core/engine';
import { parseCodes } from '../src/core/codes';
import { blankCase } from '../src/db/db';
import { violatesEmissionRule } from '../src/core/guard';
import type { DtcEntry, PackFile, StepResult, VehicleInfo, MyDef } from '../src/core/types';

const packs = ['generique', 'constructeurs', 'psa', 'vag5', 'bmw-hex'].map((id) => JSON.parse(gunzipSync(readFileSync(new URL(`../public/packs/${id}.json.gz`, import.meta.url))).toString()) as PackFile);
const byCode = new Map<string, DtcEntry[]>();
for (const p of packs) for (const e of p.entries) { const l = byCode.get(e.code) || []; l.push({ ...e, id: `${p.id}|${e.code}`, pack: p.id }); byCode.set(e.code, l); }

const veh = (o: Partial<VehicleInfo> = {}): VehicleInfo => ({ plate: '', brand: '', model: '', engine: '', fuel: '', km: null, ...o });
const inputs = (text: string, defs: Record<string, MyDef> = {}): CodeInput[] => parseCodes(text, { hexHint: true }).map((ref) => ({ ref, entries: byCode.get(ref.code) || [], myDef: defs[ref.code] }));
const mk = (text: string, o: Partial<DiagInput> = {}): DiagInput => ({ codes: inputs(text), vehicle: veh(), sym: '', cases: [], results: [], ...o });
const res = (testId: string, outcome: StepResult['outcome']): StepResult => ({ testId, title: '', outcome, at: '' });

describe('paquets livrés', () => {
  it('contiennent les quatre bases et aucune proposition interdite', () => {
    expect(packs.map((p) => p.entries.length)).toEqual([9533, 9212, 5778, 7131, 15]);
    for (const p of packs) for (const e of p.entries) {
      for (const t of [e.t, e.tf, e.d, ...(e.s || []), ...(e.cs || []).map((c) => c[0])]) expect(violatesEmissionRule(t), `${p.id} ${e.code}: ${t}`).toBe(false);
    }
  });
});

describe('moteur de diagnostic', () => {
  it('P0171 essence : plan du moins cher au plus cher, piste prise d’air en tête', () => {
    const d = diagnose(mk('P0171', { vehicle: veh({ fuel: 'essence' }) }));
    expect(d.codes[0].title).toMatch(/pauvre/i);
    expect(d.codes[0].family.id).toBe('mixture');
    expect(d.lead?.cat).toBe('air_leak');
    expect(d.plan[0].id).toBe('prelim');
    const tests = d.plan.filter((s) => s.group === 'test');
    expect(tests.map((s) => s.id)).toEqual(expect.arrayContaining(['trims', 'smoke', 'mafchk', 'fuelp']));
    const levels = tests.map((s) => s.level);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(d.next?.id).toBe('prelim');
    const pct = d.codes[0].hypotheses.reduce((n, h) => n + h.pct, 0);
    expect(pct).toBeGreaterThan(95); expect(pct).toBeLessThan(105);
  });

  it('les résultats de contrôle font évoluer la piste', () => {
    const base = mk('P0171', { vehicle: veh({ fuel: 'essence' }) });
    const d1 = diagnose({ ...base, results: [res('prelim', 'ok'), res('smoke', 'ok')] });
    expect(d1.lead?.cat).not.toBe('air_leak');
    expect(d1.codes[0].hypotheses.find((h) => h.cat === 'air_leak')?.status).toBe('cleared');
    const d2 = diagnose({ ...base, results: [res('smoke', 'ok'), res('mafchk', 'nok')] });
    expect(['sensor', 'clog']).toContain(d2.lead?.cat);
    expect(d2.lead?.status).toBe('confirmed');
    expect(d2.progress.done).toBe(2);
    expect(d2.next?.result).toBeUndefined();
  });

  it('un cas résolu similaire passe avant tout le reste', () => {
    const old = blankCase({ id: 'old1', status: 'ok', brand: 'RENAULT', model: 'Clio 4', engine: '1.2 16v', codes: parseCodes('P0171'), cause: 'Durite de reniflard fendue derrière le collecteur', fix: 'Durite remplacée', notes: 'Invisible sans miroir' });
    const d = diagnose(mk('P0171', { cases: [old], vehicle: veh({ brand: 'RENAULT', model: 'Clio 4', engine: '1.2 16v', fuel: 'essence' }) }));
    expect(d.similar[0].case.id).toBe('old1');
    expect(d.plan[1].group).toBe('cas');
    expect(d.plan[1].how).toMatch(/Invisible sans miroir/);
    expect(d.lead?.source).toBe('cas');
    expect(d.lead?.text).toMatch(/reniflard/);
    const cleared = diagnose({ ...mk('P0171', { cases: [old] }), results: [res('u:old1', 'ok')] });
    expect(cleared.lead?.source).not.toBe('cas');
    const same = diagnose({ ...mk('P0171', { cases: [old] }), results: [res('u:old1', 'nok')] });
    expect(same.lead?.status).toBe('confirmed');
    expect(same.lead?.source).toBe('cas');
  });

  it('ne ressort pas un cas en cours ni le cas en cours d’édition', () => {
    const wip = blankCase({ id: 'w', status: 'wip', codes: parseCodes('P0171'), cause: '' });
    const d = diagnose(mk('P0171', { cases: [wip] }));
    expect(d.similar).toHaveLength(1);
    expect(d.plan.some((s) => s.group === 'cas')).toBe(false);
    expect(diagnose(mk('P0171', { cases: [wip], excludeCaseId: 'w' })).similar).toHaveLength(0);
  });

  it('ne propose jamais une réparation interdite tirée d’un ancien cas', () => {
    const bad = blankCase({ id: 'bad', status: 'ok', codes: parseCodes('P2002'), cause: 'FAP colmaté', fix: 'Suppression FAP et reprog' });
    const d = diagnose(mk('P2002', { cases: [bad], vehicle: veh({ fuel: 'diesel' }) }));
    expect(d.similar[0].hidden).toBe(true);
    expect(d.plan.some((s) => s.group === 'cas')).toBe(false);
    expect(d.plan.map((s) => `${s.title} ${s.how} ${s.bad}`).some(violatesEmissionRule)).toBe(false);
    expect(violatesEmissionRule(buildPrompt(mk('P2002', { cases: [bad] }), d, '').replace(/Ne propose jamais[^.]*\./, ''))).toBe(false);
  });

  it('reconnaît une panne connue du moteur', () => {
    const d = diagnose(mk('P0011', { vehicle: veh({ brand: 'PSA', model: '208', engine: '1.2 PureTech 110', fuel: 'essence' }) }));
    expect(d.known.map((k) => k.pattern.id)).toContain('eb2-belt');
    const step = d.plan.find((s) => s.group === 'connue')!;
    expect(step.how).toMatch(/courroie/);
    expect(d.plan.indexOf(step)).toBeLessThan(d.plan.findIndex((s) => s.group === 'test'));
    expect(d.codes[0].hypotheses.some((h) => h.source === 'connue')).toBe(true);
    expect(diagnose(mk('P0011', { vehicle: veh({ brand: 'RENAULT', model: 'Clio', engine: '1.5 dCi' }) })).known.map((k) => k.pattern.id)).not.toContain('eb2-belt');
  });

  it('panne connue déclenchée par les symptômes seuls', () => {
    const d = diagnose(mk('', { sym: 'bruit de chaîne à froid', vehicle: veh({ brand: 'BMW', model: '118d', engine: '2.0 d', fuel: 'diesel' }) }));
    expect(d.known.map((k) => k.pattern.id)).toContain('n47-chain');
    expect(d.plan.some((s) => s.group === 'connue')).toBe(true);
  });

  it('plusieurs codes de communication : batterie et masses d’abord', () => {
    const d = diagnose(mk('U0100 U0121 U0155 P0562'));
    expect(d.hints.join(' ')).toMatch(/batterie/);
    const ids = d.plan.map((s) => s.id);
    expect(ids).toContain('bat'); expect(ids).toContain('cantopo');
    expect(d.plan.find((s) => s.id === 'cantopo')!.codes.length).toBeGreaterThanOrEqual(3);
  });

  it('code sans fiche riche : la définition perso suffit à bâtir un plan', () => {
    const def: MyDef = { id: 'P164E', code: 'P164E', brand: 'VAG', text: 'Vanne de régulation de pression d’huile N428 : défaut électrique', notes: '', updated: '' };
    const d = diagnose({ ...mk(''), codes: inputs('P164E', { P164E: def }) });
    const a = d.codes[0];
    expect(a.documented).toBe(true);
    expect(a.family.id).toBe('oil');
    expect(a.hypotheses.length).toBeGreaterThan(2);
    expect(d.plan.length).toBeGreaterThan(3);
  });

  it('code inconnu (hexa BMW) : contrôles de base et code signalé non documenté', () => {
    const d = diagnose(mk('4A63', { vehicle: veh({ brand: 'BMW' }) }));
    expect(d.codes[0].ref.format).toBe('hex');
    expect(d.codes[0].documented).toBe(false);
    expect(d.plan.length).toBeGreaterThan(2);
  });

  it('PSA : libellé français par calculateur et type de défaut', () => {
    const code = packs[2].entries.find((e) => /^P/.test(e.code))!.code;
    const d = diagnose(mk(code + '-13', { vehicle: veh({ brand: 'PSA' }) }));
    expect(d.codes[0].title.length).toBeGreaterThan(3);
    expect(d.codes[0].ftLabel).toBe('Circuit ouvert');
    expect(d.codes[0].variants.length).toBeGreaterThan(0);
  });

  it('diesel : ratés traités par l’injection, pas par les bougies', () => {
    const ids = diagnose(mk('P0301', { vehicle: veh({ fuel: 'diesel' }) })).plan.map((s) => s.id);
    expect(ids).toContain('injcorr'); expect(ids).not.toContain('plugs');
    expect(diagnose(mk('P0301', { vehicle: veh({ fuel: 'essence' }) })).plan.map((s) => s.id)).toContain('permute');
  });

  it('airbag : la mise en sécurité vient en premier', () => {
    const d = diagnose(mk('B0001'));
    expect(d.plan.filter((s) => s.group === 'test')[0].id).toBe('airbagsafe');
    expect(d.plan.map((s) => s.id)).not.toContain('e_unplug');
  });

  it('tous les codes génériques produisent un plan sans erreur', () => {
    let empty = 0;
    for (const e of packs[0].entries) {
      const d = diagnose(mk(e.code));
      if (d.plan.length < 3) empty++;
      expect(d.codes[0].hypotheses.length, e.code).toBeGreaterThan(0);
    }
    expect(empty).toBe(0);
  });
});

describe('compléments de base', () => {
  it('code hexadécimal BMW courant : libellé et plan adapté', () => {
    const d = diagnose(mk('29CD', { vehicle: veh({ brand: 'BMW', fuel: 'essence' }) }));
    expect(d.codes[0].title).toMatch(/cylindre 1/);
    expect(d.codes[0].family.id).toBe('misfire');
    expect(d.plan.map((s) => s.id)).toContain('permute');
  });
  it('libellé constructeur ajouté (Nissan, Ford, Fiat)', () => {
    const has = (code: string, brand: string) => !!byCode.get(code)?.find((e) => e.pack === 'constructeurs')?.brands?.[brand];
    expect(has('B1200', 'NISSAN')).toBe(true);
    expect(has('B10A2', 'FORD')).toBe(true);
    expect([...byCode.values()].some((l) => l.some((e) => e.brands?.FIAT))).toBe(true);
  });
});
