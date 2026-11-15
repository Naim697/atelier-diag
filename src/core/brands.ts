import type { Fuel } from './types';

export const BRANDS: Record<string, string> = {
  PSA: 'Peugeot, Citroën, DS, Opel récent', RENAULT: 'Renault, Dacia', VOLKSWAGEN: 'Volkswagen, Seat, Skoda', AUDI: 'Audi',
  BMW: 'BMW, Mini', MERCEDES: 'Mercedes-Benz', FORD: 'Ford', FIAT: 'Fiat, Alfa Romeo, Lancia', OPEL: 'Opel (avant 2018), Chevrolet',
  TOYOTA: 'Toyota', LEXUS: 'Lexus', NISSAN: 'Nissan', INFINITI: 'Infiniti', HONDA: 'Honda', ACURA: 'Acura', MAZDA: 'Mazda',
  KIA: 'Kia', HYUNDAI: 'Hyundai', MITSUBISHI: 'Mitsubishi', SUBARU: 'Subaru', SUZUKI: 'Suzuki', VOLVO: 'Volvo', JAGUAR: 'Jaguar, Land Rover',
  CHRYSLER: 'Chrysler', DODGE: 'Dodge', JEEP: 'Jeep', TESLA: 'Tesla',
};

/** Clés du paquet constructeurs à consulter pour une marque de l'appli. */
export const OEM_KEYS: Record<string, string[]> = {
  AUDI: ['AUDI', 'VOLKSWAGEN'], VOLKSWAGEN: ['VOLKSWAGEN', 'AUDI'], OPEL: ['GM', 'CHEVY'], BMW: ['BMW'], MERCEDES: ['MERCEDES'],
  FORD: ['FORD'], TOYOTA: ['TOYOTA', 'LEXUS'], LEXUS: ['LEXUS', 'TOYOTA'], NISSAN: ['NISSAN', 'INFINITI'], INFINITI: ['INFINITI', 'NISSAN'],
  HONDA: ['HONDA', 'ACURA'], ACURA: ['ACURA', 'HONDA'], MAZDA: ['MAZDA'], KIA: ['KIA'], HYUNDAI: ['KIA'], MITSUBISHI: ['MITSUBISHI'],
  FIAT: ['FIAT', 'ALFAROMEO'], SUBARU: ['SUBARU'], SUZUKI: ['SUZUKI'], JAGUAR: ['JAGUAR'], CHRYSLER: ['CHRYSLER'], DODGE: ['DODGE'], JEEP: ['JEEP'],
};

const ALIASES: [RegExp, string][] = [
  [/\b(peugeot|citro[eë]n|ds ?[3-9]|stellantis|psa|c[1-8]\b|c[3-5] ?(aircross|picasso|spacetourer)|berlingo|partner|expert|jumpy|jumper|boxer|xsara|saxo|rifter|traveller|dispatch|bipper|nemo)\b/i, 'PSA'],
  [/\b(renault|dacia|clio|m[eé]gane|sc[eé]nic|captur|kadjar|koleos|kangoo|twingo|trafic|master|laguna|espace|talisman|modus|fluence|zo[eé]|arkana|austral|duster|sandero|logan|lodgy|dokker|jogger|spring)\b/i, 'RENAULT'],
  [/\b(volkswagen|vw|seat|skoda|škoda|cupra|golf|polo|passat|tiguan|touran|touareg|t-?roc|t-?cross|caddy|transporter|t[456]\b|sharan|jetta|scirocco|arteon|up!?|leon|ibiza|ateca|arona|altea|alhambra|toledo|octavia|fabia|superb|kodiaq|karoq|yeti|rapid|scala|kamiq)\b/i, 'VOLKSWAGEN'],
  [/\b(audi|a[1-8]\b|q[2-8]\b|tt\b|s[3-8]\b|rs ?[3-7]\b)/i, 'AUDI'],
  [/\b(bmw|mini|s[eé]rie ?[1-8]|1[1-4]\d[di]\b|2[1-4]\d[di]\b|3[1-4]\d[di]\b|5[1-5]\d[di]\b|x[1-7]\b|cooper|countryman|clubman|e[3-9]\d\b|f[1-4]\d\b)/i, 'BMW'],
  [/\b(mercedes|benz|classe ?[a-eglsv]\b|[a-ec]\d{3} ?(cdi|d\b)|sprinter|vito|viano|cla\b|gla\b|glc\b|gle\b|glk\b|ml ?\d{3}|smart)\b/i, 'MERCEDES'],
  [/\b(ford|fiesta|focus|mondeo|kuga|c-?max|s-?max|b-?max|galaxy|transit|ranger|puma|ecosport|ka\+?)\b/i, 'FORD'],
  [/\b(fiat|alfa|lancia|abarth|punto|panda|500[lx]?\b|tipo|doblo|ducato|bravo|stilo|giulietta|mito|159|147|ypsilon|scudo|fiorino)\b/i, 'FIAT'],
  [/\b(opel|vauxhall|chevrolet|corsa|astra|insignia|zafira|meriva|mokka|vivaro|movano|combo|crossland|grandland|adam|cruze|aveo|captiva|spark)\b/i, 'OPEL'],
  [/\b(toyota|yaris|corolla|auris|avensis|rav ?4|prius|c-?hr|aygo|hilux|verso|land ?cruiser|proace)\b/i, 'TOYOTA'],
  [/\b(lexus)\b/i, 'LEXUS'],
  [/\b(nissan|qashqai|juke|micra|x-?trail|note|navara|leaf|pulsar|nv ?[234]00|primastar|interstar)\b/i, 'NISSAN'],
  [/\b(honda|civic|jazz|cr-?v|hr-?v|accord)\b/i, 'HONDA'],
  [/\b(mazda|cx-?[3-9]|mx-?5)\b/i, 'MAZDA'],
  [/\b(kia|ceed|sportage|picanto|rio|sorento|stonic|niro|venga)\b/i, 'KIA'],
  [/\b(hyundai|i[1234]0\b|tucson|kona|santa ?fe|ix ?[23]5)\b/i, 'HYUNDAI'],
  [/\b(mitsubishi|outlander|asx|l200|pajero|colt)\b/i, 'MITSUBISHI'],
  [/\b(subaru|impreza|forester|outback)\b/i, 'SUBARU'],
  [/\b(suzuki|swift|vitara|jimny|sx4|ignis)\b/i, 'SUZUKI'],
  [/\b(volvo|v[4-9]0\b|s[4-9]0\b|xc ?[4-9]0)\b/i, 'VOLVO'],
  [/\b(jaguar|land ?rover|range ?rover|evoque|discovery|freelander|defender)\b/i, 'JAGUAR'],
  [/\b(jeep|compass|renegade|cherokee|wrangler)\b/i, 'JEEP'],
  [/\b(tesla|model ?[3sxy])\b/i, 'TESLA'],
  [/\b(10[678]|20[5678]|30[1678]|40[5678]|508|607|807|1007|2008|3008|4007|4008|5008)\b/i, 'PSA'],
];

