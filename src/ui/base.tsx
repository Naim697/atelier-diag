import { useEffect, useState } from 'preact/hooks';
import type { App } from './app';
import { emptyDraft } from './app';
import { deleteDef, getExtra, installPack, putDef, removePack, searchTitles } from '../db/db';
import { readPackFile } from '../packs';
import { parseCodes } from '../core/codes';
import { ConfirmButton, Fold } from './bits';

type Hit = { code: string; title: string; orig: string; pack: string };
interface Pid { p: string; n: string; u: string; r?: [number, number] }

const REFS: [string, string][] = [
  ['Tension batterie', 'Moteur arrêté : 12,4 V minimum, 12,6 V et plus si bien chargée. Moteur tournant : 13,8 à 14,7 V. Certains alternateurs pilotés descendent vers 12,5 à 13 V, c’est normal.'],
  ['Correcteurs de richesse (STFT, LTFT)', 'Idéal entre −10 % et +10 %. Au-dessus : mélange pauvre (prise d’air, débitmètre, pression d’essence). En dessous : riche (injecteur qui fuit, pression trop haute, canister).'],
  ['Sonde lambda amont', 'À saut : oscille entre 0,1 et 0,9 V plusieurs fois par seconde, moteur chaud. Large bande : lambda proche de 1,00.'],
  ['Sonde lambda aval', 'Stable vers 0,5 à 0,8 V si le catalyseur travaille. Si elle recopie l’amont, le catalyseur est fatigué.'],
  ['Température liquide', '85 à 105 °C moteur chaud. Reste sous 75 °C en roulant : thermostat bloqué ouvert.'],
  ['Pression collecteur, essence atmo', 'Contact mis moteur arrêté : environ 100 kPa. Ralenti chaud : environ 25 à 40 kPa.'],
  ['Débitmètre', 'Ralenti chaud : 2 à 4 g/s pour un 1,6 à 2,0 L essence. Pleine charge : environ 0,8 × la puissance en chevaux, en g/s.'],
  ['Consigne contre mesure', 'Turbo, pression rail, EGR, papillon : compare toujours la valeur demandée et la valeur mesurée, en charge. L’écart qui se creuse montre l’organe qui ne suit pas.'],
  ['Diesel common rail', 'Pression rail au ralenti : souvent 250 à 400 bar. Corrections d’injecteurs proches de zéro : un cylindre à part est suspect.'],
  ['Réseau CAN', '60 ohms entre les broches 6 et 14 de la prise diagnostic, batterie débranchée. CAN haut vers 2,7 V, CAN bas vers 2,3 V.'],
];

