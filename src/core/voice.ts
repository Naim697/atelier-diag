import { parseCodes, codesToText } from './codes';
import { detectBrand, detectEngine, detectFuel } from './brands';
import type { CodeRef, Fuel } from './types';

const DIGITS: Record<string, string> = {
  'zéro': '0', zero: '0', 'un': '1', une: '1', deux: '2', trois: '3', quatre: '4', cinq: '5', six: '6', sept: '7', huit: '8', neuf: '9',
};
const LETTERS: Record<string, string> = { p: 'P', 'pé': 'P', pe: 'P', b: 'B', 'bé': 'B', be: 'B', c: 'C', 'cé': 'C', ce: 'C', u: 'U', hu: 'U' };
const HEXWORD: Record<string, string> = { a: 'A', b: 'B', 'bé': 'B', c: 'C', 'cé': 'C', d: 'D', 'dé': 'D', e: 'E', f: 'F', effe: 'F' };

/**
 * Remet en forme les codes dictés : « p zéro un sept un », « P 0 171 », « u zéro un zéro zéro ».
 * La reconnaissance vocale découpe souvent les codes ; on les recolle avant la lecture normale.
 */
export function joinSpokenCodes(text: string): string {
  const tokens = text.split(/(\s+)/);
  const words = tokens.filter((_, i) => i % 2 === 0);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const w = words[i].toLowerCase().replace(/[.,;:]$/, '');
    const letter = LETTERS[w];
    if (letter) {
      let acc = '', j = i + 1;
      while (j < words.length && acc.length < 4) {
        const x = words[j].toLowerCase().replace(/[.,;:]$/, '');
        let piece = '';
        if (/^[0-9a-f]{1,4}$/i.test(x) && /\d/.test(x)) piece = x.toUpperCase();
        else if (DIGITS[x] != null) piece = DIGITS[x];
        else if (acc.length > 0 && HEXWORD[x]) piece = HEXWORD[x];
        else break;
        if (acc.length + piece.length > 4) break;
        acc += piece; j++;
      }
      if (acc.length === 4 && /^[0-3]/.test(acc)) { out.push(letter + acc); i = j; continue; }
    }
    out.push(words[i]); i++;
  }
  return out.join(' ');
}

export interface Dictation {
  codes: CodeRef[];
  brand: string;
  model: string;
  engine: string;
  fuel: Fuel;
  km: number | null;
  plate: string;
  sym: string;
}

/** Transforme une phrase dictée ou tapée d'un trait en fiche pré-remplie. */
export function parseDictation(raw: string): Dictation {
  let text = joinSpokenCodes(raw.replace(/\s+/g, ' ').trim());
  let km: number | null = null;
  text = text.replace(/(\d{1,3}(?:[ .]\d{3})+|\d{2,7}) ?(?:km|kilom[èe]tres?|bornes)\b/i, (_, n: string) => { km = parseInt(n.replace(/\D/g, ''), 10); return ' '; });
  if (km == null) text = text.replace(/(\d{1,3}) ?(?:mille|k) ?(?:km|kilom[èe]tres?|bornes)?\b(?! ?euros?)/i, (_, n: string) => { km = parseInt(n, 10) * 1000; return ' '; });
  let plate = '';
  text = text.replace(/\b([A-HJ-NP-TV-Z]{2})[- ]?(\d{3})[- ]?([A-HJ-NP-TV-Z]{2})\b/, (_, a: string, b: string, c: string) => { plate = `${a}-${b}-${c}`; return ' '; });
  const brand = detectBrand(text);
  const codes = parseCodes(text, { hexHint: brand === 'BMW' });
  const engine = detectEngine(text);
  const fuel = detectFuel(text);
  // Le modèle : le morceau de phrase qui précède la motorisation et contient l'alias de marque.
  let model = '';
  const mm = /\b(?:peugeot|citro[eë]n|renault|dacia|volkswagen|vw|seat|skoda|audi|bmw|mini|mercedes|ford|fiat|opel|toyota|nissan|honda|kia|hyundai|mazda|volvo|suzuki)?\s?([a-zé0-9-]+(?: (?:[1-8]|i{1,3}|iv|v|vi{0,3}|aircross|picasso|sportback|variant|break|sw|tourer|phase ?\d))?)(?: (?:de )?((?:19|20)\d{2}))?/i;
  if (brand) {
    const seg = engine ? text.slice(0, Math.max(0, text.indexOf(engine))) : text;
    const words = seg.split(/[,.;]/).find((p) => detectBrand(p)) || '';
    const cleaned = words.replace(/\b(?:sur|une?|la|le|les|j'ai|voiture|v[ée]hicule|c'est|avec|code|d[ée]faut)\b/gi, ' ').replace(/\b[PBCU][0-3][0-9A-F]{3}\b/gi, ' ').replace(/\s+/g, ' ').trim();
    const m2 = mm.exec(cleaned);
    model = (m2 ? cleaned : '').slice(0, 40);
  }
  let sym = text;
  for (const c of codes) sym = sym.replace(new RegExp(`\\b${c.code[0]} ?${c.code.slice(1)}(?:[-:]?[0-9A-F]{2})?\\b`, 'i'), ' ');
  if (engine) sym = sym.replace(engine, ' ');
  if (model) sym = sym.replace(model, ' ');
  sym = sym.replace(/\b(?:codes?|d[ée]fauts?)\s*(?:et|,)?\s*(?=$|[,.;])/gi, ' ').replace(/^[\s,.;:]+|[\s,;:]+$/g, '').replace(/\s*,\s*,+/g, ',').replace(/\s{2,}/g, ' ').trim();
  return { codes, brand, model, engine, fuel, km, plate, sym };
}

export { codesToText };
