/**
 * Règle fixée par Naïm : l'appli ne propose jamais de suppression FAP, EGR ou AdBlue.
 * Ce module détecte ces propositions. Nettoyer, réparer, remplacer, déposer pour contrôle
 * ou régénérer restent des réparations normales et ne sont pas visés.
 */
const SYS = String.raw`(?:fap|dpf|gpf|filtres? [àa] particules|particulate filters?|(?:vanne |valve )?egr|recirculation des gaz|ad ?blue|scr|ur[ée]e|nox|catalyseurs?|catalytic converters?|\bcata\b|antipollution|d[ée]pollution)`;
// Verbes et noms qui désignent une neutralisation volontaire. Les mots qui décrivent seulement
// le comportement du calculateur (disable, bypass, off, without) n'en font pas partie.
const ACT = String.raw`(?:suppressions?|supprim\w*|d[ée]let(?:e|es|ed|ing|ion)|defeat(?: device)?s?|neutralis\w*|d[ée]sactiv\w*|[ée]mulat(?:eur|or)s?|obtur\w*|condamn\w*|blanking(?: off)?(?: plates?)?|blank(?:ed)? off|block(?:ing|ed)? off plates?|plaques? d.obturation|[ée]vid\w*|gutt?(?:ed|ing)|hollow(?:ed|ing) out|d[ée]pose d[ée]finitive|retir\w* d[ée]finitiv\w*|cod(?:ed|ing) out|mapp?(?:ed|ing) out|shunt\w*)`;
const A_THEN_S = new RegExp(`${ACT}[^.;\\n]{0,30}?${SYS}`, 'i');
const S_THEN_A = new RegExp(`${SYS}[^.;\\n]{0,20}?(?:${ACT})`, 'i');
const DIRECT = /d[ée]fap\w*|d[ée]cata\w*|\b(?:egr|dpf|fap|adblue|scr|nox)[- ]?off\b|\b(?:egr|dpf|fap|adblue|scr) delete|straight pipe|test pipe|\bsans (?:le |la |l.)?(?:fap|cata\w*|egr|adblue|filtre [àa] particules)\b|(?:fap|dpf|cata\w*) (?:vid[ée]|creus[ée]|perc[ée])/i;

/** Tournures légitimes : comportement du calculateur, composant « bypass » d'origine, essai moteur EGR fermée. */
const SAFE = /(?:switch(?:es|ed)?|turn(?:s|ed)?) (?:the )?(?:egr|dpf|scr) off|(?:with|while|when|and|if|at idle with) (?:the )?(?:egr|dpf|scr) (?:is |are |was )?off|(?:egr|dpf|scr|adblue) (?:is|are|was|were|stays|remains|gets|switched|turned|commanded) off|cooler bypass|bypass (?:valve|flap|actuator)|(?:ecu|ecm|pcm|module|engine|calculateur|system) (?:then )?(?:disables|deactivates|suspends|switches off|d[ée]sactive|coupe)|d[ée]sactiv\w* par le calculateur/i;

export function violatesEmissionRule(text: string | undefined | null): boolean {
  if (!text) return false;
  for (const sentence of splitSentences(text)) {
    if (SAFE.test(sentence)) continue;
    if (DIRECT.test(sentence)) return true;
    if (A_THEN_S.test(sentence) || S_THEN_A.test(sentence)) return true;
  }
  return false;
}

export function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?;])\s+|\n+/).filter(Boolean);
}

/** Retire les phrases interdites d'un texte. Renvoie le texte nettoyé et le nombre de phrases retirées. */
export function scrubText(text: string): { text: string; removed: number } {
  if (!text) return { text, removed: 0 };
  const parts = splitSentences(text);
  const kept = parts.filter((p) => !violatesEmissionRule(p));
  return { text: kept.join(' '), removed: parts.length - kept.length };
}

export const EMISSION_RULE_NOTE =
  'Atelier diag ne propose jamais de suppression de FAP, d’EGR ou d’AdBlue. Les pistes restent : contrôle, nettoyage, réparation, remplacement, régénération.';
