import { readFileSync } from 'node:fs';
// Traduction française des titres SAE et des causes courantes, par glossaire.
// Quand un mot n'est pas au glossaire, le titre reste en anglais : jamais de traduction devinée.

const SUFFIX = [
  [/ Circuit Range\/Performance$/i, 'signal incohérent'], [/ Range\/Performance$/i, 'fonctionnement incohérent'],
  [/ Circuit Intermittent\/Erratic$/i, 'signal intermittent'], [/ Intermittent\/Erratic$/i, 'défaut intermittent'], [/ Circuit Intermittent$/i, 'signal intermittent'], [/ Intermittent$/i, 'défaut intermittent'],
  [/ Circuit\/Open$/i, 'circuit ouvert'], [/ Circuit Open$/i, 'circuit ouvert'], [/ Circuit Low$/i, 'signal bas'], [/ Circuit High$/i, 'signal haut'],
  [/ Circuit Shorted$/i, 'court-circuit'], [/ Circuit Short to Ground$/i, 'court-circuit à la masse'], [/ Circuit Short to Battery$/i, 'court-circuit au plus'],
  [/ Control Circuit$/i, 'circuit de commande'], [/ Circuit Performance$/i, 'signal incohérent'], [/ Circuit$/i, 'défaut du circuit'],
  [/ Performance\/Stuck Off$/i, 'inefficace ou bloqué à l’arrêt'], [/ Performance\/Stuck Open$/i, 'inefficace ou bloqué ouvert'], [/ Performance\/Stuck Closed$/i, 'inefficace ou bloqué fermé'],
  [/ Stuck Open$/i, 'bloqué ouvert'], [/ Stuck Closed$/i, 'bloqué fermé'], [/ Stuck On$/i, 'bloqué en marche'], [/ Stuck Off$/i, 'bloqué à l’arrêt'], [/ Stuck$/i, 'bloqué'],
  [/ Performance$/i, 'fonctionnement incorrect'], [/ Malfunction$/i, 'défaut'], [/ Too High$/i, 'trop élevé'], [/ Too Low$/i, 'trop bas'],
  [/ Low$/i, 'bas'], [/ High$/i, 'haut'], [/ Open$/i, 'ouvert'], [/ Over Temperature$/i, 'surchauffe'], [/ Overtemperature$/i, 'surchauffe'],
  [/ Correlation$/i, 'incohérence'], [/ Slow Response$/i, 'réponse lente'], [/ No Signal$/i, 'pas de signal'], [/ Not Learned$/i, 'apprentissage non fait'],
  [/ Leak Detected$/i, 'fuite détectée'], [/ Missing Calibration$/i, 'calibration manquante'], [/ Error$/i, 'erreur'], [/ Failure$/i, 'défaillance'],
];

