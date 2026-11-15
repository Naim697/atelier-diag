// Fabrique une version « fichier unique » de l'appli (dist-single/atelier-diag.html) :
// tout est dans la page, paquets de codes compris. Sert d'aperçu et de secours sans hébergement.
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
const dist = new URL('../dist/', import.meta.url).pathname;
let html = readFileSync(dist + 'index.html', 'utf8');
const js = readdirSync(dist + 'assets').find((f) => f.endsWith('.js'));
const css = readdirSync(dist + 'assets').find((f) => f.endsWith('.css'));
const index = JSON.parse(readFileSync(dist + 'packs/index.json', 'utf8'));
html = html.replace(/<link rel="(manifest|icon|apple-touch-icon)"[^>]*>\s*/g, '')
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${readFileSync(dist + 'assets/' + css, 'utf8')}</style>`)
  .replace(/<script type="module"[^>]*><\/script>/, '');
const packs = index.packs.map((p) => `<script type="application/octet-stream" data-pack="${p.id}">${readFileSync(dist + 'packs/' + p.file).toString('base64')}</script>`).join('\n');
const code = readFileSync(dist + 'assets/' + js, 'utf8').replace(/<\/script/g, '<\\/script');
html = html.replace('</body>', () => `<script type="application/json" data-pack-index>${JSON.stringify(index)}</script>\n${packs}\n<script type="module">${code}</script>\n</body>`);
mkdirSync(new URL('../dist-single/', import.meta.url).pathname, { recursive: true });
writeFileSync(new URL('../dist-single/atelier-diag.html', import.meta.url).pathname, html);
console.log('dist-single/atelier-diag.html', (html.length / 1048576).toFixed(2), 'Mo');
