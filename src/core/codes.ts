import type { CodeRef } from './types';

const HEX = '0-9A-F';

/**
 * Lit tous les codes d'une saisie libre.
 * Formats reconnus : OBD (P0171, P0171-13, P164E00), Renault (DF001, DF 1012),
 * VAG ancien (5 chiffres), hexadécimal constructeur (BMW 4A63, 2E85).
 * Le format hexadécimal à 4 caractères n'est lu que s'il contient au moins un chiffre
 * et n'est pas un mot courant, ou si `hexHint` est vrai (marque BMW par exemple).
 */
export function parseCodes(input: string, opts: { hexHint?: boolean } = {}): CodeRef[] {
  const s = (input || '').toUpperCase();
  const out: CodeRef[] = [];
  const seen = new Set<string>();
  const taken: [number, number][] = [];
  const free = (a: number, b: number) => taken.every(([x, y]) => b <= x || a >= y);
  const add = (c: CodeRef, a: number, b: number) => {
    taken.push([a, b]);
    if (seen.has(c.code)) return;
    seen.add(c.code);
    out.push(c);
  };
  let m: RegExpExecArray | null;

  // OBD : lettre + 4 hexa, avec octet de type collé (7 caractères) ou séparé par - ou :
  const obd = new RegExp(`(?<![A-Z0-9])([PBCU])[ ]?([0-3][${HEX}]{3})(?:([${HEX}]{2})(?![${HEX}])|[ ]?[-:][ ]?([${HEX}]{1,2})(?![${HEX}]))?(?![A-Z0-9])`, 'g');
  while ((m = obd.exec(s))) {
    const ftRaw = m[3] ?? m[4];
    add({ code: m[1] + m[2], format: 'obd', ft: ftRaw != null ? parseInt(ftRaw, 16) : null }, m.index, m.index + m[0].length);
  }
  // Codes B/C/U constructeur dont le 2e caractère dépasse 3 (ex. BA6D1) : gardés tels quels
  const obdx = new RegExp(`(?<![A-Z0-9])([BCU])([${HEX}]{4})(?![A-Z0-9])`, 'g');
  while ((m = obdx.exec(s))) {
    if (!free(m.index, m.index + m[0].length)) continue;
    if (!/\d/.test(m[2])) continue;
    add({ code: m[1] + m[2], format: 'obd', ft: null }, m.index, m.index + m[0].length);
  }
  // Renault : DF + 1 à 4 chiffres
  const df = /(?<![A-Z0-9])DF[ ]?(\d{1,4})(?!\d)/g;
  while ((m = df.exec(s))) {
    if (!free(m.index, m.index + m[0].length)) continue;
    add({ code: 'DF' + m[1].padStart(3, '0'), format: 'df', ft: null }, m.index, m.index + m[0].length);
  }
  // VAG : 5 chiffres isolés
  const vag = /(?<![A-Z0-9.,])(\d{5})(?![0-9A-Z]|[ ]?KM)/g;
  while ((m = vag.exec(s))) {
    if (!free(m.index, m.index + m[0].length)) continue;
    add({ code: m[1], format: 'vag5', ft: null }, m.index, m.index + m[0].length);
  }
  // Hexadécimal constructeur : 4 à 6 caractères
  const hex = new RegExp(`(?<![A-Z0-9.,])(?:0X)?([${HEX}]{4}|[${HEX}]{6})(?![A-Z0-9]|[ ]?KM)`, 'g');
  while ((m = hex.exec(s))) {
    if (!free(m.index, m.index + m[0].length)) continue;
    const c = m[1];
    const hasDigit = /\d/.test(c), hasLetter = /[A-F]/.test(c);
    if (!hasDigit) continue;                       // FACE, DEAD… : des mots, pas des codes
    if (!hasLetter && !opts.hexHint) continue;     // 2016 : une année, sauf marque à codes hexa
    if (!hasLetter && /^(19|20)\d\d$/.test(c) && !m[0].startsWith('0X')) continue;
    add({ code: c, format: 'hex', ft: null }, m.index, m.index + m[0].length);
  }
  return out;
}

export function formatCode(c: Pick<CodeRef, 'code' | 'ft'>): string {
  return c.code + (c.ft != null ? '-' + c.ft.toString(16).toUpperCase().padStart(2, '0') : '');
}

export function codesToText(codes: CodeRef[]): string {
  return codes.map(formatCode).join(' ');
}

/** Famille SAE d'un code OBD : sert quand la base n'a pas de fiche. */
export function obdSystem(code: string): string {
  if (!/^[PBCU][0-3]/.test(code)) return '';
  const l = code[0], d = code[1], sub = code[2];
  const who = d === '0' || (l === 'P' && d === '2') || (l === 'P' && d === '3' && /[4-9]/.test(sub)) ? 'générique' : 'constructeur';
  if (l === 'B') return `Carrosserie (${who})`;
  if (l === 'C') return `Châssis (${who})`;
  if (l === 'U') return `Réseau et communication (${who})`;
  const P: Record<string, string> = {
    '0': 'Dosage air et carburant', '1': 'Dosage air et carburant', '2': 'Circuit d’injection',
    '3': 'Allumage et ratés', '4': 'Antipollution auxiliaire', '5': 'Ralenti, vitesse et entrées auxiliaires',
    '6': 'Calculateur et sorties', '7': 'Transmission', '8': 'Transmission', '9': 'Transmission',
    'A': 'Propulsion hybride', 'B': 'Propulsion hybride', 'C': 'Propulsion hybride',
  };
  return `Groupe motopropulseur, ${(P[sub] || 'divers').toLowerCase()} (${who})`;
}

export const isOemRange = (c: string) => /^(P[13]|[BCU][123])/.test(c) && !/^P3[4-9]/.test(c);

export function newId(prefix = 'c'): string {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export const normPlate = (s: string) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