// Groupes de mots d'abord (les plus longs gagnent), puis mots seuls.
const G = {
  'mass or volume air flow': 'débit d’air', 'mass air flow': 'débit d’air', 'manifold absolute pressure': 'pression d’admission', 'barometric pressure': 'pression atmosphérique',
  'intake air temperature': 'température d’air d’admission', 'engine coolant temperature': 'température de liquide de refroidissement', 'coolant temperature': 'température de liquide',
  'charge air cooler': 'échangeur de suralimentation', 'charge air': 'air de suralimentation', 'exhaust gas recirculation': 'EGR', 'exhaust gas temperature': 'température des gaz d’échappement',
  'exhaust gas': 'gaz d’échappement', 'exhaust pressure': 'pression d’échappement', 'particulate filter': 'filtre à particules', 'diesel particulate filter': 'filtre à particules',
  'particulate matter': 'particules', 'fuel rail pressure': 'pression de rampe', 'fuel rail': 'rampe d’injection', 'fuel pressure': 'pression de carburant', 'fuel pump': 'pompe à carburant',
  'fuel level': 'niveau de carburant', 'fuel temperature': 'température de carburant', 'fuel injector': 'injecteur', 'fuel trim': 'correction de richesse', 'fuel volume regulator': 'régulateur de débit de carburant',
  'fuel pressure regulator': 'régulateur de pression de carburant', 'fuel tank': 'réservoir', 'fuel shutoff valve': 'vanne de coupure de carburant', 'fuel filter': 'filtre à carburant',
  'o2 sensor': 'sonde lambda', 'ho2s': 'sonde lambda', 'oxygen sensor': 'sonde lambda', 'air-fuel ratio': 'richesse', 'air/fuel ratio': 'richesse', 'a/f sensor': 'sonde de richesse',
  'o2 sensor heater': 'chauffage de sonde lambda', 'ho2s heater': 'chauffage de sonde lambda', 'nox sensor': 'sonde NOx', 'glow plug': 'bougie de préchauffage',
  'throttle/pedal position': 'position papillon ou pédale', 'throttle position': 'position papillon', 'throttle actuator': 'moteur de papillon', 'throttle body': 'boîtier papillon', 'pedal position': 'position pédale',
  'accelerator pedal position': 'position pédale d’accélérateur', 'crankshaft position': 'position vilebrequin', 'camshaft position': 'position arbre à cames', 'engine speed': 'régime moteur',
  'vehicle speed': 'vitesse véhicule', 'wheel speed': 'vitesse de roue', 'input speed': 'régime d’entrée', 'output speed': 'régime de sortie', 'turbine speed': 'régime de turbine', 'input/turbine speed': 'régime d’entrée',
  'ignition coil': 'bobine d’allumage', 'knock sensor': 'capteur de cliquetis', 'knock/combustion vibration sensor': 'capteur de cliquetis', 'engine oil pressure': 'pression d’huile moteur', 'oil pressure': 'pression d’huile', 'engine oil temperature': 'température d’huile moteur',
  'engine oil level': 'niveau d’huile moteur', 'oil temperature': 'température d’huile', 'oil level': 'niveau d’huile', 'intake manifold runner': 'volets d’admission', 'intake manifold': 'collecteur d’admission', 'intake air': 'air d’admission', 'intake valve': 'soupape d’admission', 'exhaust valve': 'soupape d’échappement',
  'turbocharger/supercharger boost': 'pression de suralimentation', 'turbocharger/supercharger': 'turbo', 'turbocharger boost': 'pression de suralimentation', 'boost pressure': 'pression de suralimentation', 'boost control': 'régulation de suralimentation', 'wastegate': 'wastegate', 'bypass valve': 'vanne de dérivation',
  'evaporative emission system': 'circuit de vapeurs d’essence', 'evaporative emission': 'vapeurs d’essence', 'evap system': 'circuit de vapeurs d’essence', 'purge control valve': 'électrovanne de purge canister', 'purge valve': 'électrovanne de purge', 'vent valve': 'vanne de mise à l’air', 'vent control': 'mise à l’air',
  'secondary air injection system': 'injection d’air secondaire', 'secondary air injection': 'injection d’air secondaire', 'catalyst system efficiency': 'efficacité du catalyseur', 'catalyst temperature': 'température du catalyseur', 'catalyst efficiency': 'efficacité du catalyseur',
  'reductant': 'AdBlue', 'reductant injection valve': 'injecteur d’AdBlue', 'reductant pump': 'pompe AdBlue', 'reductant tank': 'réservoir AdBlue', 'reductant heater': 'réchauffeur AdBlue', 'reductant level': 'niveau d’AdBlue', 'reductant quality': 'qualité de l’AdBlue', 'reductant pressure': 'pression d’AdBlue',
  'control module': 'calculateur', 'engine control module': 'calculateur moteur', 'powertrain control module': 'calculateur moteur', 'transmission control module': 'calculateur de boîte', 'body control module': 'boîtier de servitude', 'ecm/pcm': 'calculateur moteur', 'ecm': 'calculateur moteur', 'pcm': 'calculateur moteur', 'tcm': 'calculateur de boîte',
  'internal control module': 'calculateur, défaut interne', 'transmission control system': 'gestion de boîte', 'transmission fluid temperature': 'température d’huile de boîte', 'transmission fluid pressure': 'pression d’huile de boîte', 'transmission fluid': 'huile de boîte', 'transmission range': 'position du sélecteur',
  'torque converter clutch': 'embrayage de convertisseur', 'torque converter': 'convertisseur', 'shift solenoid': 'électrovanne de passage', 'pressure control solenoid': 'électrovanne de pression', 'gear ratio': 'rapport de boîte', 'clutch position': 'position d’embrayage', 'clutch actuator': 'actionneur d’embrayage',
  'system voltage': 'tension du réseau de bord', 'battery voltage': 'tension batterie', 'supply voltage': 'tension d’alimentation', 'power supply': 'alimentation', 'reference voltage': 'tension de référence', 'sensor reference voltage': 'tension de référence capteurs', 'ignition switch': 'contact', 'starter relay': 'relais de démarreur', 'power relay': 'relais d’alimentation',
  'a/c refrigerant pressure': 'pression de fluide de climatisation', 'a/c compressor': 'compresseur de climatisation', 'a/c clutch': 'embrayage de compresseur de climatisation', 'a/c': 'climatisation', 'hvac': 'chauffage et climatisation', 'cooling fan': 'motoventilateur', 'fan': 'ventilateur', 'coolant pump': 'pompe à eau', 'thermostat heater': 'chauffage de thermostat', 'coolant thermostat': 'thermostat', 'coolant level': 'niveau de liquide de refroidissement', 'engine coolant': 'liquide de refroidissement', 'coolant': 'liquide de refroidissement',
  'brake switch': 'contacteur de frein', 'brake pedal position': 'position pédale de frein', 'brake booster': 'assistance de freinage', 'brake pedal': 'pédale de frein', 'cruise control': 'régulateur de vitesse', 'steering angle': 'angle de volant', 'steering wheel': 'volant', 'power steering': 'direction assistée',
  'hybrid/ev battery pack': 'batterie de traction', 'hybrid/ev battery': 'batterie de traction', 'hybrid battery': 'batterie de traction', 'battery pack': 'pack batterie', 'drive motor': 'moteur de traction', 'battery charger': 'chargeur de batterie', 'battery charging system': 'système de charge batterie', 'dc/dc converter': 'convertisseur DC/DC', 'generator': 'alternateur', 'alternator': 'alternateur', 'starter/generator': 'alterno-démarreur',
  'variable valve timing': 'calage variable', 'valve timing': 'calage de distribution', 'camshaft timing': 'calage d’arbre à cames', 'timing over-advanced': 'calage trop avancé', 'timing over-retarded': 'calage trop retardé', 'cylinder deactivation': 'désactivation de cylindres', 'idle air control': 'régulation de ralenti', 'idle control system': 'régulation de ralenti', 'idle speed': 'régime de ralenti',
  'random/multiple cylinder misfire detected': 'ratés d’allumage sur plusieurs cylindres', 'misfire detected': 'ratés d’allumage détectés', 'misfire': 'ratés d’allumage', 'system too lean': 'mélange trop pauvre', 'system too rich': 'mélange trop riche',
  'position sensor/switch': 'capteur de position', 'pressure sensor/switch': 'capteur de pression', 'sensor/switch': 'capteur', 'position sensor': 'capteur de position', 'pressure sensor': 'capteur de pression', 'temperature sensor': 'sonde de température', 'speed sensor': 'capteur de vitesse', 'level sensor': 'capteur de niveau', 'current sensor': 'capteur de courant', 'voltage sensor': 'capteur de tension',
  'control valve': 'vanne de régulation', 'control solenoid': 'électrovanne de commande', 'solenoid valve': 'électrovanne', 'actuator': 'actionneur', 'solenoid': 'électrovanne', 'sensor': 'capteur', 'switch': 'contacteur', 'valve': 'vanne', 'motor': 'moteur', 'pump': 'pompe', 'relay': 'relais', 'heater': 'chauffage', 'injector': 'injecteur', 'lamp': 'témoin', 'module': 'boîtier', 'control': 'commande', 'system': 'système',
  'pressure': 'pression', 'temperature': 'température', 'position': 'position', 'voltage': 'tension', 'current': 'courant', 'speed': 'vitesse', 'level': 'niveau', 'flow': 'débit', 'signal': 'signal', 'input': 'entrée', 'output': 'sortie', 'supply': 'alimentation',
  'engine': 'moteur', 'exhaust': 'échappement', 'intake': 'admission', 'fuel': 'carburant', 'air': 'air', 'oil': 'huile', 'battery': 'batterie', 'transmission': 'boîte', 'clutch': 'embrayage', 'brake': 'frein', 'turbocharger': 'turbo', 'supercharger': 'compresseur', 'throttle': 'papillon', 'catalyst': 'catalyseur', 'egr': 'EGR', 'evap': 'vapeurs d’essence', 'nox': 'NOx', 'abs': 'ABS',
  'cylinder': 'cylindre', 'camshaft': 'arbre à cames', 'crankshaft': 'vilebrequin', 'ignition': 'allumage', 'injection': 'injection', 'cooler': 'refroidisseur', 'inlet': 'entrée', 'outlet': 'sortie', 'filter': 'filtre', 'tank': 'réservoir', 'vacuum': 'dépression', 'boost': 'suralimentation', 'regulator': 'régulateur', 'thermostat': 'thermostat', 'starter': 'démarreur', 'compressor': 'compresseur',
  'front': 'avant', 'rear': 'arrière', 'left': 'gauche', 'right': 'droit', 'driver': 'conducteur', 'passenger': 'passager', 'upstream': 'amont', 'downstream': 'aval', 'primary': 'primaire', 'secondary': 'secondaire', 'auxiliary': 'auxiliaire', 'internal': 'interne', 'door': 'porte', 'seat': 'siège', 'window': 'vitre', 'wheel': 'roue', 'steering': 'direction',
  'hydraulic': 'hydraulique', 'electric': 'électrique', 'electrical': 'électrique', 'mechanical': 'mécanique', 'differential': 'différentiel', 'gear': 'rapport', 'shift': 'passage', 'park': 'parking', 'neutral': 'point mort', 'cold': 'froid', 'start': 'démarrage', 'idle': 'ralenti', 'park/neutral': 'parking ou point mort', 'diesel': 'diesel', 'inverter': 'onduleur', 'charger': 'chargeur', 'cell': 'cellule', 'phase': 'phase', 'coil': 'bobine', 'bus': 'bus', 'data': 'données', 'software': 'logiciel', 'memory': 'mémoire', 'processor': 'processeur',
};
const PHRASES = Object.keys(G).sort((a, b) => b.split(' ').length - a.split(' ').length || b.length - a.length);
const MAXW = 6;