export function detectBrand(text: string): string {
  for (const [re, key] of ALIASES) if (re.test(text)) return key;
  return '';
}

const OEM_LABELS: Record<string, string> = { ALFAROMEO: 'Alfa Romeo', GM: 'GM, Opel', CHEVY: 'Chevrolet', GMC: 'GMC', BUICK: 'Buick', CADILLAC: 'Cadillac', PONTIAC: 'Pontiac', SATURN: 'Saturn', OLDSMOBILE: 'Oldsmobile', LINCOLN: 'Lincoln', MERCURY: 'Mercury', PLYMOUTH: 'Plymouth', GEO: 'Geo' };

export function brandLabel(key: string): string {
  return BRANDS[key] || OEM_LABELS[key] || key || '';
}

const ENGINE_RE = /\b\d[.,]\d ?l?\b ?(?:blue ?hdi|e-?hdi|hdi|blue ?dci|dci|tdi|tsi|tfsi|fsi|tce|sce|vti|thp|pure ?tech|cdti|ecotec|jtdm?|multijet|tdci|eco ?boost|ecoblue|d-?4d|crdi|gdi|mpi|e-?tech|skyactiv|16v|8v|turbo|gti|hybrid|bifuel|gpl)?(?: ?\d{2,3}(?! ?000| ?km)\b)?(?: ?(?:ch|cv))?/i;
const ENGINE_WORD_RE = /\b(?:blue ?hdi|hdi|dci|tdi|tsi|tfsi|tce|vti|thp|pure ?tech|cdti|jtd|multijet|tdci|eco ?boost|crdi)\b(?: ?\d{2,3}\b)?/i;

export function detectEngine(text: string): string {
  const m = ENGINE_RE.exec(text) || ENGINE_WORD_RE.exec(text);
  return m ? m[0].trim().replace(/\s+/g, ' ') : '';
}

export function detectFuel(text: string): Fuel {
  const t = text.toLowerCase();
  if (/\b(hybrid\w*|e-?tech|hsd|phev)\b/.test(t)) return 'hybride';
  if (/\b(gpl|bifuel|lpg)\b/.test(t)) return 'gpl';
  if (/\b(blue ?hdi|e-?hdi|hdi|blue ?dci|dci|tdi|sdi|cdti|jtdm?|multijet|tdci|ecoblue|d-?4d|crdi|cdi|diesel|gazole|dti|dtec|\d{3}d)\b/.test(t)) return 'diesel';
  if (/\b(tsi|tfsi|fsi|tce|sce|vti|thp|pure ?tech|eco ?boost|gdi|mpi|essence|16v|8v|vvt-?i|\d{3}i|e85|[ée]thanol)\b/.test(t)) return 'essence';
  if (/\b([ée]lectrique|ev\b|zo[eé]|leaf|tesla)\b/.test(t)) return 'electrique';
  return '';
}