export function BaseView({ app }: { app: App }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [busy, setBusy] = useState('');
  const [pids, setPids] = useState<Pid[]>([]);
  const [pq, setPq] = useState('');
  const [nd, setNd] = useState({ code: '', text: '', notes: '' });
  const total = app.packs.reduce((n, p) => n + p.count, 0);

  useEffect(() => { let alive = true; const t = setTimeout(() => void searchTitles(app.db, q).then((r) => alive && setHits(r)), 150); return () => { alive = false; clearTimeout(t); }; }, [q, app.packs]);
  useEffect(() => { void getExtra<{ pids?: Pid[] }>(app.db, 'generique').then((x) => setPids(x?.pids || [])); }, [app.packs]);

  const diagnoseCode = (code: string) => { app.setDraft({ ...emptyDraft(), input: code }); app.go('diag'); app.toast('Touche « Chercher la panne »'); };
  const importPack = async (file: File) => {
    setBusy('Lecture du paquet…');
    try {
      const pack = await readPackFile(file);
      const meta = await installPack(app.db, pack, (d, t) => setBusy(`Installation : ${d} / ${t}`));
      await app.reload();
      app.toast(`${meta.name} : ${meta.count} fiches installées${meta.removedByRule ? `, ${meta.removedByRule} passages retirés par la règle antipollution` : ''}.`);
    } catch (e) { app.toast((e as Error).message || 'Paquet illisible.'); }
    setBusy('');
  };
  const addDef = async () => {
    const code = parseCodes(nd.code, { hexHint: true })[0]?.code;
    if (!code || !nd.text.trim()) { app.toast('Il faut un code et sa définition.'); return; }
    await putDef(app.db, { code, brand: '', text: nd.text.trim(), notes: nd.notes.trim() });
    await app.reload(); setNd({ code: '', text: '', notes: '' }); app.toast('Définition enregistrée');
  };

  return (
    <>
      <h2>Base de codes</h2>
      <p class="note">{total.toLocaleString('fr-FR')} fiches dans le téléphone. Cherche par code ou par mot : lambda, turbo, injecteur, oxygen, boost…</p>
      <input class="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="P0299, débitmètre, EGR…" aria-label="Chercher un code" autocapitalize="off" />
      {hits.map((h) => (
        <button class="item" key={h.pack + h.code} onClick={() => diagnoseCode(h.code)}>
          <div class="t1"><span class="codes">{h.code}</span><span class="tag">{app.packs.find((p) => p.id === h.pack)?.name.split(/[ :(]/)[0] || h.pack}</span></div>
          <div>{h.title}</div>{h.orig && <div class="orig">{h.orig}</div>}
        </button>
      ))}
      {q.trim().length > 1 && !hits.length && <p class="note">Rien trouvé. Les libellés génériques non traduits sont en anglais : essaie oxygen, boost, injector, misfire.</p>}

      <Fold title="Mes définitions" hint={`${app.defs.length} enregistrée${app.defs.length > 1 ? 's' : ''}`}>
        <p class="note">Pour les codes absents des bases libres (Renault DF, BMW hexadécimal, codes rares) : recopie le libellé de ta valise, il servira à chaque fois.</p>
        {app.defs.map((d) => (
          <div key={d.id} style="border-top:1px solid var(--line);padding:8px 0">
            <div class="row between"><b>{d.code}{d.brand ? <span class="muted"> · {d.brand}</span> : null}</b><ConfirmButton class="small ghost" label="Retirer" confirm="Retirer ?" onConfirm={async () => { await deleteDef(app.db, d.id); await app.reload(); }} /></div>
            <div>{d.text}</div>{d.notes && <div class="note">{d.notes}</div>}
          </div>
        ))}
        <div class="grid" style="margin-top:8px">
          <div class="f"><label for="nd_code">Code</label><input id="nd_code" value={nd.code} onInput={(e) => setNd({ ...nd, code: (e.target as HTMLInputElement).value.toUpperCase() })} placeholder="DF025" autocapitalize="characters" /></div>
          <div class="f"><label for="nd_text">Définition</label><input id="nd_text" value={nd.text} onInput={(e) => setNd({ ...nd, text: (e.target as HTMLInputElement).value })} /></div>
          <div class="f full"><label for="nd_notes">Notes</label><input id="nd_notes" value={nd.notes} onInput={(e) => setNd({ ...nd, notes: (e.target as HTMLInputElement).value })} /></div>
          <div class="f full"><button class="btn" onClick={() => void addDef()}>Ajouter la définition</button></div>
        </div>
      </Fold>

      <Fold title="Paquets installés" hint={`${app.packs.length} paquet${app.packs.length > 1 ? 's' : ''}`}>
        {app.packs.map((p) => (
          <div key={p.id} style="border-top:1px solid var(--line);padding:8px 0">
            <div class="row between"><b>{p.name}</b><span class="tag">v{p.version}</span></div>
            <div class="note" style="margin:2px 0">{p.count.toLocaleString('fr-FR')} fiches · {p.source} · {p.license}</div>
            {!['generique', 'constructeurs', 'psa', 'vag5', 'bmw-hex'].includes(p.id) && <ConfirmButton class="small ghost" label="Désinstaller" confirm="Désinstaller ce paquet ?" onConfirm={async () => { await removePack(app.db, p.id); await app.reload(); }} />}
          </div>
        ))}
        <label class="btn block" style="margin-top:8px">{busy || 'Importer ou mettre à jour un paquet (.json ou .json.gz)'}
          <input type="file" hidden disabled={!!busy} onChange={(e) => { const t = e.target as HTMLInputElement; const f = t.files?.[0]; t.value = ''; if (f) void importPack(f); }} />
        </label>
        <p class="note">Un paquet remplace sa version précédente. Tes cas et tes définitions ne sont jamais touchés. Le format est décrit dans le fichier PAQUETS.md du projet.</p>
      </Fold>

      <Fold title="Repères de données live" hint="valeurs typiques moteur chaud">
        <p class="note">La valeur constructeur exacte prime toujours.</p>
        {REFS.map(([k, t]) => <div key={k} style="border-top:1px solid var(--line);padding:8px 0"><b>{k}</b><div>{t}</div></div>)}
      </Fold>
      <Fold title="PIDs OBD standard" hint={`${pids.length} PIDs`}>
        <input class="search" value={pq} onInput={(e) => setPq((e.target as HTMLInputElement).value)} placeholder="fuel trim, MAF, coolant…" aria-label="Chercher un PID" />
        <table><thead><tr><th>PID</th><th>Donnée</th><th>Unité</th><th>Plage</th></tr></thead><tbody>
          {pids.filter((p) => !pq || p.n.toLowerCase().includes(pq.toLowerCase()) || p.p.toLowerCase() === pq.toLowerCase()).slice(0, 120).map((p) => <tr key={p.p}><td><b>01 {p.p}</b></td><td>{p.n}</td><td>{p.u}</td><td>{p.r ? p.r.join(' à ') : ''}</td></tr>)}
        </tbody></table>
      </Fold>
    </>
  );
}