function chunks(text) {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  while (i < words.length) {
    let hit = null;
    for (let n = Math.min(MAXW, words.length - i); n >= 1; n--) {
      const p = words.slice(i, i + n).join(' ');
      if (G[p] != null) { hit = [G[p], n]; break; }
    }
    if (hit) { out.push(hit[0]); i += hit[1]; continue; }
    const w = words[i];
    if (/^[a-z]$/.test(w) || /^\d+$/.test(w) || /^[a-z]\/[a-z]$/.test(w)) { // lettre ou numéro de repère : reste collé au groupe précédent
      if (!out.length) return null;
      out[out.length - 1] += ' ' + w.toUpperCase();
      i++; continue;
    }
    return null;
  }
  return out;
}

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function frTitle(en) {
  if (!en) return '';
  let t = en.replace(/\s+/g, ' ').replace(/ [-–—] /g, ' ').trim();
  let m;
  if ((m = /^Lost Communication With (.+)$/i.exec(t))) { const c = chunks(m[1]); return c ? `Perte de communication avec : ${c.reverse().join(' ')}` : ''; }
  if ((m = /^Invalid Data Received From (.+)$/i.exec(t))) { const c = chunks(m[1]); return c ? `Données invalides reçues de : ${c.reverse().join(' ')}` : ''; }
  if ((m = /^Software Incompatibility With (.+)$/i.exec(t))) { const c = chunks(m[1]); return c ? `Logiciel incompatible avec : ${c.reverse().join(' ')}` : ''; }
  const quals = [];
  t = t.replace(/[ ,(]*Bank (\d)[ ,]*Sensor (\d)\)?/i, (_, b, s) => { quals.push(`banc ${b}, sonde ${s}`); return ' '; });
  t = t.replace(/[ ,(]*Bank (\d)\)?/i, (_, b) => { quals.push(`banc ${b}`); return ' '; });
  t = t.replace(/\(([^)]*)\)/g, ' ').replace(/\s+/g, ' ').trim();
  let suffix = '';
  for (const [re, fr] of SUFFIX) { if (re.test(t)) { suffix = fr; t = t.replace(re, ''); break; } }
  if ((m = /^Cylinder (\d+) (.+)$/i.exec(t))) { quals.unshift(`cylindre ${m[1]}`); t = m[2]; }
  const c = chunks(t);
  if (!c || !c.length) return '';
  const body = cap(c.reverse().join(' '));
  return body + (quals.length ? ` (${quals.join(', ')})` : '') + (suffix ? ` : ${suffix}` : '');
}

