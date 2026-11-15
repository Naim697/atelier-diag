import { openDB, type IDBPDatabase } from 'idb';
import type { BackupFile, Case, CodeRef, DtcEntry, MyDef, PackFile, PackMeta, Photo, Settings, StepResult, VehicleInfo } from '../core/types';
import { newId, parseCodes } from '../core/codes';
import { scrubText, violatesEmissionRule } from '../core/guard';
import { detectBrand, detectFuel, BRANDS } from '../core/brands';
import { causeCat } from '../core/classify';

export const DB_VERSION = 1;
export type Db = IDBPDatabase<unknown>;

/** Ouvre la base locale. Chaque changement de schéma ajoute un cas dans `upgrade`, sans jamais effacer de données. */
export function openStore(name = 'atelier-diag'): Promise<Db> {
  return openDB(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('cases', { keyPath: 'id' });
        db.createObjectStore('photos', { keyPath: 'id' }).createIndex('caseId', 'caseId');
        db.createObjectStore('defs', { keyPath: 'id' });
        db.createObjectStore('dtc', { keyPath: 'id' }).createIndex('code', 'code');
        db.createObjectStore('packs', { keyPath: 'id' });
        db.createObjectStore('meta');
      }
    },
  });
}

export const DEFAULT_SETTINGS: Settings = { tool: '', lastBackup: '', theme: '' };

export interface Draft {
  input: string;
  vehicle: VehicleInfo;
  sym: string;
  live: string;
  codeStatus: string;
  codes: CodeRef[];
  results: StepResult[];
  caseId: string;
  photoIds: string[];
  started: boolean;
}

/* ---------- réglages et brouillon ---------- */
export async function getSettings(db: Db): Promise<Settings> { return { ...DEFAULT_SETTINGS, ...((await db.get('meta', 'settings')) as Partial<Settings> | undefined) }; }
export async function saveSettings(db: Db, s: Settings) { await db.put('meta', s, 'settings'); }
export async function getDraft(db: Db): Promise<Draft | undefined> { return (await db.get('meta', 'draft')) as Draft | undefined; }
export async function saveDraft(db: Db, d: Draft | null) { if (d) await db.put('meta', d, 'draft'); else await db.delete('meta', 'draft'); }

/* ---------- cas ---------- */
export function blankCase(over: Partial<Case> = {}): Case {
  const now = new Date().toISOString();
  return { id: newId('c'), date: now.slice(0, 10), status: 'wip', plate: '', brand: '', model: '', engine: '', fuel: '', km: null, codes: [], codeStatus: '', sym: '', live: '', steps: [], tests: '', cause: '', causeCat: '', fix: '', cost: '', time: '', notes: '', photoIds: [], created: now, updated: now, ...over };
}
export async function listCases(db: Db, withDeleted = false): Promise<Case[]> {
  const all = (await db.getAll('cases')) as Case[];
  return (withDeleted ? all : all.filter((c) => !c.deleted)).sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
}
export async function putCase(db: Db, c: Case): Promise<Case> {
  const saved = { ...c, updated: new Date().toISOString() };
  if (saved.cause && !saved.causeCat) saved.causeCat = causeCat(saved.cause);
  await db.put('cases', saved);
  return saved;
}
/** Suppression douce : la fiche est vidée mais son identifiant reste, pour que la suppression se propage à l'import. */
export async function deleteCase(db: Db, id: string) {
  const c = (await db.get('cases', id)) as Case | undefined;
  if (!c) return;
  const tx = db.transaction(['cases', 'photos'], 'readwrite');
  for (const pid of c.photoIds || []) await tx.objectStore('photos').delete(pid);
  await tx.objectStore('cases').put({ ...blankCase({ id: c.id, created: c.created, date: c.date }), deleted: true, updated: new Date().toISOString() });
  await tx.done;
}

/* ---------- photos ---------- */
export async function addPhoto(db: Db, caseId: string, blob: Blob): Promise<Photo> {
  const p: Photo = { id: newId('p'), caseId, blob, created: new Date().toISOString() };
  await db.put('photos', p);
  return p;
}
export async function getPhoto(db: Db, id: string): Promise<Photo | undefined> { return (await db.get('photos', id)) as Photo | undefined; }
export async function deletePhoto(db: Db, id: string) { await db.delete('photos', id); }

/* ---------- définitions perso ---------- */
export async function listDefs(db: Db): Promise<MyDef[]> { return ((await db.getAll('defs')) as MyDef[]).filter((d) => !d.deleted); }
export async function putDef(db: Db, d: Omit<MyDef, 'id' | 'updated'> & { id?: string }): Promise<MyDef> {
  const saved: MyDef = { ...d, code: d.code.toUpperCase(), id: d.id || d.code.toUpperCase(), updated: new Date().toISOString() };
  await db.put('defs', saved);
  return saved;
}
export async function deleteDef(db: Db, id: string) {
  const d = (await db.get('defs', id)) as MyDef | undefined;
  if (d) await db.put('defs', { ...d, text: '', notes: '', deleted: true, updated: new Date().toISOString() });
}

