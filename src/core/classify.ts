import { ftbNature } from './ftb';

/** Catégories de cause : c'est sur elles que les contrôles agissent. */
export const CATS: Record<string, string> = {
  wiring: 'Faisceau, connecteur ou masse',
  power: 'Alimentation électrique : batterie, fusible, relais',
  sensor: 'Le capteur ou la sonde elle-même',
  actuator: 'L’actionneur : électrovanne, moteur, vanne',
  air_leak: 'Prise d’air à l’admission',
  boost_leak: 'Fuite sur le circuit de suralimentation',
  fuel: 'Alimentation en carburant : pompe, filtre, régulateur',
  injector: 'Injecteur',
  ignition: 'Allumage : bougie ou bobine',
  exhaust: 'Fuite ou restriction à l’échappement',
  clog: 'Encrassement ou colmatage',
  mechanical: 'Mécanique : distribution, compression, usure',
  fluid: 'Niveau ou qualité d’un fluide',
  network: 'Réseau CAN ou calculateur muet',
  ecu: 'Calculateur ou logiciel',
  part: 'La pièce surveillée par le code',
  other: 'Autre cause',
};

const CAT_RULES: [RegExp, string][] = [
  [/wir(ing|e)|harness|connector|corro|short(ed)? (to|circuit)|open circuit|chaf|terminal|\bpins?\b|faisceau|connecteur|c[âa]bl(age|e)|court-circuit|circuit ouvert|\bfils?\b|cosse|broche|oxyd|vert-de-gris|faux contact|\bmasse\b|tresse|bad ground|poor ground|ground (connection|strap|fault)/i, 'wiring'],
  [/\bfuse|relay|battery|power supply|supply voltage|alternator|charging system|fusible|relais|batterie|alimentation [ée]lectrique|alternateur|low system voltage/i, 'power'],
  [/can bus|can line|can network|data bus|network|termination resist|r[ée]seau|multiplex/i, 'network'],
  [/vacuum leak|intake (air )?leak|air leak|unmetered|intake manifold gasket|pcv|breather|prise d.air|durite de d[ée]pression|reniflard|d[ée]shuileur|joint de collecteur|false air/i, 'air_leak'],
  [/boost leak|intercooler|charge[- ]air|leak in the (charge|boost)|charge (pipe|hose|cooler)|boost (hose|pipe)|durite (de |du )?(turbo|suralimentation|d.air)|[ée]changeur|collier (de )?(turbo|durite)/i, 'boost_leak'],
  [/injector|injecteur/i, 'injector'],
  [/fuel (pump|filter|pressure|quality|supply|line|rail)|pressure regulator|low fuel|contaminated fuel|water in fuel|pompe (à|a) (carburant|essence|gazole)|pompe (hp|haute pression|de gavage)|filtre (à|a) (carburant|gazole|essence)|r[ée]gulateur de (d[ée]bit|pression)|limaille|metering (unit|valve)|suction control/i, 'fuel'],
  [/spark plug|ignition coil|coil pack|bougie d.allumage|bobine/i, 'ignition'],
  [/exhaust (leak|restriction|blockage)|back ?pressure|fuite (à|a) l.[ée]chappement/i, 'exhaust'],
  [/clog|carbon|soot|restrict|block(ed|age)|dirty|contaminat|plugged|build-?up|deposit|encrass|colmat|calamin|bouch|sticking due/i, 'clog'],
  [/timing (chain|belt)|compression|soupape|segment|joint de culasse|tendeur|coussinet|axe de turbo|burnt valve|valve (seat|spring|clearance)|camshaft (wear|lobe)|head gasket|piston|mechanical (fault|failure|damage|problem|wear)|worn|stretched|jumped|distribution|cha[îi]ne|courroie|usure|bearing|seized|gripp/i, 'mechanical'],
  [/oil level|low oil|wrong oil|oil (quality|viscosity|grade)|coolant level|low coolant|fluid (level|quality)|low fluid|refrigerant (charge|level)|niveau|adblue quality|def quality|diluted/i, 'fluid'],
  [/\b(ecm|pcm|ecu|tcm|bcm|bsi|ews|dde|dme)\b|control module|control unit|software|calculateur|logiciel|programming|calibration|calibrage|codage|synchronis|apprentissage|adaptation|mise (à|a) jour|bo[îi]tier (de servitude|[ée]lectronique)|passerelle/i, 'ecu'],
  [/sensor|sonde|capteur|d[ée]bitm[èe]tre|probe|switch|contacteur|potentiom|thermistor|transducer|sender/i, 'sensor'],
  [/solenoid|valve|actuator|motor\b|pump|thermostat|turbo|wastegate|fan|heater|glow plug|[ée]lectrovanne|vanne|actionneur|moteur |pompe|bougie de pr[ée]chauffage|ventilateur|clutch|compressor/i, 'actuator'],
];

