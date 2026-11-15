import { useEffect, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { listen, speechAvailable, speechErrorMessage, type Listening } from './speech';
import { compressImage } from './photos';
import { addPhoto, deletePhoto, getPhoto, type Db } from '../db/db';

const P = (d: string) => () => <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d={d} /></svg>;
export const Icon = {
  engine: P('M4 9h2V7h3V5h6v2h2l2 2h1V7h2v8h-2v-2h-1l-2 3h-4v2H8v-2H6v-2H4v2H2V9h2z'),
  mic: P('M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V22h2v-3.1A7 7 0 0 0 19 12h-2z'),
  stop: P('M7 7h10v10H7z'),
  camera: P('M9 4 7.5 6H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-3.5L15 4H9zm3 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8z'),
  search: P('M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z'),
  folder: P('M3 5h7l2 2h9v12H3V5zm2 4v8h14V9H5z'),
  book: P('M5 3h12a2 2 0 0 1 2 2v16H7a2 2 0 0 1-2-2V3zm2 2v12h10V5H7zm2 2h6v2H9V7zm0 4h6v2H9v-2z'),
  gear: P('M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm8.9 5a7 7 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L16.5 3h-4l-.3 2.9a7 7 0 0 0-1.7 1l-2.4-1-2 3.5 2 1.6a7 7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.3 3h4l.3-2.9a7 7 0 0 0 1.7-1l2.4 1 2-3.5-2-1.6z'),
  plus: P('M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z'),
  check: P('M9.5 16.2 5.3 12l-1.4 1.4 5.6 5.6 11-11-1.4-1.4z'),
  x: P('M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z'),
};

/** Bouton micro : dicte et envoie le texte reconnu. Invisible si le téléphone n'a pas la dictée du navigateur. */
export function Mic(props: { onText(t: string): void; toast(m: string): void; big?: boolean; label?: string; onInterim?(t: string): void }) {
  const [on, setOn] = useState(false);
  const ref = useRef<Listening | null>(null);
  useEffect(() => () => ref.current?.stop(), []);
  if (!speechAvailable()) return null;
  const toggle = () => {
    if (on) { ref.current?.stop(); return; }
    const l = listen({
      onFinal: (t) => { if (t) props.onText(t); },
      onInterim: props.onInterim,
      onEnd: (err) => { setOn(false); ref.current = null; props.onInterim?.(''); if (err) { const m = speechErrorMessage(err); if (m) props.toast(m); } },
    });
    if (!l) { props.toast('Dictée indisponible ici. Utilise le micro du clavier.'); return; }
    ref.current = l; setOn(true);
  };
  return (
    <button type="button" class={`btn mic${on ? ' on' : ''}${props.big ? ' big dark' : ''}`} onClick={toggle} aria-pressed={on} aria-label={on ? 'Arrêter la dictée' : props.label || 'Dicter'} title={on ? 'Arrêter la dictée' : 'Dicter'}>
      {on ? <Icon.stop /> : <Icon.mic />}{props.big && <span>{on ? 'J’écoute… touche pour arrêter' : props.label || 'Dicter'}</span>}
    </button>
  );
}

/** Zone de texte avec micro : le texte dicté s'ajoute à la suite. */
export function TextMic(props: { id: string; label: string; value: string; onChange(v: string): void; toast(m: string): void; placeholder?: string; rows?: number; full?: boolean }) {
  return (
    <div class={`f${props.full === false ? '' : ' full'}`}>
      <label for={props.id}>{props.label}</label>
      <div class="withmic">
        <textarea id={props.id} rows={props.rows || 3} value={props.value} placeholder={props.placeholder} onInput={(e) => props.onChange((e.target as HTMLTextAreaElement).value)} />
        <Mic toast={props.toast} label={`Dicter : ${props.label}`} onText={(t) => props.onChange((props.value ? props.value.replace(/\s+$/, '') + (/[.!?:;,]$/.test(props.value.trim()) ? ' ' : '. ') : '') + t.charAt(0).toUpperCase() + t.slice(1))} />
      </div>
    </div>
  );
}

function Thumb(props: { db: Db; id: string; onOpen(url: string): void }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let u = '', alive = true;
    void getPhoto(props.db, props.id).then((p) => { if (p && alive) { u = URL.createObjectURL(p.blob); setUrl(u); } });
    return () => { alive = false; if (u) URL.revokeObjectURL(u); };
  }, [props.id]);
  return <button type="button" class="ph" onClick={() => url && props.onOpen(url)} aria-label="Voir la photo">{url && <img src={url} alt="Photo jointe" />}</button>;
}

