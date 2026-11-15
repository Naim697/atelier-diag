import type { Case, CodeRef, VehicleInfo } from './types';
import { violatesEmissionRule } from './guard';

const STOP = new Set('le la les un une des de du et ou à a au aux en sur dans pour par avec sans pas plus qui que quand est se ce il elle au très trop peu moteur voiture véhicule voyant code défaut'.split(' '));

export function tokens(text: string): string[] {
  return (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !STOP.has(w));
}

function normEngine(s: string): string {
  return (s || '').toLowerCase().replace(/,/g, '.').replace(/\s+/g, '').replace(/(ch|cv)$/, '');
}

export interface SimilarCase {
  case: Case;
  score: number;
  why: string[];
  sharedCodes: string[];
  hidden: boolean; // réparation masquée par la règle antipollution
}

/**
 * Cherche dans les cas enregistrés ceux qui ressemblent à la panne en cours.
 * Un cas ressort s'il partage un code, ou s'il s'agit du même moteur avec des symptômes proches.
 */
export function findSimilar(cases: Case[], ctx: { codes: CodeRef[]; vehicle: Partial<VehicleInfo>; sym: string }, excludeId?: string): SimilarCase[] {
  const codes = new Set(ctx.codes.map((c) => c.code));
  const symT = new Set(tokens(ctx.sym));
  const eng = normEngine(ctx.vehicle.engine || '');
  const modelT = new Set(tokens(ctx.vehicle.model || '').filter((t) => !/^(19|20)\d\d$/.test(t)));
  const out: SimilarCase[] = [];
  for (const c of cases) {
    if (c.deleted || c.id === excludeId) continue;
    const why: string[] = [];
    let score = 0;
    const shared = c.codes.map((x) => x.code).filter((x) => codes.has(x));
    if (shared.length) { score += 5 * shared.length; why.push(shared.length > 1 ? `${shared.length} codes en commun` : 'même code'); }
    const sameEngine = !!eng && normEngine(c.engine) === eng;
    if (sameEngine) { score += 3; why.push('même moteur'); }
    const sameModel = modelT.size > 0 && tokens(c.model).some((t) => modelT.has(t));
    if (sameModel) { score += 2; why.push('même modèle'); }
    const sameBrand = !!ctx.vehicle.brand && c.brand === ctx.vehicle.brand;
    if (sameBrand) { score += 1; if (!sameModel && !sameEngine) why.push('même marque'); }
    const symShared = tokens(c.sym).filter((t) => symT.has(t));
    if (symShared.length) { score += Math.min(3, symShared.length); why.push('symptômes proches'); }
    const relevant = shared.length > 0 || ((sameEngine || sameModel) && symShared.length >= 1) || symShared.length >= 3;
    if (!relevant) continue;
    if (c.status === 'ok' && c.cause) score += 2;
    out.push({ case: c, score, why, sharedCodes: shared, hidden: violatesEmissionRule(`${c.cause} ${c.fix} ${c.notes}`) });
  }
  return out.sort((a, b) => b.score - a.score || (b.case.date || '').localeCompare(a.case.date || ''));
}