export function causeCat(text: string): string {
  for (const [re, cat] of CAT_RULES) if (re.test(text)) return cat;
  return 'other';
}

export type FamilyKind = 'sensor' | 'actuator' | 'system';
export interface Family { id: string; label: string; kind: FamilyKind; re: RegExp }

/** Familles de composants, de la plus précise à la plus générale. */
export const FAMILIES: Family[] = [
  { id: 'airbag', label: 'Airbag et prétensionneurs', kind: 'system', re: /airbag|air bag|\bsrs\b|restraint|squib|pretension|deployment|crash sensor|occupant (class|detect)|pr[ée]tension|coussin gonflable/i },
  { id: 'immo', label: 'Antidémarrage', kind: 'system', re: /immobili[sz]er|anti-?theft|transponder|\bews\b|\bkey (not|code|learn)|antid[ée]marrage|\bcas\b.*(key|cl[ée])|theft deterrent/i },
  { id: 'scr', label: 'AdBlue, SCR et NOx', kind: 'system', re: /reductant|\bscr\b|ad ?blue|\bdef\b|\bnox\b|urea|ur[ée]e|selective catalytic/i },
  { id: 'dpf', label: 'Filtre à particules', kind: 'system', re: /particulate|\bdpf\b|\bgpf\b|\bfap\b|filtre (à|a) particules|soot (accum|load)|additif (fap|carburant)|fuel additive/i },
  { id: 'egr', label: 'Recirculation des gaz (EGR)', kind: 'system', re: /\begr\b|exhaust gas recirc|recirculation des gaz|recyclage des gaz/i },
  { id: 'catalyst', label: 'Catalyseur', kind: 'system', re: /catalyst|catalytic|catalyseur/i },
  { id: 'evap', label: 'Vapeurs d’essence (canister)', kind: 'system', re: /evap|purge|canister|fuel (tank|filler) cap|leak detection pump|vapou?r|r[ée]aspiration/i },
  { id: 'sai', label: 'Injection d’air secondaire', kind: 'system', re: /secondary air|air secondaire/i },
  { id: 'misfire', label: 'Ratés de combustion', kind: 'system', re: /misfire|rat[ée]s? (d.allumage|de combustion)/i },
  { id: 'glow', label: 'Préchauffage', kind: 'actuator', re: /glow ?plug|pr[ée]chauffage|bougies? de pr[ée]/i },
  { id: 'coil', label: 'Bobines d’allumage', kind: 'actuator', re: /ignition coil|coil [a-l] (primary|secondary)|bobine/i },
  { id: 'knock', label: 'Capteur de cliquetis', kind: 'sensor', re: /knock|cliquetis/i },
  { id: 'mixture', label: 'Richesse du mélange', kind: 'system', re: /system too (lean|rich)|fuel trim|too lean|too rich|m[ée]lange (trop )?(pauvre|riche)|richesse|air.fuel ratio imbalance/i },
  { id: 'o2', label: 'Sonde lambda', kind: 'sensor', re: /o2 sensor|oxygen sensor|ho2s|a\/f sensor|air.fuel ratio sensor|lambda|sonde (à|a) oxyg[èe]ne/i },
  { id: 'injector', label: 'Injecteurs', kind: 'actuator', re: /injector|injecteur|cylinder \d+ (contribution|balance)/i },
  { id: 'fuelp', label: 'Pression de carburant', kind: 'system', re: /fuel (rail|system)? ?pressure|rail pressure|fuel pump|fuel (volume|pressure) regulator|metering|pression (de )?(rail|rampe|carburant|gazole|essence)|pompe (à|a) (carburant|essence|gazole)|haute pression|fuel delivery/i },
  { id: 'turbo', label: 'Suralimentation', kind: 'system', re: /turbo|supercharger|boost|wastegate|charge(d)? air|underboost|overboost|suraliment|pression de suralim|vgt|vnt|g[ée]om[ée]trie variable/i },
  { id: 'maf', label: 'Débitmètre d’air', kind: 'sensor', re: /mass (or volume )?air ?flow|\bmaf\b|d[ée]bitm[èe]tre|air flow (sensor|meter)/i },
  { id: 'map', label: 'Capteur de pression d’admission', kind: 'sensor', re: /manifold (absolute )?pressure|\bmap\b|barometric|pression (d.admission|collecteur|atmosph)/i },
  { id: 'thermostat', label: 'Thermostat', kind: 'actuator', re: /thermostat|coolant temperature below|temp[ée]rature (moteur|d.eau) (trop basse|insuffisante)/i },
  { id: 'fan', label: 'Refroidissement moteur', kind: 'actuator', re: /cooling fan|radiator fan|engine (coolant )?over ?temp|overheat|motoventilateur|ventilateur de refroid|coolant pump|water pump|pompe (à|a) eau/i },
  { id: 'temp', label: 'Sonde de température', kind: 'sensor', re: /temperature (sensor|circuit)|\bect\b|\biat\b|coolant temp|intake air temp|sonde de temp|temp[ée]rature (d.eau|d.air|liquide|ext[ée]rieure|carburant|huile)|exhaust gas temp|\begt\b/i },
  { id: 'vvt', label: 'Calage et déphaseurs d’arbres à cames', kind: 'system', re: /camshaft position.{0,30}(timing|over-?advanced|over-?retarded|performance)|timing over|variable valve|\bvvt\b|vanos|valvetronic|cam(shaft)? (phas|adjust|actuator)|d[ée]phaseur|crankshaft.{0,30}camshaft.{0,30}correlation|correlation|valve lift/i },
  { id: 'ckp', label: 'Capteurs régime et position (vilebrequin, arbre à cames)', kind: 'sensor', re: /crankshaft position|camshaft position|engine speed (sensor|input)|\bckp\b|\bcmp\b|capteur (de )?(r[ée]gime|pmh|vilebrequin|arbre (à|a) cames)|r[ée]gime moteur/i },
  { id: 'throttle', label: 'Papillon et pédale d’accélérateur', kind: 'actuator', re: /throttle|pedal position|accelerator|\btps\b|\bapp\b|papillon|p[ée]dale d.acc[ée]l|idle (air )?control|ralenti/i },
  { id: 'oil', label: 'Pression et niveau d’huile', kind: 'system', re: /oil (pressure|level|temperature|control)|pression d.huile|niveau d.huile/i },
  { id: 'charge', label: 'Batterie et circuit de charge', kind: 'system', re: /system voltage|battery (voltage|sensor|monitor|state)|charging|alternator|generator|tension (batterie|d.alimentation|r[ée]seau de bord)|alternateur|\bibs\b/i },
  { id: 'trans', label: 'Boîte de vitesses et embrayage', kind: 'system', re: /transmission|gear (ratio|\d|position|shift)|shift solenoid|torque converter|clutch|\btcc\b|range (sensor|switch)|bo[îi]te de vitesses|embrayage|rapport|\bdsg\b|m[ée]catronique|turbine speed|output speed/i },
  { id: 'wheel', label: 'Capteurs de roue ABS', kind: 'sensor', re: /wheel speed|capteur (de )?(vitesse de )?roue|vitesse (de )?roue/i },
  { id: 'abs', label: 'ABS et ESP', kind: 'system', re: /\babs\b|\besp\b|\besc\b|brake (pressure|booster|assist)|hydraulic (pump|unit)|yaw|lateral accel|stability|traction control|freinage/i },
  { id: 'steer', label: 'Direction', kind: 'system', re: /steering|direction assist[ée]e|angle (de )?(braquage|volant)|\beps\b|torque sensor/i },
  { id: 'ac', label: 'Climatisation', kind: 'system', re: /a\/c|air condition|refrigerant|climatisation|compresseur de clim|fluide frigorig/i },
  { id: 'vss', label: 'Vitesse véhicule', kind: 'sensor', re: /vehicle speed|vitesse v[ée]hicule/i },
  { id: 'brake', label: 'Contacteur de frein', kind: 'sensor', re: /brake (switch|pedal|lamp|light)|stop ?lamp|contacteur (de )?(frein|stop)/i },
  { id: 'can', label: 'Communication entre calculateurs', kind: 'system', re: /lost communication|communication (bus|with|error|fault)|can (bus|communication|line)|data bus|invalid data received|no communication|bus off|absence de communication|r[ée]seau|multiplex|trame|message (manquant|absent)|software incompatib/i },
  { id: 'ecu', label: 'Calculateur', kind: 'system', re: /control module (memory|processor|performance|programming|internal|ram|rom|eeprom|vin|keep alive)|internal control module|\b(ecm|pcm|tcm)\b.{0,12}(processor|internal|memory)|calculateur.{0,20}(interne|m[ée]moire)|eeprom|checksum|d[ée]faut interne/i },
  { id: 'gsensor', label: 'Capteur', kind: 'sensor', re: /sensor|sonde|capteur|switch|contacteur|potentiom|position (circuit|signal)/i },
  { id: 'gact', label: 'Actionneur', kind: 'actuator', re: /solenoid|valve|actuator|motor|relay|pump|heater|lamp|output|control circuit|[ée]lectrovanne|vanne|actionneur|moteur|relais|pompe|commande/i },
];

