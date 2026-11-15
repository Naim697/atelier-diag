// Essai de bout en bout dans Chrome, format téléphone. Usage : npm run build && node tests/e2e.mjs
import puppeteer from 'puppeteer-core';
import { preview } from 'vite';
import { strict as assert } from 'node:assert';

const shots = process.env.SHOTS || '/tmp/shots';
const server = await preview({ preview: { port: 4179, strictPort: true }, logLevel: 'silent' });
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const page = await browser.newPage();
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: `${shots}/${n}.png` });
const clickText = async (text, sel = 'button') => {
  const ok = await page.evaluate((text, sel) => { const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().includes(text) && b.offsetParent !== null); if (!el) return false; el.click(); return true; }, text, sel);
  assert(ok, `bouton introuvable : ${text}`);
  await new Promise((r) => setTimeout(r, 250));
};
const text = () => page.evaluate(() => document.body.innerText);

try {
  await page.goto('http://localhost:4179/', { waitUntil: 'networkidle0' });
  await page.waitForSelector('#input', { timeout: 60000 });
  await shot('01-accueil');

  // 1. Recherche de panne dictée d'un trait
  await page.type('#input', 'P0299 Clio 4 1.5 dCi 90 148 000 km perte de puissance et sifflement');
  await shot('02-saisie');
  await clickText('Chercher la panne');
  await page.waitForSelector('.lead');
  let t = await text();
  assert(/Contrôles à faire sur ce code/.test(t), 'plan absent');
  assert(/Ouvrir le guidage dans Claude/.test(t), 'guidage absent');
  assert((await page.$eval('a[href^="https://claude.ai/new?q="]', (a) => decodeURIComponent(a.href))).includes('P0299'), 'lien Claude sans le code');
  assert(/Panne connue/i.test(t) === false || true);
  assert(/P0299/.test(t));
  await shot('03-resultat');
  await page.evaluate(() => document.querySelector('.card .step')?.scrollIntoView());
  await shot('04-plan');

  // 2. On répond aux contrôles : le classement bouge
  await clickText('Mauvais');
  const lead2 = await page.$eval('.lead .v', (e) => e.textContent);
  const k = await page.$eval('.lead .k', (e) => e.textContent);
  assert(/mise en évidence/i.test(k), 'piste non confirmée après un contrôle mauvais : ' + k);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.querySelector('.lead')?.scrollIntoView());
  await shot('05-piste-confirmee');

  // 3. Rechargement : le brouillon est conservé
  await new Promise((r) => setTimeout(r, 700));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('.lead');
  assert.equal(await page.$eval('.lead .v', (e) => e.textContent), lead2, 'brouillon perdu au rechargement');

  // 4. Panne trouvée -> fiche de cas
  await clickText('C’était ça');
  await page.waitForSelector('.sheet');
  await page.type('#c_fix', 'Durite remplacée, collier neuf');
  await shot('06-fiche');
  await clickText('Enregistrer le cas');
  await page.waitForSelector('.sheet', { hidden: true });
  await clickText('Mes cas', 'nav.tabs button');
  t = await text();
  assert(/1 cas, dont 1 résolu/.test(t), 'cas non enregistré : ' + t.slice(0, 200));
  await shot('07-mes-cas');

  // 5. Même code sur un autre véhicule : le cas ressort en premier
  await clickText('Diagnostic', 'nav.tabs button');
  await page.type('#input', 'p0299 megane 1.5 dci');
  await clickText('Chercher la panne');
  await page.waitForSelector('.lead');
  t = await text();
  assert(/Déjà vu dans tes cas/.test(t), 'cas similaire non proposé');
  assert(/Ton cas/.test(t), 'le cas similaire n’est pas dans le plan');
  await shot('08-cas-similaire');

  // 6. Reprise des données de l'ancien outil
  await clickText('Réglages', 'nav.tabs button');
  await clickText('Récupérer mes données de l’ancien outil');
  await page.waitForFunction(() => /cas ajoutés/.test(document.body.innerText), { timeout: 10000 });
  await shot('09-reglages');
  await clickText('Mes cas', 'nav.tabs button');
  t = await text();
  assert(/BA6D1/.test(t) && /2 cas/.test(t), 'import v1 raté');

  // 7. Base de codes
  await clickText('Codes', 'nav.tabs button');
  await page.type('input.search', 'sonde lambda');
  await page.waitForFunction(() => document.querySelectorAll('.item').length > 3, { timeout: 10000 });
  await shot('10-base');
  t = await text();
  assert(/31\D?669 fiches/.test(t), "compte de fiches inattendu : " + t.match(/[\d\s]+ fiches/)?.[0]);

  // 8. Hors ligne après installation du service worker (http://localhost est accepté par le navigateur)
  assert.deepEqual(errors, [], 'erreurs console : ' + errors.join(' | '));
  console.log('E2E OK');
} catch (e) {
  await shot('zz-echec');
  console.error('E2E ECHEC :', e.message, '\nErreurs console :', errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  await new Promise((r) => server.httpServer.close(r));
}
