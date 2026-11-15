import type { PackFile } from './core/types';
import { installPack, listPacks, type Db } from './db/db';
import { gunzipSync, strFromU8 } from 'fflate';

interface IndexFile { version: string; packs: { id: string; name: string; version: string; file: string; bytes: number; count: number }[] }

/** Décompresse si besoin. Si le navigateur n'a pas DecompressionStream (anciens iPhone), on passe par fflate. */
async function gunzip(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return new TextDecoder().decode(bytes);
  if (typeof DecompressionStream === 'function') {
    try {
      const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
      return await new Response(stream).text();
    } catch { /* on retombe sur fflate */ }
  }
  return strFromU8(gunzipSync(bytes));
}

/** Paquets intégrés dans la page (version fichier unique) : balises <script type="application/octet-stream" data-pack="id">. */
function embedded(id: string): Uint8Array | null {
  const el = document.querySelector(`script[data-pack="${id}"]`);
  if (!el?.textContent) return null;
  const bin = atob(el.textContent.trim());
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf;
}

async function loadIndex(): Promise<IndexFile> {
  const el = document.querySelector('script[data-pack-index]');
  if (el?.textContent) return JSON.parse(el.textContent) as IndexFile;
  const r = await fetch('packs/index.json', { cache: 'no-cache' });
  if (!r.ok) throw new Error('index des paquets introuvable');
  return (await r.json()) as IndexFile;
}

export async function loadBundledPack(file: string, id: string): Promise<PackFile> {
  const emb = embedded(id);
  if (emb) return JSON.parse(await gunzip(emb)) as PackFile;
  const r = await fetch('packs/' + file);
  if (!r.ok) throw new Error('paquet ' + id + ' introuvable');
  return JSON.parse(await gunzip(await r.arrayBuffer())) as PackFile;
}

export function versionNewer(a: string, b: string): boolean {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) { const x = pa[i] || 0, y = pb[i] || 0; if (x !== y) return x > y; }
  return false;
}

/** Installe les paquets livrés avec l'appli s'ils manquent ou s'ils sont plus récents que ceux du téléphone. */
export async function ensurePacks(db: Db, onProgress: (label: string, ratio: number) => void): Promise<number> {
  const installed = await listPacks(db);
  let index: IndexFile;
  try { index = await loadIndex(); } catch (e) { if (installed.length) return 0; throw e; }
  const todo = index.packs.filter((p) => { const cur = installed.find((x) => x.id === p.id); return !cur || versionNewer(p.version, cur.version); });
  const total = todo.reduce((n, p) => n + p.count, 0) || 1;
  let done = 0;
  for (const p of todo) {
    onProgress(p.name, done / total);
    const pack = await loadBundledPack(p.file, p.id);
    await installPack(db, pack, (d) => onProgress(p.name, (done + d) / total));
    done += p.count;
  }
  return todo.length;
}

export async function readPackFile(file: File): Promise<PackFile> {
  return JSON.parse(await gunzip(await file.arrayBuffer())) as PackFile;
}
