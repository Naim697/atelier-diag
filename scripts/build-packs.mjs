// Convertit les bases libres en paquets Atelier diag (public/packs/*.json.gz + index.json).
// Usage : node scripts/build-packs.mjs [chemin/bases-codes-v1.json.gz]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gunzipSync, gzipSync } from 'node:zlib';
import { frTitle, frCause } from './fr.mjs';
import { scrubText as scrub } from '../src/core/guard.ts';

const src = process.argv[2] || new URL('../legacy/bases-codes-v1.json.gz', import.meta.url).pathname;
const D = JSON.parse(gunzipSync(readFileSync(src)).toString('utf8'));
const out = new URL('../public/packs/', import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const VERSION = '2026.11.1';
const index = [];
let stats = { titles: 0, titlesFr: 0, causes: 0, causesFr: 0, removed: 0 };

function clean(text) { const r = scrub(text); stats.removed += r.removed; return r.text; }

function write(meta, entries, extra) {
  const removedBefore = stats.removed;
  const pack = { format: 'atelier-diag-pack', ...meta, version: VERSION, count: entries.length, entries, ...(extra ? { extra } : {}) };
  pack.removedByRule = stats.removed - removedBefore + (meta._removed || 0);
  delete pack._removed;
  const gz = gzipSync(Buffer.from(JSON.stringify(pack)), { level: 9 });
  writeFileSync(out + meta.id + '.json.gz', gz);
  index.push({ id: meta.id, name: meta.name, version: VERSION, license: meta.license, source: meta.source, lang: meta.lang, count: entries.length, file: meta.id + '.json.gz', bytes: gz.length });
  console.log(meta.id.padEnd(14), String(entries.length).padStart(6), 'fiches', (gz.length / 1024).toFixed(0).padStart(5), 'Ko');
}

// 1. Générique
{
  const before = stats.removed;
  const entries = Object.entries(D.gen).map(([code, g]) => {
    stats.titles++;
    const tf = frTitle(g.t); if (tf) stats.titlesFr++;
    const cs = g.c.map(([t, l]) => { stats.causes++; const fr = frCause(t); if (fr) stats.causesFr++; return [fr || t, l]; }).filter(([t]) => { const r = scrub(t); stats.removed += r.removed; return r.removed === 0; });
    const e = { code, t: g.t, d: clean(g.d), k: g.k, cs, s: g.s.map(clean).filter(Boolean), r: g.r, f: g.f, x: g.x };
    if (tf) e.tf = tf;
    return e;
  });
  write({ id: 'generique', name: 'Codes génériques OBD (SAE J2012)', license: 'CC0 (OBDex), MIT (Wal33D dtc-database)', source: 'OBDex, Wal33D dtc-database', lang: 'en+fr', _removed: stats.removed - before }, entries, { pids: D.pids });
}
// 2. Constructeurs : un enregistrement par code, libellé par marque
{
  const by = {};
  for (const [brand, m] of Object.entries(D.oem)) for (const [code, t] of Object.entries(m)) (by[code] = by[code] || {})[brand] = t;
  const entries = Object.entries(by).map(([code, brands]) => {
    const first = Object.values(brands)[0];
    const e = { code, t: first, brands };
    const tf = Object.values(brands).every((x) => x === first) ? frTitle(first) : '';
    if (tf) e.tf = tf;
    return e;
  });
  write({ id: 'constructeurs', name: 'Codes constructeurs (32 marques)', license: 'MIT (Wal33D dtc-database), sources MCDxAI', source: 'Wal33D dtc-database, MCDxAI open-source-dtc-databases', lang: 'en' }, entries);
}
// 3. PSA
{
  const entries = Object.entries(D.psa).map(([code, variants]) => ({ code, t: variants[0][1], tf: variants[0][1], variants }));
  write({ id: 'psa', name: 'Peugeot, Citroën, DS : codes par calculateur', license: 'Apache 2.0', source: 'PSA-RE', lang: 'fr' }, entries, { ecu: D.ecu });
}
// 4. VAG 5 chiffres
{
  const entries = Object.entries(D.vag5).map(([code, t]) => ({ code, t }));
  write({ id: 'vag5', name: 'VAG : anciens codes à 5 chiffres', license: 'Open source (MCDxAI)', source: 'MCDxAI open-source-dtc-databases', lang: 'en' }, entries);
}
writeFileSync(out + 'index.json', JSON.stringify({ version: VERSION, packs: index }, null, 1));
console.log(`Titres traduits : ${stats.titlesFr}/${stats.titles} · causes traduites : ${stats.causesFr}/${stats.causes} · phrases retirées par la règle antipollution : ${stats.removed}`);
