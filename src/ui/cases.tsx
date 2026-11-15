import { useMemo, useState } from 'preact/hooks';
import type { App } from './app';
import { codesToText } from '../core/codes';
import { brandLabel } from '../core/brands';
import { Icon } from './bits';

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

export function CasesView({ app }: { app: App }) {
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'' | 'ok' | 'wip'>('');
  const list = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    return app.cases.filter((c) => {
      if (only && c.status !== only) return false;
      if (!words.length) return true;
      const hay = fold([codesToText(c.codes), brandLabel(c.brand), c.model, c.engine, c.plate, c.sym, c.cause, c.fix, c.notes, c.tests].join(' '));
      return words.every((w) => hay.includes(w));
    });
  }, [app.cases, q, only]);
  const top = useMemo(() => {
    const n: Record<string, number> = {};
    app.cases.forEach((c) => c.codes.forEach((x) => (n[x.code] = (n[x.code] || 0) + 1)));
    return Object.entries(n).sort((a, b) => b[1] - a[1]).slice(0, 8);
  }, [app.cases]);
  const solved = app.cases.filter((c) => c.status === 'ok').length;
  return (
    <>
      <div class="row between"><h2>Mes cas</h2><button class="btn small pri" onClick={() => app.editCase(null)}><Icon.plus />Nouveau cas</button></div>
      <p class="note">{app.cases.length ? `${app.cases.length} cas, dont ${solved} résolu${solved > 1 ? 's' : ''}. Stockés dans ce téléphone : pense à la sauvegarde dans Réglages.` : 'Aucun cas pour l’instant. Chaque panne résolue enregistrée ici ressortira en premier quand le même code reviendra.'}</p>
      <input class="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="Chercher un code, un modèle, une cause…" aria-label="Chercher dans mes cas" />
      <div class="row" style="margin-top:8px">
        {([['', 'Tous'], ['ok', 'Résolus'], ['wip', 'En cours']] as const).map(([v, l]) => <button key={v} class={`btn small${only === v ? ' pri' : ' ghost'}`} onClick={() => setOnly(v)}>{l}</button>)}
        {top.map(([c, n]) => <button class="chip" key={c} onClick={() => setQ(c)}>{c} <span class="muted">{n}</span></button>)}
      </div>
      {list.map((c) => (
        <button class="item" key={c.id} onClick={() => app.editCase(c)}>
          <div class="t1"><span class="codes">{codesToText(c.codes) || 'Sans code'}</span><span class={`status ${c.status}`}>{c.status === 'ok' ? 'Résolu' : 'En cours'}</span></div>
          <div>{[brandLabel(c.brand).split(',')[0], c.model, c.engine].filter(Boolean).join(' ') || 'Véhicule non précisé'}{c.km ? <span class="muted"> · {c.km.toLocaleString('fr-FR')} km</span> : null}{c.plate ? <span class="tag" style="margin-left:6px">{c.plate}</span> : null}</div>
          {c.cause && <div style="margin-top:4px"><b>Cause : </b>{c.cause.length > 140 ? c.cause.slice(0, 140) + '…' : c.cause}</div>}
          <div class="muted" style="font-size:13px;margin-top:2px">{c.date}{c.photoIds?.length ? ` · ${c.photoIds.length} photo${c.photoIds.length > 1 ? 's' : ''}` : ''}</div>
        </button>
      ))}
      {app.cases.length > 0 && !list.length && <p class="note">Aucun cas ne correspond.</p>}
    </>
  );
}
