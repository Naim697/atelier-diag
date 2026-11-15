import { useState } from 'preact/hooks';
import type { App } from './app';
import type { Case, Fuel } from '../core/types';
import { blankCase, deleteCase, putCase } from '../db/db';
import { codesToText, parseCodes } from '../core/codes';
import { BRANDS, detectBrand } from '../core/brands';
import { causeCat, CATS } from '../core/classify';
import { violatesEmissionRule } from '../core/guard';
import { ConfirmButton, Field, PhotoStrip, Select, TextMic } from './bits';

/** Fiche de cas : la mémoire de l'atelier. Chaque cas résolu améliore les recherches suivantes. */
export function CaseSheet({ app, initial, onClose, onSaved }: { app: App; initial: Case | null; onClose(): void; onSaved(c: Case): void }) {
  const isNew = !initial || !app.cases.some((c) => c.id === initial.id);
  const [c, setC] = useState<Case>(() => initial || blankCase());
  const [codesText, setCodesText] = useState(() => codesToText((initial || c).codes));
  const set = (patch: Partial<Case>) => setC((x) => ({ ...x, ...patch }));
  const cats: [string, string][] = [['', 'Catégorie devinée automatiquement'], ...Object.entries(CATS)];

  const save = async () => {
    const codes = parseCodes(codesText, { hexHint: c.brand === 'BMW' }).map((n) => ({ ...n, label: c.codes.find((o) => o.code === n.code)?.label, ecu: c.codes.find((o) => o.code === n.code)?.ecu }));
    if (c.status === 'ok' && !c.cause.trim()) { app.toast('Note la cause réelle avant de marquer résolu.'); document.getElementById('c_cause')?.focus(); return; }
    const saved = await putCase(app.db, { ...c, codes, causeCat: c.causeCat || (c.cause ? causeCat(c.cause) : '') });
    await app.reload();
    if (violatesEmissionRule(`${saved.cause} ${saved.fix} ${saved.notes}`)) app.toast('Fiche enregistrée. Elle ne sera pas reprise comme suggestion (règle antipollution).');
    else app.toast(saved.status === 'ok' ? 'Cas résolu enregistré' : 'Cas enregistré');
    onSaved(saved); onClose();
  };
  const resume = () => {
    app.setDraft({ input: codesToText(c.codes), vehicle: { plate: c.plate, brand: c.brand, model: c.model, engine: c.engine, fuel: c.fuel, km: c.km }, sym: c.sym, live: c.live, codeStatus: c.codeStatus, codes: c.codes, results: c.steps || [], caseId: c.id, photoIds: c.photoIds || [], started: true });
    app.go('diag'); onClose();
  };

  return (
    <div class="sheet" role="dialog" aria-modal="true" aria-label="Fiche de cas"><div class="in">
      <div class="bar"><h2>{isNew ? 'Nouveau cas' : 'Fiche de cas'}</h2><button class="btn small ghost" onClick={onClose}>Fermer</button></div>
      <div class="card"><div class="bd"><div class="grid">
        <div class="f"><label for="c_date">Date</label><input id="c_date" type="date" value={c.date} onInput={(e) => set({ date: (e.target as HTMLInputElement).value })} /></div>
        <Select id="c_status" label="Statut" value={c.status} onChange={(x) => set({ status: x as Case['status'] })} options={[['wip', 'En cours'], ['ok', 'Résolu']]} />
        <Field id="c_codes" label="Codes défaut" value={codesText} onChange={setCodesText} upper full placeholder="P0299 P0401-13" />
        <Field id="c_plate" label="Immatriculation ou VIN" value={c.plate} onChange={(x) => set({ plate: x.toUpperCase() })} upper full />
        <Select id="c_brand" label="Marque" value={c.brand in BRANDS || !c.brand ? c.brand : ''} onChange={(x) => set({ brand: x })} options={[['', c.brand && !(c.brand in BRANDS) ? c.brand : 'Marque inconnue'], ...Object.entries(BRANDS).sort((a, b) => a[1].localeCompare(b[1]))]} />
        <Field id="c_model" label="Modèle et année" value={c.model} onChange={(x) => set({ model: x, brand: c.brand || detectBrand(x) })} />
        <Field id="c_engine" label="Moteur" value={c.engine} onChange={(x) => set({ engine: x })} />
        <Select id="c_fuel" label="Carburant" value={c.fuel} onChange={(x) => set({ fuel: x as Fuel })} options={[['', 'Non précisé'], ['essence', 'Essence'], ['diesel', 'Diesel'], ['hybride', 'Hybride'], ['gpl', 'GPL ou E85'], ['electrique', 'Électrique']]} />
        <Field id="c_km" label="Kilométrage" value={c.km == null ? '' : String(c.km)} onChange={(x) => { const n = parseInt(x.replace(/\D/g, ''), 10); set({ km: Number.isFinite(n) ? n : null }); }} inputmode="numeric" />
      </div></div></div>
      <div class="card"><div class="bd"><div class="grid">
        <TextMic id="c_sym" label="Symptômes" value={c.sym} onChange={(x) => set({ sym: x })} toast={app.toast} />
        <TextMic id="c_live" label="Freeze frame et données live" value={c.live} onChange={(x) => set({ live: x })} toast={app.toast} />
        <TextMic id="c_tests" label="Contrôles réalisés et résultats" value={c.tests} onChange={(x) => set({ tests: x })} toast={app.toast} rows={4} />
      </div></div></div>
      <div class="card ok"><div class="bd"><div class="grid">
        <TextMic id="c_cause" label="Cause réelle trouvée" value={c.cause} onChange={(x) => set({ cause: x })} toast={app.toast} placeholder="Ce qui était vraiment en cause" />
        <Select id="c_cat" label="Catégorie de la cause" value={c.causeCat in CATS ? c.causeCat : ''} onChange={(x) => set({ causeCat: x })} options={cats} full />
        <TextMic id="c_fix" label="Réparation effectuée" value={c.fix} onChange={(x) => set({ fix: x })} toast={app.toast} />
        <Field id="c_cost" label="Pièces et coût" value={c.cost} onChange={(x) => set({ cost: x })} />
        <Field id="c_time" label="Temps passé" value={c.time} onChange={(x) => set({ time: x })} />
        <TextMic id="c_notes" label="Notes et pièges" value={c.notes} onChange={(x) => set({ notes: x })} toast={app.toast} placeholder="Ce que tu aurais aimé savoir avant" />
      </div>
      <p class="lbl" style="margin:12px 0 0">Photos</p>
      <PhotoStrip db={app.db} ownerId={c.id} ids={c.photoIds || []} onChange={(ids) => set({ photoIds: ids })} toast={app.toast} />
      </div></div>
      {!isNew && (
        <div class="row" style="margin:12px 0">
          <button class="btn grow" onClick={resume}>Reprendre le diagnostic</button>
          <ConfirmButton class="ghost" label="Supprimer" confirm="Supprimer ce cas ?" onConfirm={async () => { await deleteCase(app.db, c.id); await app.reload(); app.toast('Cas supprimé'); onClose(); }} />
        </div>
      )}
      <div class="foot"><button class="btn pri" onClick={() => void save()}>Enregistrer le cas</button></div>
    </div></div>
  );
}
