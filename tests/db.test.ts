import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { openStore, listCases, putCase, deleteCase, blankCase, importBackup, exportBackup, installPack, lookupCodes, searchTitles, listPacks, putDef, listDefs, fromLegacyCase, addPhoto, removePack, type Db } from '../src/db/db';
import type { PackFile } from '../src/core/types';

let db: Db; let n = 0;
beforeEach(async () => { db = await openStore('t' + n++); });

const pack: PackFile = { format: 'atelier-diag-pack', id: 'test', name: 'Test', version: '1', license: 'x', source: 'x', lang: 'fr', count: 3, entries: [
  { code: 'P0171', t: 'System Too Lean Bank 1', tf: 'Mélange trop pauvre (banc 1)', d: 'Explication. Sinon suppression EGR.', cs: [['Prise d’air', 3], ['DPF delete recommended', 1]], s: [] },
  { code: 'P0299', t: 'Turbocharger Underboost', cs: [['Boost leak', 3]] },
  { code: 'P0401', t: 'EGR flow insufficient' },
] };

describe('cas', () => {
  it('enregistre, relit et supprime en laissant une pierre tombale', async () => {
    const c = await putCase(db, blankCase({ cause: 'Fil de signal coupé', status: 'ok' }));
    expect(c.causeCat).toBe('wiring');
    expect(await listCases(db)).toHaveLength(1);
    await deleteCase(db, c.id);
    expect(await listCases(db)).toHaveLength(0);
    const all = await listCases(db, true);
    expect(all[0].deleted).toBe(true);
    expect(all[0].cause).toBe('');
  });
});

describe('reprise des données de l’ancien outil', () => {
  const legacy = JSON.parse(readFileSync(new URL('../legacy/donnees-recuperees.json', import.meta.url), 'utf8'));
  it('convertit le cas BMW', () => {
    const c = fromLegacyCase(legacy.cases[0]);
    expect(c.brand).toBe('BMW');
    expect(c.km).toBe(342000);
    expect(c.codes.map((x) => x.code)).toEqual(['BA6D1']);
    expect(c.status).toBe('ok');
    expect(c.fuel).toBe('diesel');
    expect(c.cause).toMatch(/EWS/);
  });
  it('importe cas et définitions, sans doublon au deuxième import', async () => {
    const s1 = await importBackup(db, legacy);
    expect(s1).toMatchObject({ casesAdded: 1, defs: 1 });
    const s2 = await importBackup(db, legacy);
    expect(s2).toMatchObject({ casesAdded: 0, casesKept: 1, defs: 0 });
    expect((await listDefs(db))[0].code).toBe('P164E');
  });
  it('refuse un fichier inconnu', async () => {
    await expect(importBackup(db, { foo: 1 })).rejects.toThrow(/non reconnu/);
  });
});

describe('sauvegarde et fusion', () => {
  it('fait un aller-retour complet avec photo', async () => {
    const c = await putCase(db, blankCase({ model: '308', cause: 'x' }));
    const p = await addPhoto(db, c.id, new Blob([new Uint8Array([1, 2, 3])], { type: 'image/jpeg' }));
    await putCase(db, { ...c, photoIds: [p.id] });
    await putDef(db, { code: 'p1234', brand: 'PSA', text: 'Déf', notes: '' });
    const backup = JSON.parse(JSON.stringify(await exportBackup(db)));
    const db2 = await openStore('other' + n++);
    const s = await importBackup(db2, backup);
    expect(s).toMatchObject({ casesAdded: 1, defs: 1, photos: 1 });
    expect((await listCases(db2))[0].photoIds).toEqual([p.id]);
  });
  it('garde la fiche la plus récente et propage une suppression', async () => {
    const c = await putCase(db, blankCase({ notes: 'ancien' }));
    const older = { ...(await exportBackup(db, false)) };
    await new Promise((r) => setTimeout(r, 5));
    await putCase(db, { ...c, notes: 'nouveau' });
    await importBackup(db, JSON.parse(JSON.stringify(older)));
    expect((await listCases(db))[0].notes).toBe('nouveau');
    const db2 = await openStore('m' + n++);
    await importBackup(db2, JSON.parse(JSON.stringify(older)));
    await new Promise((r) => setTimeout(r, 5));
    await deleteCase(db, c.id);
    await importBackup(db2, JSON.parse(JSON.stringify(await exportBackup(db, false))));
    expect(await listCases(db2)).toHaveLength(0);
  });
});

describe('paquets de codes', () => {
  it('installe, filtre la règle antipollution, cherche et met à jour sans toucher aux cas', async () => {
    await putCase(db, blankCase({ notes: 'à garder' }));
    const meta = await installPack(db, pack);
    expect(meta.count).toBe(3);
    expect(meta.removedByRule).toBe(2);
    const r = await lookupCodes(db, ['P0171', 'P9999']);
    expect(r.P0171[0].d).toBe('Explication.');
    expect(r.P0171[0].cs).toEqual([['Prise d’air', 3]]);
    expect(r.P9999).toEqual([]);
    expect((await searchTitles(db, 'pauvre'))[0].code).toBe('P0171');
    expect((await searchTitles(db, 'turbo underboost'))[0].code).toBe('P0299');
    expect((await searchTitles(db, 'p04'))[0].code).toBe('P0401');
    await installPack(db, { ...pack, version: '2', entries: pack.entries.slice(0, 1) });
    expect((await listPacks(db))[0]).toMatchObject({ version: '2', count: 1 });
    expect((await lookupCodes(db, ['P0299'])).P0299).toEqual([]);
    expect(await listCases(db)).toHaveLength(1);
    await removePack(db, 'test');
    expect(await listPacks(db)).toHaveLength(0);
  });
  it('refuse un fichier qui n’est pas un paquet', async () => {
    await expect(installPack(db, { foo: 1 } as unknown as PackFile)).rejects.toThrow(/paquet/);
  });
});