/* ---------- causes ---------- */
const CAUSE = {
  'Connector pins corroded - high contact resistance': 'Broches de connecteur oxydées : résistance de contact élevée',
  'Gateway module routing CAN messages incorrectly': 'Passerelle qui transmet mal les messages CAN',
  'Sensor element aged beyond calibration window': 'Élément du capteur vieilli, hors plage de calibration',
  'CAN terminating resistor (120 Ω) drifted out of spec': 'Résistance de terminaison CAN (120 Ω) hors valeur',
  'Software version mismatch after replacement': 'Version de logiciel incompatible après un remplacement',
  'Module internal fault or sensor input drift': 'Défaut interne du calculateur ou dérive d’une entrée capteur',
  'Signal wire shorted to ground': 'Fil de signal en court-circuit à la masse', 'Pin pushed back out of connector body': 'Broche reculée dans le connecteur',
  'Connector with intermittent contact under vibration': 'Faux contact du connecteur aux vibrations', 'Module failed': 'Calculateur défaillant',
  'Bus wiring open or shorted': 'Câblage du bus coupé ou en court-circuit', 'Module without power or ground': 'Calculateur sans alimentation ou sans masse',
  'Wiring or connector fault': 'Défaut de faisceau ou de connecteur', 'Carbon or debris buildup preventing free movement': 'Calamine ou dépôts qui empêchent le mouvement',
  'Supply wire pinched against B+ source': 'Fil d’alimentation pincé contre un plus batterie', 'Harness chafing through insulation': 'Faisceau usé par frottement, isolant percé',
  'Signal wire shorted to B+': 'Fil de signal en court-circuit au plus', 'Internal sensor short': 'Capteur en court-circuit interne', 'Sensor failed': 'Capteur défaillant',
  'Cracked solder joint inside the module or sensor': 'Soudure fissurée dans le calculateur ou le capteur', 'Control wire shorted to ground': 'Fil de commande en court-circuit à la masse',
  'Pack cell imbalance approaching service threshold': 'Déséquilibre des cellules de batterie proche du seuil', 'Noisy ground reference': 'Masse de référence parasitée', 'Module unpowered': 'Calculateur non alimenté',
  'Sensor mounting loose - signal damping': 'Capteur mal fixé : signal amorti', 'Open sensor': 'Capteur coupé', 'Sensor characteristic drifted': 'Caractéristique du capteur dérivée', 'Engine module': 'Calculateur moteur',
  'Control wire shorted to B+': 'Fil de commande en court-circuit au plus', 'Sensor connector not seated': 'Connecteur du capteur mal enclenché', 'Short to ground': 'Court-circuit à la masse', 'Wiring fault': 'Défaut de faisceau',
  'Sensor mounting displaced': 'Capteur déplacé sur sa fixation', 'Position sensor failed': 'Capteur de position défaillant', 'Harness routed against vibrating component': 'Faisceau en appui sur une pièce qui vibre', 'Sensor faulty': 'Capteur défectueux',
  'Short to B+': 'Court-circuit au plus', 'Module replaced without programming': 'Calculateur remplacé sans programmation', 'Wrong part number for the vehicle': 'Mauvaise référence de pièce pour ce véhicule', 'Moisture or corrosion in the connector': 'Humidité ou oxydation dans le connecteur',
  'Driver stage in the engine module faulty': 'Étage de commande du calculateur moteur défaillant', 'Open solenoid coil': 'Bobine d’électrovanne coupée', 'Engine control module faulty': 'Calculateur moteur défaillant',
  'Component wear with age - mechanical play': 'Usure de la pièce : jeu mécanique', 'Wire shorted to ground': 'Fil en court-circuit à la masse', 'Output driver in the engine control module faulty': 'Sortie de commande du calculateur moteur défaillante',
  'Sensor reading drifted': 'Mesure du capteur dérivée', 'High-resistance contact': 'Contact résistif', 'Sensor faulty internally': 'Capteur en défaut interne', 'Driver in the engine module': 'Étage de commande du calculateur moteur',
  'Wire shorted to B+': 'Fil en court-circuit au plus', 'Wiring shorted to ground': 'Faisceau en court-circuit à la masse', 'Sensor shorted internally': 'Capteur en court-circuit interne', 'Current sensor failed': 'Capteur de courant défaillant',
  'Driver stage in the engine module': 'Étage de commande du calculateur moteur', 'Connector not seated': 'Connecteur mal enclenché', 'Control module': 'Calculateur', 'Solenoid coil open': 'Bobine d’électrovanne coupée', 'Supply fuse blown': 'Fusible d’alimentation grillé',
  'Sensor ground open': 'Masse du capteur coupée', 'Temperature sensor failed': 'Sonde de température défaillante', 'Signal wire shorted to battery': 'Fil de signal en court-circuit au plus', 'Open position sensor': 'Capteur de position coupé',
  'Module software outdated, reflash may resolve': 'Logiciel du calculateur ancien : une mise à jour peut régler le défaut', 'Broken control wire': 'Fil de commande coupé', 'Driver IC failure': 'Composant de commande du calculateur défaillant',
  'Ground point with elevated resistance': 'Point de masse résistif', 'Supply voltage low under load': 'Tension d’alimentation qui chute en charge', 'Signal shorted to ground': 'Signal en court-circuit à la masse', 'Internal short in solenoid coil': 'Bobine d’électrovanne en court-circuit interne',
  'Open valve coil': 'Bobine de vanne coupée', 'High-resistance contact in connector': 'Contact résistif dans le connecteur', 'Sensor open internally': 'Capteur coupé en interne', 'Contaminated fuel': 'Carburant pollué', 'Open signal line': 'Ligne de signal coupée',
  'Signal shorted to supply': 'Signal en court-circuit à l’alimentation', 'Connector corroded': 'Connecteur oxydé', 'Module input faulty': 'Entrée du calculateur défaillante', 'Intermittent contact at connector': 'Faux contact au connecteur',
  'Control wire shorted to battery voltage': 'Fil de commande en court-circuit au plus', 'Module': 'Calculateur', 'Solenoid internal short': 'Électrovanne en court-circuit interne', 'Wire broken': 'Fil coupé', 'Water or corrosion in the connector': 'Eau ou oxydation dans le connecteur',
  'Signal wire shorted to positive': 'Fil de signal en court-circuit au plus', 'Control line shorted to ground': 'Ligne de commande en court-circuit à la masse', 'Sensor offset drifted': 'Décalage du capteur dérivé', 'Injector winding open': 'Bobinage d’injecteur coupé',
  'Open actuator coil': 'Bobine d’actionneur coupée', 'Signal wire open': 'Fil de signal coupé', 'Contact resistance in the connector': 'Résistance de contact dans le connecteur', 'Open sensor element': 'Élément du capteur coupé',
  'Wiring shorted to battery': 'Faisceau en court-circuit au plus', 'Control module faulty': 'Calculateur défaillant', 'Engine module driver faulty': 'Étage de commande du calculateur moteur défaillant', 'Chafing or water in harness or connector': 'Frottement ou eau dans le faisceau ou le connecteur',
  'Intermittent connector': 'Connecteur à faux contact', 'Corroded sensor connector': 'Connecteur du capteur oxydé', 'Control module software': 'Logiciel du calculateur', 'Air pocket in coolant loop': 'Poche d’air dans le circuit de refroidissement',
  'Contact resistance at the connector': 'Résistance de contact au connecteur', 'Solenoid coil open or shorted': 'Bobine d’électrovanne coupée ou en court-circuit', 'Sensor element drifted': 'Élément du capteur dérivé', 'Open in sensor or wiring': 'Coupure dans le capteur ou le faisceau',
  'Module internal fault': 'Défaut interne du calculateur', 'Wiring or connector open': 'Faisceau ou connecteur coupé', 'Sensor drift': 'Dérive du capteur', 'Engine module software': 'Logiciel du calculateur moteur', 'Contact resistance in connector or ground': 'Résistance de contact dans le connecteur ou la masse',
  'Pump motor or driver fault': 'Moteur de pompe ou sa commande en défaut', 'Pressure sensor failed': 'Capteur de pression défaillant', 'Engine control module': 'Calculateur moteur', 'Engine module input': 'Entrée du calculateur moteur', 'Module software': 'Logiciel du calculateur',
  'Transmission module': 'Calculateur de boîte', 'Coil open': 'Bobine coupée', 'Valve stuck or coil failed': 'Vanne grippée ou bobine défaillante', 'Switch failed': 'Contacteur défaillant', 'Calibration not performed': 'Calibration non faite', 'Charging system overvoltage': 'Surtension du circuit de charge',
  'Driver in the engine module faulty': 'Étage de commande du calculateur moteur défaillant', 'Contaminated fuel ': 'Carburant pollué', 'Boost leak or loose injector clamp': 'Fuite de suralimentation ou bride d’injecteur desserrée',
};
// Causes des codes les plus courants, traduites à la main : deux fichiers alignés ligne à ligne.
const EN = readFileSync(new URL('./causes-en.txt', import.meta.url), 'utf8').split('\n');
const FR = readFileSync(new URL('./causes-fr.txt', import.meta.url), 'utf8').trimEnd().split('\n');
if (EN.length !== FR.length) throw new Error(`causes-en (${EN.length}) et causes-fr (${FR.length}) ne sont pas alignés`);
EN.forEach((en, i) => { if (!CAUSE[en]) CAUSE[en] = FR[i]; });
export function frCause(en) { return CAUSE[en] || CAUSE[en.trim()] || ''; }