/** Photos jointes : écran de la valise, pièce, connecteur. Stockées dans le téléphone. */
export function PhotoStrip(props: { db: Db; ownerId: string; ids: string[]; onChange(ids: string[]): void; toast(m: string): void }) {
  const [view, setView] = useState<{ url: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const ids = [...props.ids];
      for (const f of Array.from(files)) { const p = await addPhoto(props.db, props.ownerId, await compressImage(f)); ids.push(p.id); }
      props.onChange(ids);
    } catch { props.toast('Photo non enregistrée : mémoire du téléphone pleine ?'); }
    setBusy(false);
  };
  return (
    <div class="photos">
      {props.ids.map((id) => <Thumb key={id} db={props.db} id={id} onOpen={(url) => setView({ url, id })} />)}
      <label class="ph add" aria-label="Prendre ou joindre une photo" style={busy ? 'opacity:.5' : ''}>
        <Icon.camera />
        <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { const t = e.target as HTMLInputElement; void add(t.files); t.value = ''; }} />
      </label>
      {view && (
        <div class="viewer" onClick={() => setView(null)}>
          <img src={view.url} alt="Photo jointe" />
          <div class="row">
            <button class="btn badb" onClick={async (e) => { e.stopPropagation(); await deletePhoto(props.db, view.id); props.onChange(props.ids.filter((x) => x !== view.id)); setView(null); }}>Supprimer</button>
            <button class="btn">Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function Field(props: { id: string; label: string; value: string; onChange(v: string): void; placeholder?: string; full?: boolean; inputmode?: 'numeric' | 'text'; upper?: boolean }) {
  return (
    <div class={`f${props.full ? ' full' : ''}`}>
      <label for={props.id}>{props.label}</label>
      <input id={props.id} type="text" value={props.value} placeholder={props.placeholder} inputMode={props.inputmode} autocomplete="off" autocapitalize={props.upper ? 'characters' : undefined}
        style={props.upper ? 'text-transform:uppercase' : undefined} onInput={(e) => props.onChange((e.target as HTMLInputElement).value)} />
    </div>
  );
}

export function Select(props: { id: string; label: string; value: string; onChange(v: string): void; options: [string, string][]; full?: boolean }) {
  return (
    <div class={`f${props.full ? ' full' : ''}`}>
      <label for={props.id}>{props.label}</label>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange((e.target as HTMLSelectElement).value)}>
        {props.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}

export function Fold(props: { title: string; hint?: string; open?: boolean; children: ComponentChildren }) {
  return <details class="fold" open={props.open}><summary>{props.title}{props.hint && <span>{props.hint}</span>}</summary><div class="bd">{props.children}</div></details>;
}

/** Télécharge ou partage un fichier depuis le téléphone. */
export async function saveFile(name: string, text: string, type = 'application/json'): Promise<void> {
  const blob = new Blob([text], { type });
  const file = new File([blob], name, { type });
  const nav = navigator as Navigator & { canShare?(d: { files: File[] }): boolean };
  if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await nav.share({ files: [file], title: name }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Bouton à deux touches pour les actions qui effacent quelque chose. */
export function ConfirmButton(props: { label: string; confirm: string; onConfirm(): void; class?: string }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => { if (!armed) return; const t = setTimeout(() => setArmed(false), 3500); return () => clearTimeout(t); }, [armed]);
  return <button type="button" class={armed ? 'btn badb ' + (props.class || '').replace('ghost', '') : 'btn ' + (props.class || '')} onClick={() => { if (armed) { setArmed(false); props.onConfirm(); } else setArmed(true); }}>{armed ? props.confirm : props.label}</button>;
}