export const UNKNOWN_FAMILY: Family = { id: 'unknown', label: 'Composant non identifié', kind: 'system', re: /$^/ };

export function detectFamily(text: string, code = ''): Family {
  // Une perte de communication reste un problème de réseau, quel que soit le calculateur nommé.
  if (/lost communication|invalid data received|software incompatib|perte de communication|absence de communication/i.test(text)) return FAMILIES.find((f) => f.id === 'can')!;
  for (const f of FAMILIES) if (f.re.test(text)) return f;
  if (code.startsWith('U')) return FAMILIES.find((f) => f.id === 'can')!;
  return UNKNOWN_FAMILY;
}

export type Nature =
  | 'circuit_low' | 'circuit_high' | 'circuit_open' | 'circuit' | 'range_perf' | 'intermittent' | 'stuck' | 'no_signal'
  | 'comm' | 'internal' | 'lean' | 'rich' | 'low' | 'high' | 'efficiency' | 'misfire' | 'correlation' | 'leak' | 'other';

const NATURE_RULES: [RegExp, Nature][] = [
  [/misfire|rat[ée]s/i, 'misfire'],
  [/too lean|\blean\b|pauvre/i, 'lean'],
  [/too rich|\brich\b|riche/i, 'rich'],
  [/lost communication|no communication|bus off|invalid data|absence de communication|message (manquant|absent)|communication/i, 'comm'],
  [/correlation|coh[ée]rence|plausibilit[ée] entre/i, 'correlation'],
  [/efficiency below|below threshold|efficacit[ée]|rendement/i, 'efficiency'],
  [/leak detected|fuite|\bleak\b/i, 'leak'],
  [/(circuit|input|voltage|signal).{0,12}\blow\b|short(ed)? to ground|court-circuit (à|a) la masse|tension (trop )?basse|signal (trop )?bas/i, 'circuit_low'],
  [/(circuit|input|voltage|signal).{0,12}\bhigh\b|short(ed)? to (battery|b\+|voltage|power)|court-circuit au (plus|\+)|tension (trop )?haute|signal (trop )?haut/i, 'circuit_high'],
  [/circuit.{0,6}open|open circuit|circuit ouvert|coupure|no signal|pas de signal|absence de signal/i, 'circuit_open'],
  [/intermittent|erratic|sporadi/i, 'intermittent'],
  [/stuck|bloqu[ée]|gripp|jammed|not (opening|closing)|does not (open|close)/i, 'stuck'],
  [/range.?\/?.?performance|performance|plausib|out of range|rationality|incoh[ée]ren|non plausible/i, 'range_perf'],
  [/too low|underboost|insufficient|below|trop (basse|faible)|insuffisant|low (pressure|flow|output)|pressure.{0,10}low/i, 'low'],
  [/too high|overboost|excessive|above|trop ([ée]lev[ée]e|haute|forte)|high (pressure|flow)|pressure.{0,10}high|over ?temp/i, 'high'],
  [/internal|memory|processor|eeprom|checksum|interne|m[ée]moire/i, 'internal'],
  [/circuit|[ée]lectrique|electrical/i, 'circuit'],
];

export function detectNature(title: string, ft?: number | null): Nature {
  const fromFt = ftbNature(ft) as Nature | '';
  for (const [re, n] of NATURE_RULES) {
    if (re.test(title)) {
      // L'octet de type précise un titre vague (« circuit »), il ne contredit pas un titre précis.
      if ((n === 'circuit' || n === 'range_perf') && fromFt) return fromFt;
      return n;
    }
  }
  return fromFt || 'other';
}

export const isElectrical = (n: Nature) => ['circuit_low', 'circuit_high', 'circuit_open', 'circuit', 'intermittent', 'no_signal'].includes(n);
