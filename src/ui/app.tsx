import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type { Case, MyDef, PackMeta, Settings, VehicleInfo } from '../core/types';
import { DEFAULT_SETTINGS, getDraft, getSettings, listCases, listDefs, listPacks, openStore, saveDraft, saveSettings, type Db, type Draft } from '../db/db';
import { ensurePacks } from '../packs';
import { Icon } from './bits';
import { DiagView } from './diag';
import { CasesView } from './cases';
import { BaseView } from './base';
import { SettingsView } from './settings';
import { CaseSheet } from './casesheet';

export type Tab = 'diag' | 'cases' | 'base' | 'settings';

export const emptyVehicle = (): VehicleInfo => ({ plate: '', brand: '', model: '', engine: '', fuel: '', km: null });
export const emptyDraft = (): Draft => ({ input: '', vehicle: emptyVehicle(), sym: '', live: '', codeStatus: '', codes: [], results: [], caseId: '', photoIds: [], started: false });

export interface App {
  db: Db;
  cases: Case[];
  defs: MyDef[];
  packs: PackMeta[];
  settings: Settings;
  draft: Draft;
  setDraft(d: Draft): void;
  setSettings(s: Settings): void;
  reload(): Promise<void>;
  toast(msg: string): void;
  go(tab: Tab): void;
  editCase(c: Case | null, onSaved?: (c: Case) => void): void;
}

export function Root() {
  const [db, setDb] = useState<Db | null>(null);
  const [boot, setBoot] = useState<{ label: string; ratio: number } | null>({ label: 'Ouverture de la base locale', ratio: 0 });
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('diag');
  const [cases, setCases] = useState<Case[]>([]);
  const [defs, setDefs] = useState<MyDef[]>([]);
  const [packs, setPacks] = useState<PackMeta[]>([]);
  const [settings, setSettingsState] = useState<Settings>(DEFAULT_SETTINGS);
  const [draft, setDraftState] = useState<Draft>(emptyDraft());
  const [toastMsg, setToastMsg] = useState('');
  const [sheet, setSheet] = useState<{ c: Case | null; onSaved?: (c: Case) => void } | null>(null);
  const toastTimer = useRef(0);
  const draftTimer = useRef(0);

  const toast = useCallback((m: string) => { setToastMsg(m); clearTimeout(toastTimer.current); toastTimer.current = window.setTimeout(() => setToastMsg(''), 3200); }, []);

  const reloadWith = async (d: Db) => {
    const [c, f, p, s] = await Promise.all([listCases(d), listDefs(d), listPacks(d), getSettings(d)]);
    setCases(c); setDefs(f); setPacks(p); setSettingsState(s);
    document.documentElement.dataset.theme = s.theme || '';
    if (!s.theme) delete document.documentElement.dataset.theme;
  };

  useEffect(() => {
    void (async () => {
      try {
        const d = await openStore();
        void navigator.storage?.persist?.();
        try { await ensurePacks(d, (label, ratio) => setBoot({ label: `Installation des codes : ${label}`, ratio })); }
        catch (e) { console.warn('paquets', e); toast('Bases de codes non installées : connexion nécessaire au premier lancement.'); }
        await reloadWith(d);
        const dr = await getDraft(d);
        if (dr) setDraftState({ ...emptyDraft(), ...dr });
        setDb(d); setBoot(null);
      } catch (e) {
        setError('Le stockage local du navigateur est indisponible (navigation privée ?). ' + ((e as Error)?.message || ''));
      }
    })();
  }, []);

  if (error) return <div class="wrap"><div class="card bad"><div class="bd"><h2>Impossible de démarrer</h2><p>{error}</p></div></div></div>;
  if (!db || boot) {
    return (
      <div class="wrap"><div class="card" style="margin-top:30vh"><div class="bd">
        <h2>Atelier diag</h2>
        <p class="note">{boot?.label || 'Chargement…'}</p>
        <div class="progress"><i style={`width:${Math.round((boot?.ratio || 0) * 100)}%`} /></div>
        <p class="note">Au premier lancement, les 24 000 fiches de codes sont copiées dans le téléphone. Ensuite tout marche sans réseau.</p>
      </div></div></div>
    );
  }

  const app: App = {
    db, cases, defs, packs, settings, draft,
    setDraft: (d) => { setDraftState(d); clearTimeout(draftTimer.current); draftTimer.current = window.setTimeout(() => void saveDraft(db, d), 400); },
    setSettings: (s) => { setSettingsState(s); void saveSettings(db, s); document.documentElement.dataset.theme = s.theme || ''; if (!s.theme) delete document.documentElement.dataset.theme; },
    reload: () => reloadWith(db),
    toast,
    go: (t) => { setTab(t); window.scrollTo(0, 0); },
    editCase: (c, onSaved) => setSheet({ c, onSaved }),
  };

  const tabs: [Tab, string, () => preact.JSX.Element][] = [['diag', 'Diagnostic', Icon.search], ['cases', `Mes cas${cases.length ? ' (' + cases.length + ')' : ''}`, Icon.folder], ['base', 'Codes', Icon.book], ['settings', 'Réglages', Icon.gear]];
  return (
    <>
      <main class="wrap">
        <div class="brand"><span style="color:var(--amber);display:flex"><Icon.engine /></span><span>Atelier diag</span><small>{navigator.onLine ? '' : 'hors ligne'}</small></div>
        {document.querySelector('script[data-pack-index]') && <div class="hint"><b>Version d’aperçu.</b> Elle sert à essayer la recherche de panne. Ici, ni micro, ni sauvegarde en fichier, et les données peuvent s’effacer : garde tes vrais cas pour la version installée.</div>}
        {tab === 'diag' && <DiagView app={app} />}
        {tab === 'cases' && <CasesView app={app} />}
        {tab === 'base' && <BaseView app={app} />}
        {tab === 'settings' && <SettingsView app={app} />}
      </main>
      <nav class="tabs" role="tablist">
        {tabs.map(([id, label, I]) => <button key={id} role="tab" aria-selected={tab === id} onClick={() => app.go(id)}><I />{label}</button>)}
      </nav>
      {sheet && <CaseSheet app={app} initial={sheet.c} onClose={() => setSheet(null)} onSaved={(c: Case) => { sheet.onSaved?.(c); }} />}
      {toastMsg && <div class="toast" role="status">{toastMsg}</div>}
    </>
  );
}
