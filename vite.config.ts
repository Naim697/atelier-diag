import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

/** Génère le service worker avec la liste exacte des fichiers à garder hors ligne. */
function offline(): Plugin {
  return {
    name: 'atelier-diag-offline',
    apply: 'build',
    closeBundle() {
      const dist = new URL('./dist/', import.meta.url).pathname;
      const files: string[] = [];
      const walk = (dir: string) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else files.push(relative(dist, p).replace(/\\/g, '/')); } };
      walk(dist);
      const list = files.filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const hash = createHash('sha1');
      for (const f of list) hash.update(f).update(readFileSync(join(dist, f)));
      const sw = `// Généré au build : ne pas modifier.
const CACHE = 'atelier-diag-${hash.digest('hex').slice(0, 12)}';
const FILES = ${JSON.stringify(['./', ...list])};
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('atelier-diag-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === 'navigate' ? await cache.match('./') : undefined);
    if (hit) return hit;
    try { const res = await fetch(req); if (res.ok) cache.put(req, res.clone()); return res; }
    catch (err) { const fallback = await cache.match('./'); if (fallback && req.mode === 'navigate') return fallback; throw err; }
  }));
});
`;
      writeFileSync(join(dist, 'sw.js'), sw);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), offline()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  build: { target: 'es2022', sourcemap: false },
  test: { include: ['tests/**/*.test.ts'] },
} as Parameters<typeof defineConfig>[0]);