/* ---------- paquets de codes ---------- */
export async function listPacks(db: Db): Promise<PackMeta[]> { return (await db.getAll('packs')) as PackMeta[]; }

export function validatePack(p: unknown): asserts p is PackFile {
  const x = p as PackFile;
  if (!x || x.format !== 'atelier-diag-pack' || !x.id || !/^[a-z0-9-]{2,40}$/.test(x.id) || !Array.isArray(x.entries)) throw new Error('Ce fichier n’est pas un paquet de codes Atelier diag.');
  for (const e of x.entries.slice(0, 50)) if (typeof e.code !== 'string') throw new Error('Paquet invalide : une fiche n’a pas de code.');
}

/** Installe ou met à jour un paquet. Les données de l'utilisateur ne sont jamais touchées. */
export async function installPack(db: Db, pack: PackFile, onProgress?: (done: number, total: number) => void): Promise<PackMeta> {
  validatePack(pack);
  let removed = 0;
  const clean = (t: string | undefined) => { if (!t) return t; const r = scrubText(t); removed += r.removed; return r.text; };
  const index: [string, string, string][] = [];
  // Retire d'abord l'ancienne version du paquet.
  {
    const tx = db.transaction('dtc', 'readwrite');
    let cur = await tx.store.openCursor(IDBKeyRange.bound(pack.id + '|', pack.id + '|￿'));
    while (cur) { await cur.delete(); cur = await cur.continue(); }
    await tx.done;
  }
  const total = pack.entries.length;
  const CHUNK = 1500;
  for (let i = 0; i < total; i += CHUNK) {
    const tx = db.transaction('dtc', 'readwrite');
    for (const raw of pack.entries.slice(i, i + CHUNK)) {
      const code = String(raw.code).toUpperCase();
      const e: DtcEntry = { ...raw, code, id: `${pack.id}|${code}`, pack: pack.id };
      e.d = clean(e.d);
      if (e.cs) e.cs = e.cs.filter(([t]) => { const bad = violatesEmissionRule(t); if (bad) removed++; return !bad; });
      if (e.s) e.s = e.s.filter((t) => { const bad = violatesEmissionRule(t); if (bad) removed++; return !bad; });
      if (violatesEmissionRule(e.t) || violatesEmissionRule(e.tf)) { removed++; continue; }
      void tx.store.put(e);
      index.push([code, e.tf || e.t || '', e.tf && e.t && e.tf !== e.t ? e.t : '']);
    }
    await tx.done;
    onProgress?.(Math.min(i + CHUNK, total), total);
  }
  const meta: PackMeta = { id: pack.id, name: pack.name, version: pack.version, license: pack.license, source: pack.source, lang: pack.lang, count: index.length, installed: new Date().toISOString(), removedByRule: removed + (pack.removedByRule || 0) };
  const tx = db.transaction(['packs', 'meta'], 'readwrite');
  await tx.objectStore('packs').put(meta);
  await tx.objectStore('meta').put(index, 'idx:' + pack.id);
  if (pack.extra) await tx.objectStore('meta').put(pack.extra, 'extra:' + pack.id);
  await tx.done;
  titleCache.delete(db);
  return meta;
}

export async function removePack(db: Db, id: string) {
  const tx = db.transaction(['dtc', 'packs', 'meta'], 'readwrite');
  let cur = await tx.objectStore('dtc').openCursor(IDBKeyRange.bound(id + '|', id + '|￿'));
  while (cur) { await cur.delete(); cur = await cur.continue(); }
  await tx.objectStore('packs').delete(id);
  await tx.objectStore('meta').delete('idx:' + id);
  await tx.objectStore('meta').delete('extra:' + id);
  await tx.done;
  titleCache.delete(db);
}

export async function lookupCodes(db: Db, codes: string[]): Promise<Record<string, DtcEntry[]>> {
  const out: Record<string, DtcEntry[]> = {};
  await Promise.all(codes.map(async (c) => { out[c] = (await db.getAllFromIndex('dtc', 'code', c)) as DtcEntry[]; }));
  return out;
}
export async function getExtra<T>(db: Db, pack: string): Promise<T | undefined> { return (await db.get('meta', 'extra:' + pack)) as T | undefined; }

const titleCache = new WeakMap<Db, [string, string, string, string][]>();
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Recherche par mot-clé ou début de code dans tous les paquets installés. */
export async function searchTitles(db: Db, query: string, limit = 60): Promise<{ code: string; title: string; orig: string; pack: string }[]> {
  let all = titleCache.get(db);
  if (!all) {
    all = [];
    for (const p of await listPacks(db)) {
      const idx = ((await db.get('meta', 'idx:' + p.id)) as [string, string, string][] | undefined) || [];
      for (const [c, t, o] of idx) all.push([c, t, o, p.id]);
    }
    titleCache.set(db, all);
  }
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const res: { code: string; title: string; orig: string; pack: string }[] = [];
  const up = query.trim().toUpperCase();
  for (const [code, t, o, pack] of all) {
    const hay = fold(code + ' ' + t + ' ' + o);
    if (code.startsWith(up) || words.every((w) => hay.includes(w))) { res.push({ code, title: t, orig: o, pack }); if (res.length >= limit) break; }
  }
  return res;
}

