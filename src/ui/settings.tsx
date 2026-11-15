import { useEffect, useState } from 'preact/hooks';
import type { App } from './app';
import { exportBackup, importBackup } from '../db/db';
import { EMISSION_RULE_NOTE } from '../core/guard';
import { speechAvailable } from './speech';
import { Field, Select, saveFile } from './bits';

declare const __APP_VERSION__: string;

export function SettingsView({ app }: { app: App }) {
  const [usage, setUsage] = useState('');
  const [persisted, setPersisted] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage(e.usage ? `${(e.usage / 1048576).toFixed(1)} Mo utilisés` : ''));
    void navigator.storage?.persisted?.().then(setPersisted);
  }, [app.cases.length]);
  const last = app.settings.lastBackup;
  const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
  const changedSince = app.cases.some((c) => !last || c.updated > last);

  const doExport = async (photos: boolean) => {
    setBusy(true);
    try {
      const data = await exportBackup(app.db, photos);
      await saveFile(`atelier-diag-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data));
      app.setSettings({ ...app.settings, lastBackup: new Date().toISOString() });
      app.toast('Sauvegarde créée. Range le fichier hors du téléphone (mail, Drive).');
    } catch { app.toast('Sauvegarde impossible.'); }
    setBusy(false);
  };
  const doImport = async (file: File | string) => {
    setBusy(true);
    try {
      const text = (typeof file === 'string' ? file : await file.text()).replace(/^\uFEFF/, '').trim();
      if (!text.startsWith('{') && !text.startsWith('[')) throw new Error('Ce fichier n’est pas une sauvegarde (il ne contient pas de JSON).');
      const s = await importBackup(app.db, JSON.parse(text));
      await app.reload();
      app.toast(`${s.casesAdded} cas ajoutés, ${s.casesUpdated} mis à jour, ${s.casesKept} déjà à jour, ${s.defs} définitions, ${s.photos} photos.`);
    } catch (e) { app.toast((e as Error).message || 'Fichier illisible.'); }
    setBusy(false);
  };

  return (
    <>
      <h2>Réglages</h2>
      <div class={`card ${changedSince && app.cases.length ? 'accent' : 'ok'}`}><div class="bd">
        <h3 style="margin-top:0">Sauvegarde</h3>
        <p class="note">Tes cas, définitions et photos vivent uniquement dans ce téléphone. {days == null ? 'Aucune sauvegarde faite.' : `Dernière sauvegarde il y a ${days} jour${days > 1 ? 's' : ''}.`}{changedSince && app.cases.length ? ' Des cas ont changé depuis.' : ''}</p>
        <div class="row">
          <button class="btn pri grow" disabled={busy} onClick={() => void doExport(true)}>Tout sauvegarder</button>
          <button class="btn grow" disabled={busy} onClick={() => void doExport(false)}>Sans les photos</button>
        </div>
        <label class="btn block" style="margin-top:8px">Importer une sauvegarde ou l’export de l’ancien outil
          <input type="file" hidden disabled={busy} onChange={(e) => { const t = e.target as HTMLInputElement; const f = t.files?.[0]; t.value = ''; if (f) void doImport(f); }} />
        </label>
        <button class="btn block" style="margin-top:8px" disabled={busy} onClick={async () => {
          try { const r = await fetch('donnees-v1.json', { cache: 'no-cache' }); if (!r.ok) throw new Error('Données de l’ancien outil introuvables : il faut être en ligne.'); await doImport(await r.text()); }
          catch (e) { app.toast((e as Error).message || 'Récupération impossible.'); }
        }}>Récupérer mes données de l’ancien outil</button>
        <p class="note">L’import fusionne : pour chaque fiche, la version la plus récente est gardée. Rien n’est écrasé à l’aveugle.</p>
      </div></div>

      <div class="card"><div class="bd"><div class="grid">
        <Field id="s_tool" label="Ta valise" value={app.settings.tool} onChange={(x) => app.setSettings({ ...app.settings, tool: x })} placeholder="Launch X431, Autel…" full />
        <Select id="s_theme" label="Affichage" value={app.settings.theme} onChange={(x) => app.setSettings({ ...app.settings, theme: x as '' | 'light' | 'dark' })} options={[['', 'Comme le téléphone'], ['light', 'Clair'], ['dark', 'Sombre']]} full />
      </div></div></div>

      <div class="card"><div class="bd">
        <h3 style="margin-top:0">État de l’appli</h3>
        <ul>
          <li>Version {__APP_VERSION__}{usage ? ` · ${usage}` : ''}</li>
          <li>Stockage {persisted ? 'protégé : le téléphone ne l’effacera pas pour faire de la place' : 'non protégé : installe l’appli sur l’écran d’accueil et fais des sauvegardes'}</li>
          <li>Dictée vocale {speechAvailable() ? 'disponible (elle passe par Internet sur la plupart des téléphones)' : 'non proposée par ce navigateur : utilise le micro du clavier'}</li>
          <li>{navigator.onLine ? 'En ligne' : 'Hors ligne'} : le diagnostic, les codes et tes cas marchent sans réseau.</li>
        </ul>
        <p class="note">Installer sur le téléphone : menu du navigateur, puis « Ajouter à l’écran d’accueil ».</p>
      </div></div>

      <div class="card info"><div class="bd">
        <h3 style="margin-top:0">Règle antipollution</h3>
        <p style="margin:0">{EMISSION_RULE_NOTE}</p>
        <p class="note">Elle s’applique aux bases importées, aux pannes connues et aux suggestions tirées de tes anciens cas.</p>
      </div></div>
      <p class="note">Sources des codes : OBDex (CC0), Wal33D dtc-database (MIT), PSA-RE (Apache 2.0), MCDxAI open-source-dtc-databases. Les valeurs données sont typiques : la valeur constructeur prime.</p>
    </>
  );
}