/* ---------- sauvegarde ---------- */
async function blobToB64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBlob(data: string, type: string): Blob {
  const bin = atob(data);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return new Blob([buf], { type });
}

export async function exportBackup(db: Db, withPhotos = true): Promise<BackupFile> {
  const out: BackupFile = { format: 'atelier-diag-backup', version: 2, exported: new Date().toISOString(), cases: (await db.getAll('cases')) as Case[], defs: (await db.getAll('defs')) as MyDef[], settings: await getSettings(db) };
  if (withPhotos) {
    out.photos = [];
    for (const p of (await db.getAll('photos')) as Photo[]) out.photos.push({ id: p.id, caseId: p.caseId, created: p.created, type: p.blob.type || 'image/jpeg', data: await blobToB64(p.blob) });
  }
  return out;
}

export interface ImportStats { casesAdded: number; casesUpdated: number; casesKept: number; defs: number; photos: number }

/** Convertit une fiche de l'ancien outil (codes en texte libre) au schéma actuel. */
export function fromLegacyCase(o: Record<string, unknown>): Case {
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  const brandRaw = str('brand');
  const brandKey = Object.keys(BRANDS).find((k) => k === brandRaw.toUpperCase() || BRANDS[k] === brandRaw) || detectBrand(brandRaw + ' ' + str('model')) || brandRaw;
  const kmN = parseInt(str('km').replace(/\D/g, ''), 10);
  const cause = str('cause');
  return blankCase({
    id: str('id') || newId('c'), date: str('date') || str('created').slice(0, 10), status: o.status === 'ok' ? 'ok' : 'wip', plate: str('plate').toUpperCase(), brand: brandKey, model: str('model'), engine: str('engine'),
    fuel: detectFuel(str('engine') + ' ' + str('model')), km: Number.isFinite(kmN) ? kmN : null, codes: parseCodes(str('codes'), { hexHint: brandKey === 'BMW' }), sym: str('sym'), live: str('live'), tests: str('tests'),
    cause, causeCat: cause ? causeCat(cause) : '', fix: str('fix'), cost: str('cost'), time: str('time'), notes: str('notes'), created: str('created') || new Date().toISOString(), updated: str('updated') || str('created') || new Date().toISOString(),
  });
}

/** Importe une sauvegarde v2 ou un export de l'ancien outil. Fusion : pour chaque fiche, la plus récente gagne. */
export async function importBackup(db: Db, data: unknown): Promise<ImportStats> {
  const j = data as Record<string, unknown>;
  const stats: ImportStats = { casesAdded: 0, casesUpdated: 0, casesKept: 0, defs: 0, photos: 0 };
  let cases: Case[]; let defs: MyDef[] = [];
  if (j && j.format === 'atelier-diag-backup') {
    cases = (j.cases as Case[]) || []; defs = (j.defs as MyDef[]) || [];
  } else {
    const arr = Array.isArray(data) ? data : (j?.cases as unknown[]);
    if (!Array.isArray(arr)) throw new Error('Fichier non reconnu : ce n’est ni une sauvegarde Atelier diag ni un export de l’ancien outil.');
    cases = arr.filter((c) => c && typeof c === 'object').map((c) => fromLegacyCase(c as Record<string, unknown>));
    const d = j?.defs;
    const list = Array.isArray(d) ? d : d && typeof d === 'object' ? Object.values(d) : [];
    defs = (list as Record<string, string>[]).filter((x) => x && x.code && x.text).map((x) => ({ id: x.code.toUpperCase(), code: x.code.toUpperCase(), brand: x.brand || '', text: x.text, notes: x.notes || '', updated: x.updated || new Date().toISOString() }));
  }
  for (const c of cases) {
    if (!c || !c.id) continue;
    const old = (await db.get('cases', c.id)) as Case | undefined;
    if (!old) { await db.put('cases', { ...blankCase(), ...c }); stats.casesAdded++; }
    else if ((c.updated || '') > (old.updated || '')) { await db.put('cases', { ...blankCase(), ...c }); stats.casesUpdated++; }
    else stats.casesKept++;
  }
  for (const d of defs) {
    if (!d || !d.id) continue;
    const old = (await db.get('defs', d.id)) as MyDef | undefined;
    if (!old || (d.updated || '') > (old.updated || '')) { await db.put('defs', d); stats.defs++; }
  }
  for (const p of ((j?.photos as BackupFile['photos']) || [])) {
    if (!p?.id || (await db.get('photos', p.id))) continue;
    await db.put('photos', { id: p.id, caseId: p.caseId, created: p.created, blob: b64ToBlob(p.data, p.type) } satisfies Photo);
    stats.photos++;
  }
  if (j?.format === 'atelier-diag-backup' && j.settings) {
    const cur = await getSettings(db);
    const inc = j.settings as Settings;
    await saveSettings(db, { ...cur, tool: cur.tool || inc.tool || '' });
  }
  return stats;
}
