import type { Family, Nature } from './classify';
import { isElectrical } from './classify';
import type { Fuel } from './types';

/** Niveau de coût d'un contrôle : le plan va toujours du plus petit au plus grand. */
export const LEVELS = ['Gratuit', 'Valise', 'Multimètre', 'Outil spécial', 'Démontage', 'Pièce'] as const;

export interface TestDef {
  id: string;
  level: 0 | 1 | 2 | 3 | 4 | 5;
  title: string;
  how: string;
  expect: string;
  bad: string;                       // ce qu'on conclut si le résultat est mauvais
  targets: string[];                 // catégories de cause visées
  ok?: Record<string, number>;       // effet sur les pistes si le contrôle est bon (défaut : cibles ×0,2)
  nok?: Record<string, number>;      // effet si mauvais (défaut : cibles ×5)
}

type L = TestDef['level'];
const T = (id: string, level: L, title: string, how: string, expect: string, bad: string, targets: string[], eff?: Pick<TestDef, 'ok' | 'nok'>): TestDef =>
  ({ id, level, title, how, expect, bad, targets, ...eff });

/* ---------- contrôles communs ---------- */
export const PRELIM = T('prelim', 0, 'Relever avant d’effacer',
  'Note tous les codes de tous les calculateurs, leur statut (permanent, intermittent, mémorisé) et le freeze frame : régime, charge, température, vitesse au moment du défaut. Prends l’écran en photo.',
  'Tu sais dans quelles conditions le défaut est apparu.', 'Sans ces relevés, un défaut intermittent devient introuvable.', []);

const BAT = T('bat', 1, 'Tension batterie et charge',
  'Lis la tension à la valise ou au multimètre : moteur arrêté depuis 10 minutes, puis moteur tournant avec feux et dégivrage allumés.',
  'Au moins 12,4 V au repos. 13,8 à 14,7 V moteur tournant (un alternateur piloté peut descendre vers 12,5 à 13 V, c’est normal).',
  'Batterie faible ou charge insuffisante : recharge ou remplace, puis efface et recontrôle avant d’aller plus loin.', ['power']);

const GROUND = T('ground', 2, 'Chutes de tension sur les masses',
  'Multimètre en volts entre la borne moins de la batterie et le bloc moteur, puis la caisse, moteur tournant avec consommateurs allumés. Refais la mesure pendant le démarrage.',
  'Moins de 0,2 V en marche, moins de 0,5 V au démarreur.', 'Tresse ou point de masse à nettoyer ou remplacer.', ['power', 'wiring']);

const E_VIS = T('e_vis', 0, 'Connecteur et faisceau du composant',
  'Débranche le connecteur : cherche du vert-de-gris, de l’humidité, une broche reculée ou écartée. Suis le faisceau sur 30 cm : frottement, pliure, réparation ancienne. Moteur tournant, bouge le faisceau en regardant la valeur live.',
  'Broches propres et serrées, valeur stable quand tu bouges le faisceau.', 'Connectique ou fil en cause : répare avant de toucher à une pièce.', ['wiring']);

const E_LIVE = T('e_live', 1, 'Valeur live du capteur',
  'Contact mis moteur arrêté, puis moteur tournant : lis la valeur du capteur et compare à ce qui est logique (température égale à l’ambiante à froid, pression égale à l’atmosphère moteur arrêté, position à 0 % au repos).',
  'Valeur plausible, qui évolue sans saut ni palier.', 'Valeur figée, en butée ou incohérente : le capteur ou son circuit est en cause, continue avec les contrôles électriques.',
  ['sensor', 'wiring'], { ok: { sensor: 0.5, wiring: 0.6 }, nok: { sensor: 2, wiring: 2 } });

const E_UNPLUG = T('e_unplug', 1, 'Test débranché puis ponté',
  'Regarde la valeur live, débranche le capteur, puis ponte le signal à la masse avec un fil (capteur 5 V à 2 ou 3 fils uniquement, jamais sur un airbag ni une sonde lambda).',
  'La valeur part en butée dans un sens débranché, dans l’autre ponté : le faisceau et le calculateur lisent bien, donc le capteur est en cause.',
  'La valeur ne bouge pas : le défaut est dans le faisceau ou le calculateur, pas dans le capteur.',
  ['wiring'], { ok: { wiring: 0.25, ecu: 0.4, sensor: 3 }, nok: { wiring: 3, ecu: 1.5, sensor: 0.25 } });

const E_SUPPLY = T('e_supply', 2, 'Alimentation et masse au connecteur',
  'Connecteur débranché, contact mis, multimètre côté faisceau : mesure l’alimentation par rapport à la masse batterie, puis la masse du connecteur par rapport au plus batterie.',
  'Capteur : 4,9 à 5,1 V. Actionneur : tension batterie. Masse : moins de 0,2 V d’écart avec la batterie.',
  'Alimentation ou masse absente : remonte vers le fusible, le relais ou l’épissure. Si plusieurs capteurs ont perdu le 5 V, l’un d’eux le met en court-circuit : débranche-les un par un.',
  ['wiring', 'power']);

const E_CONT = T('e_cont', 2, 'Continuité et isolement du fil de signal',
  'Batterie débranchée, connecteurs du composant et du calculateur débranchés : mesure la résistance du fil de bout en bout, puis entre ce fil et la masse, puis entre ce fil et ses voisins. Le schéma électrique donne les broches.',
  'Moins de 1 ohm de bout en bout. Résistance infinie vers la masse et vers les autres fils.',
  'Fil coupé, résistif ou en court-circuit : répare le faisceau.', ['wiring']);

const E_RES = T('e_res', 2, 'Résistance du composant',
  'Composant débranché, mesure sa résistance entre ses bornes et compare à la valeur constructeur. Pour une sonde de température, mesure à froid puis à chaud.',
  'Valeur dans la plage constructeur, qui varie avec la température ou la position. Jamais 0 ohm ni infini.',
  'Composant hors valeur : il est à remplacer.', ['sensor', 'actuator', 'part']);

const E_ACT = T('e_act', 1, 'Test actionneur à la valise',
  'Lance le test actionneur du composant depuis la valise et écoute ou touche : clic, mouvement, bruit de moteur. Regarde aussi la position mesurée si elle existe.',
  'Le composant réagit franchement à chaque commande et la position mesurée suit la consigne.',
  'Pas de réaction : contrôle l’alimentation au connecteur pendant le test. Tension présente et pas de mouvement égale composant mort ou grippé.',
  ['actuator', 'wiring'], { ok: { actuator: 0.4, wiring: 0.4 }, nok: { actuator: 2.5, wiring: 2 } });

const E_FUSE = T('e_fuse', 0, 'Fusible et relais du circuit',
  'Repère le fusible et le relais du circuit dans la notice. Contrôle le fusible à la lampe témoin des deux côtés, contact mis. Échange le relais avec un relais identique voisin.',
  'Tension des deux côtés du fusible, le défaut ne suit pas le relais.', 'Fusible grillé : cherche le court-circuit avant de le remplacer. Défaut qui suit le relais : relais à changer.', ['power']);

const E_WIGGLE = T('e_wiggle', 1, 'Défaut intermittent : test de secousse',
  'Affiche la valeur du capteur en graphique sur la valise, moteur tournant. Secoue le faisceau, tape légèrement sur le composant, chauffe-le au décapeur ou refroidis-le à la bombe.',
  'La courbe reste propre.', 'Le signal décroche quand tu secoues ou chauffes : tu as trouvé la zone. Faisceau si c’est à la secousse, composant si c’est à la température.',
  ['wiring', 'sensor'], { ok: { wiring: 0.6, sensor: 0.6 }, nok: { wiring: 2.5, sensor: 2 } });

const SWAP = T('swap', 5, 'Essai avec une pièce connue bonne',
  'En dernier, et seulement si tous les contrôles précédents désignent la pièce : monte une pièce d’essai ou échange avec le cylindre voisin quand c’est possible.',
  'Le défaut disparaît ou suit la pièce.', 'Le défaut reste : la pièce n’était pas en cause, reprends le circuit.', ['part', 'sensor', 'actuator'],
  { ok: { part: 0.2, sensor: 0.2, actuator: 0.2 }, nok: { part: 6, sensor: 6, actuator: 6 } });

function electrical(kind: Family['kind'], nature: Nature): TestDef[] {
  const out = [E_VIS];
  if (kind === 'sensor') {
    out.push(E_LIVE);
    if (nature === 'circuit_low' || nature === 'circuit_high' || nature === 'circuit_open' || nature === 'circuit') out.push(E_UNPLUG);
  } else out.push(E_FUSE, E_ACT);
  if (nature === 'intermittent') out.push(E_WIGGLE);
  out.push(E_SUPPLY, E_CONT, E_RES);
  return out;
}

/* ---------- contrôles par famille ---------- */
const SMOKE = T('smoke', 3, 'Recherche de prise d’air',
  'Machine à fumée branchée sur l’admission après le débitmètre. Sans machine : moteur au ralenti, pulvérise du nettoyant freins autour des joints de collecteur, durites de dépression, reniflard et joint de papillon, en regardant le correcteur court terme.',
  'Aucune fumée ne sort, le correcteur ne bouge pas.', 'Fumée visible ou correcteur qui chute : prise d’air localisée.', ['air_leak']);
const TRIMS = T('trims', 1, 'Correcteurs de richesse au ralenti et à 2 500 tr/min',
  'Moteur chaud, relève STFT et LTFT au ralenti, puis stabilisé à 2 500 tr/min.',
  'Total entre −10 % et +10 % dans les deux cas.',
  'Très positif au ralenti et normal à 2 500 : prise d’air. Positif partout et pire en charge : débitmètre ou pression d’essence. Négatif : injecteur qui fuit, purge canister ou pression trop haute.',
  ['air_leak', 'fuel', 'sensor'], { ok: { air_leak: 0.6, fuel: 0.6 }, nok: { air_leak: 1.6, fuel: 1.4, sensor: 1.3 } });
const MAFCHK = T('mafchk', 1, 'Plausibilité du débitmètre',
  'Lis le débit d’air au ralenti chaud, puis fais une pleine accélération en 2e ou 3e et note le maximum.',
  'Ralenti : environ 2 à 4 g/s pour un 1,6 à 2,0 L essence, 6 à 10 g/s pour un diesel de même cylindrée, vanne EGR fermée. En pleine charge : à peu près 0,8 × la puissance en chevaux, en g/s.',
  'Débit trop faible : débitmètre encrassé ou fatigué, ou filtre à air colmaté. Nettoie au produit spécial débitmètre, puis recontrôle.', ['sensor', 'clog']);
const FUELP = T('fuelp', 1, 'Pression de carburant, consigne contre mesure',
  'À la valise, affiche la pression rail mesurée et la consigne : au ralenti, puis en accélération franche sur route.',
  'La mesure suit la consigne à moins de 10 %. Diesel common rail : environ 250 à 400 bar au ralenti. Essence injection directe : environ 40 à 60 bar au ralenti.',
  'La mesure décroche en charge : alimentation basse pression (filtre, pompe de gavage) ou pompe haute pression et régulateur. La mesure ne monte jamais au démarrage : fuite interne, injecteur ou régulateur.',
  ['fuel', 'injector']);
const LOWP = T('lowp', 3, 'Basse pression et filtre à carburant',
  'Manomètre sur le circuit basse pression (ou valeur live si le véhicule a un capteur). Regarde aussi la date du filtre et la présence d’air ou de limaille dans le gazole au niveau du filtre.',
  'Essence : environ 3 à 6 bar selon le système. Diesel : gavage présent, pas de bulles dans la durite transparente, pas de paillettes métalliques.',
  'Pression basse : filtre colmaté ou pompe de gavage fatiguée. Limaille : la pompe haute pression se détruit, tout le circuit est à traiter.', ['fuel', 'clog']);
const LEAKBACK = T('leakback', 3, 'Retours de fuite des injecteurs (diesel)',
  'Éprouvettes sur les retours des injecteurs, moteur au ralenti 2 à 3 minutes, ou test moteur tournant puis coupé selon la méthode constructeur.',
  'Tous les retours au même niveau, à 10 ou 20 % près.', 'Un injecteur renvoie nettement plus que les autres : il fait chuter la pression rail, il est à remplacer.', ['injector']);
const INJCORR = T('injcorr', 1, 'Corrections de débit par cylindre',
  'À la valise, affiche les corrections d’injection par cylindre (ou l’équilibrage des cylindres) au ralenti chaud.',
  'Toutes proches de zéro, typiquement entre −2 et +2 mm³ ou mg par coup.', 'Un cylindre très à part : injecteur, compression ou étanchéité de ce cylindre.', ['injector', 'mechanical']);
const MISCOUNT = T('miscount', 1, 'Compteurs de ratés par cylindre',
  'Affiche les compteurs de ratés par cylindre, à froid puis à chaud, au ralenti puis en charge légère.',
  'Zéro raté ou quelques unités.', 'Un seul cylindre touché : bobine, bougie ou injecteur de ce cylindre. Tous les cylindres : mélange, carburant, prise d’air ou calage.',
  ['ignition', 'injector'], { ok: { ignition: 0.7, injector: 0.7 }, nok: { ignition: 1.5, injector: 1.3 } });
const PERMUTE = T('permute', 0, 'Permuter bobine, puis bougie, puis injecteur',
  'Échange la bobine du cylindre en défaut avec celle d’un voisin, efface, refais tourner. Si le raté reste, fais la même chose avec la bougie, puis l’injecteur.',
  'Le raté reste sur le même cylindre après chaque échange.', 'Le raté suit la pièce déplacée : c’est elle.',
  ['ignition', 'injector'], { ok: { ignition: 0.3 }, nok: { ignition: 5, injector: 2 } });
const PLUGS = T('plugs', 4, 'Lecture des bougies',
  'Dépose les bougies : couleur, écartement, traces d’huile ou de liquide, porcelaine fissurée.',
  'Culot gris à brun clair, électrodes nettes, écartement à la valeur constructeur.', 'Bougie noire et humide : cylindre qui ne brûle pas. Huilée : segmentation ou guides. Blanche et propre comme lavée : liquide de refroidissement.', ['ignition', 'mechanical']);
const COMPRESSION = T('compression', 3, 'Compressions ou test de fuite de cylindre',
  'Compressiomètre sur chaque cylindre, moteur chaud, papillon ouvert. Sur certaines valises : test de compression relative au démarreur.',
  'Écart de moins de 10 à 15 % entre cylindres.', 'Un cylindre faible : soupape, segmentation ou joint de culasse. Le test de fuite dit lequel (souffle à l’admission, à l’échappement ou au carter).', ['mechanical']);
const O2RESP = T('o2resp', 1, 'Réaction de la sonde lambda',
  'Moteur chaud à 2 000 tr/min : regarde la sonde amont en graphique. Provoque un enrichissement (coup de gaz) puis un appauvrissement (lever de pied).',
  'Sonde à saut : oscille entre 0,1 et 0,9 V plusieurs fois par seconde. Sonde large bande : lambda proche de 1,00 qui réagit tout de suite. Sonde aval : stable vers 0,5 à 0,8 V.',
  'Sonde lente, figée ou qui ne réagit pas aux deux provocations : sonde fatiguée. Figée pauvre avec correcteurs positifs : cherche d’abord une prise d’air ou une fuite d’échappement en amont.', ['sensor', 'exhaust']);
const O2HEAT = T('o2heat', 2, 'Chauffage de la sonde lambda',
  'Sonde débranchée et froide : mesure la résistance entre les deux fils de chauffage (souvent de même couleur). Contrôle aussi le 12 V au connecteur côté faisceau, moteur tournant.',
  'Quelques ohms (typiquement 2 à 15 ohms). 12 V présent.', 'Résistance infinie : sonde à remplacer. Pas de 12 V : fusible ou relais du chauffage.', ['sensor', 'power']);
const EXLEAK = T('exleak', 0, 'Fuite d’échappement avant la sonde',
  'Moteur froid, écoute au démarrage : claquement ou souffle au collecteur, au flexible, aux brides. Cherche des traces de suie.',
  'Aucune fuite avant la sonde amont.', 'Fuite avant la sonde : elle aspire de l’air et fausse la mesure. À réparer avant de juger la sonde ou le catalyseur.', ['exhaust']);
const CATTEST = T('cattest', 1, 'Efficacité du catalyseur',
  'Moteur bien chaud à 2 500 tr/min stabilisé : compare la sonde aval à la sonde amont. Si la valise donne les températures avant et après catalyseur, compare-les.',
  'Sonde aval presque plate alors que l’amont oscille. Sortie du catalyseur plus chaude que l’entrée.', 'Sonde aval qui recopie l’amont : catalyseur fatigué, après avoir écarté sonde aval, fuite d’échappement et ratés.', ['part', 'sensor']);
const BOOST = T('boost', 1, 'Pression de suralimentation, consigne contre mesure',
  'Sur route, en 3e ou 4e pleine charge de 1 500 à 3 500 tr/min, enregistre la pression de suralimentation mesurée et la consigne. Moteur arrêté, la mesure doit égaler la pression atmosphérique.',
  'La mesure suit la consigne à 100 ou 150 mbar près, sans à-coup.', 'Mesure en dessous : fuite, turbo ou commande. Mesure au-dessus : géométrie ou wastegate grippée, électrovanne de commande. Capteur faux moteur arrêté : capteur.', ['boost_leak', 'actuator', 'sensor']);
const BOOSTLEAK = T('boostleak', 0, 'Durites et échangeur de suralimentation',
  'Inspecte toutes les durites du turbo au collecteur, les colliers et l’échangeur : huile qui suinte, durite fendue en dessous, collier desserré. Fais accélérer et écoute un sifflement ou un souffle.',
  'Circuit sec et serré, pas de souffle.', 'Durite fendue ou déboîtée : c’est la cause la plus fréquente d’un manque de pression.', ['boost_leak']);
const TURBOACT = T('turboact', 3, 'Commande du turbo : dépression ou actionneur électrique',
  'Commande à dépression : pompe à vide manuelle sur la capsule, la tige doit se déplacer sur toute sa course et tenir. Contrôle la dépression disponible à l’électrovanne (environ −0,8 bar). Actionneur électrique : test actionneur à la valise, la tige doit faire toute la course.',
  'Course complète, souple, la capsule tient la dépression.', 'Tige dure ou bloquée : géométrie grippée par la calamine. Capsule qui ne tient pas : membrane percée. Pas de dépression : pompe à vide, durites ou électrovanne.', ['actuator', 'clog', 'mechanical']);
const TURBOPLAY = T('turboplay', 4, 'Jeu et état du turbo',
  'Dépose la durite d’entrée du turbo : jeu radial et axial de l’axe, traces de contact des ailettes, huile dans le compresseur.',
  'Léger jeu radial sans contact, pas de jeu axial sensible, ailettes intactes.', 'Ailettes marquées ou jeu axial : turbo à remplacer, après avoir trouvé pourquoi (lubrification, filtre à air, pression de carter).', ['part', 'mechanical']);
const EGRCMD = T('egrcmd', 1, 'Vanne EGR : consigne contre position',
  'Test actionneur de la vanne EGR à la valise, puis en live moteur chaud au ralenti : compare la position mesurée à la consigne et regarde le débit d’air chuter quand la vanne s’ouvre.',
  'La position suit la consigne sans retard et le débit d’air baisse nettement à l’ouverture.', 'Position qui ne suit pas ou ne revient pas à zéro : vanne grippée par la calamine. Position correcte mais débit d’air qui ne change pas : conduit ou refroidisseur colmaté.', ['actuator', 'clog']);
const EGRCLEAN = T('egrclean', 4, 'Dépose et nettoyage de la vanne EGR et de son conduit',
  'Dépose la vanne : état du clapet, calamine dans le conduit et le collecteur d’admission. Nettoie au produit adapté, remplace les joints, refais l’apprentissage à la valise si le constructeur le demande.',
  'Clapet libre et étanche à la fermeture, conduit dégagé.', 'Clapet marqué, moteur de vanne faible ou refroidisseur percé (perte de liquide) : pièce à remplacer.', ['clog', 'actuator', 'part']);
const DPFDIFF = T('dpfdiff', 1, 'Pression différentielle et charge du filtre à particules',
  'À la valise : pression différentielle contact mis moteur arrêté, au ralenti, puis à 3 000 tr/min. Relève aussi la charge en suies calculée, la distance depuis la dernière régénération et les températures d’échappement.',
  'Moteur arrêté : 0 mbar à quelques unités près. Ralenti : quelques mbar. 3 000 tr/min à vide : en général moins de 100 mbar.', 'Valeur non nulle moteur arrêté : capteur ou tuyaux. Valeur haute en régime : filtre chargé. Valeur nulle en régime : tuyau débranché, percé ou bouché.', ['clog', 'sensor']);
const DPFHOSE = T('dpfhose', 0, 'Tuyaux du capteur de pression différentielle',
  'Suis les deux petits tuyaux entre le filtre et le capteur : fissure, tuyau fondu, bouché par la suie ou l’eau, inversion.',
  'Tuyaux souples, entiers, dégagés.', 'Tuyau percé ou bouché : la mesure est fausse, remplace-les avant de juger le filtre.', ['wiring', 'sensor']);
const DPFWHY = T('dpfwhy', 1, 'Pourquoi le filtre ne se régénère pas',
  'Cherche la cause en amont : température moteur atteinte en roulant (thermostat), sondes de température d’échappement plausibles, préchauffage, injecteurs, vanne EGR, niveau d’additif si le véhicule en a un, niveau d’huile qui monte.',
  'Moteur à plus de 80 °C en roulant, sondes cohérentes à froid, aucun autre code.', 'Corrige d’abord cette cause, sinon le filtre se rechargera. Puis lance une régénération forcée à la valise si la charge le permet, sinon nettoyage ou remplacement du filtre.', ['clog', 'sensor', 'actuator']);
const SCRQUAL = T('scrqual', 0, 'Niveau et qualité de l’AdBlue',
  'Vérifie le niveau, l’absence de cristaux blancs autour du bouchon et de l’injecteur, et la qualité au réfractomètre si tu en as un.',
  'Liquide limpide, concentration proche de 32,5 %, pas de cristallisation.', 'AdBlue dilué, pollué ou cristallisé : vidange du réservoir, rinçage, plein neuf.', ['fluid', 'clog']);
const SCRPRESS = T('scrpress', 1, 'Pression de la pompe AdBlue et test de l’injecteur',
  'À la valise : lance le test de mise en pression du circuit AdBlue et lis la pression. Lance le test de débit de l’injecteur, injecteur déposé dans un récipient gradué.',
  'Pression stable autour de 5 bar (jusqu’à 9 bar selon le système). Jet en cône régulier, quantité conforme à la valeur constructeur.', 'Pas de pression : pompe ou module de réservoir, après contrôle fusible et alimentation. Jet faible ou nul : injecteur cristallisé, à nettoyer à l’eau chaude ou remplacer.', ['actuator', 'clog', 'power']);
const NOXCHK = T('noxchk', 1, 'Sondes NOx amont et aval',
  'Moteur chaud, après 10 à 15 minutes de route : lis les deux sondes NOx et le rendement SCR calculé. Vérifie que les sondes sont bien actives (elles ne mesurent qu’une fois chaudes et sèches).',
  'Sonde aval nettement plus basse que l’amont en roulant stabilisé. Rendement au-dessus du seuil constructeur.', 'Sonde figée ou incohérente : sonde NOx en cause, c’est la panne la plus courante. Sondes bonnes et rendement faible : injection d’AdBlue ou catalyseur SCR.', ['sensor', 'part']);
const EVAPCAP = T('evapcap', 0, 'Bouchon de réservoir et durites de canister',
  'Contrôle le joint du bouchon et son serrage, puis les durites entre réservoir, canister et électrovanne de purge.',
  'Joint souple, bouchon qui clique, durites entières.', 'Bouchon ou durite en cause : remplace, efface, le contrôle se refait sur plusieurs trajets.', ['air_leak', 'part']);
const PURGE = T('purge', 1, 'Électrovanne de purge canister',
  'Test actionneur : elle doit cliqueter. Moteur arrêté et électrovanne au repos, souffle dedans : elle doit être fermée. Au ralenti, pince la durite de purge et regarde le correcteur court terme.',
  'Fermée au repos, le correcteur ne bouge pas quand tu pinces.', 'Électrovanne qui laisse passer au repos : elle enrichit ou crée une fuite, à remplacer.', ['actuator']);
const GLOWRES = T('glowres', 2, 'Résistance de chaque bougie de préchauffage',
  'Débranche le connecteur de chaque bougie et mesure entre la borne et la masse moteur. Ou pince ampèremétrique sur chaque fil pendant le préchauffage.',
  'Moins de 1 à 2 ohms (bougies métalliques), toutes proches. Environ 8 à 15 A par bougie une fois stabilisé.', 'Résistance infinie ou courant nul : bougie coupée. Dégrippant et moteur chaud avant de tenter de la desserrer.', ['actuator', 'part']);
const GLOWMOD = T('glowmod', 2, 'Boîtier de préchauffage',
  'Contrôle le plus permanent du boîtier (gros fil, fusible de puissance), la masse, puis la tension de sortie vers chaque bougie pendant le préchauffage.',
  'Tension batterie en entrée, tension présente sur chaque sortie pendant la commande.', 'Entrée bonne et une sortie absente : boîtier à remplacer. Pas d’entrée : fusible de puissance ou faisceau.', ['power', 'actuator', 'wiring']);
const THERMO = T('thermo', 1, 'Montée en température du moteur',
  'Départ à froid, suis la température d’eau à la valise sur 10 à 15 minutes de route. Touche la durite supérieure de radiateur au début.',
  'Monte régulièrement jusqu’à 85 à 95 °C et s’y tient. La durite du radiateur reste froide jusqu’à l’ouverture du thermostat.', 'Plafonne sous 75 à 80 °C sur route ou durite tiède tout de suite : thermostat bloqué ouvert. Sur un diesel, cela empêche aussi les régénérations du filtre à particules.', ['actuator', 'sensor']);
const TEMPCOLD = T('tempcold', 1, 'Cohérence des températures à froid',
  'Moteur froid depuis une nuit : compare à la valise la température d’eau, d’air d’admission, d’huile, de carburant et extérieure.',
  'Toutes à 2 ou 3 °C près de la température ambiante.', 'Une sonde s’écarte des autres : c’est elle ou son circuit.', ['sensor']);
const FANTEST = T('fantest', 1, 'Motoventilateur et circulation d’eau',
  'Test actionneur du ventilateur à toutes les vitesses. Vérifie le niveau et la purge du circuit, l’état de la courroie de pompe à eau, et que les deux durites du radiateur chauffent.',
  'Le ventilateur tourne à chaque vitesse, niveau correct, radiateur chaud en haut et tiède en bas.', 'Ventilateur muet : fusible de puissance, relais ou module. Radiateur froid en bas : thermostat, pompe à eau ou radiateur bouché. Niveau qui baisse sans fuite : contrôle les gaz dans le liquide.', ['actuator', 'power', 'fluid', 'mechanical']);
const TIMINGLIVE = T('timinglive', 1, 'Calage et déphaseurs en live',
  'Moteur chaud au ralenti puis à 2 500 tr/min : compare l’angle d’arbre à cames mesuré à la consigne, pour chaque arbre. Lance le test des électrovannes de déphaseur.',
  'Écart mesuré-consigne de quelques degrés au plus, réponse rapide.', 'Écart permanent même au ralenti : calage décalé (chaîne détendue, courroie sautée). Écart seulement quand le déphaseur doit bouger : électrovanne, crépine ou pression d’huile.', ['mechanical', 'actuator', 'fluid']);
const OILCHK = T('oilchk', 0, 'Niveau, qualité et norme de l’huile',
  'Niveau à la jauge, aspect, date de la dernière vidange et norme de l’huile utilisée. Une huile trop vieille ou trop épaisse suffit à dérégler les déphaseurs.',
  'Niveau entre mini et maxi, huile à la norme constructeur, vidange à jour.', 'Niveau bas ou huile hors norme : vidange avec la bonne huile, efface, refais un essai avant d’aller plus loin.', ['fluid']);
const VVTSOL = T('vvtsol', 4, 'Électrovanne de déphaseur et sa crépine',
  'Dépose l’électrovanne : crépine colmatée, piston qui coulisse librement quand tu l’alimentes en 12 V. Résistance de la bobine. Échange admission et échappement si elles sont identiques.',
  'Crépine propre, piston franc, environ 7 à 15 ohms.', 'Crépine bouchée ou piston collé : nettoie ou remplace. Le défaut suit l’électrovanne échangée : c’est elle.', ['actuator', 'clog']);
const TIMINGMARKS = T('timingmarks', 4, 'Contrôle du calage aux piges',
  'Mets le moteur au point de calage avec les piges constructeur. Regarde la tension de chaîne (sortie du tendeur) ou l’état de la courroie.',
  'Toutes les piges entrent sans forcer, tendeur peu sorti.', 'Piges qui ne rentrent pas ou tendeur en bout de course : distribution à remplacer.', ['mechanical']);
const CKPSIG = T('ckpsig', 1, 'Signal de régime et synchronisation',
  'Au démarreur, regarde le régime moteur à la valise et l’état de synchronisation arbre à cames et vilebrequin. Inspecte le capteur déposé : limaille collée, entrefer, cible abîmée.',
  'Régime affiché de 150 à 300 tr/min au démarreur, synchronisation acquise.', 'Régime à zéro au démarreur : capteur vilebrequin ou son circuit. Limaille sur le capteur : nettoie et cherche d’où elle vient.', ['sensor', 'wiring', 'mechanical']);
const THROTTLE = T('throttleadapt', 1, 'Papillon : positions, encrassement et apprentissage',
  'Contact mis, enfonce doucement la pédale : les deux pistes de pédale et les deux pistes de papillon doivent évoluer sans saut. Regarde l’encrassement du boîtier papillon. Après nettoyage, refais l’apprentissage à la valise.',
  'Les deux pistes évoluent ensemble (l’une vaut souvent le double ou le complément de l’autre), papillon propre.', 'Saut ou trou sur une piste : pédale ou boîtier papillon. Papillon gras : nettoyage et apprentissage.', ['sensor', 'actuator', 'clog']);
const OILPRESS = T('oilpress', 3, 'Pression d’huile au manomètre',
  'Monte un manomètre à la place du manocontact. Mesure moteur chaud au ralenti puis à 2 000 tr/min.',
  'Valeurs constructeur. Ordre de grandeur : plus de 1 bar au ralenti chaud, 3 à 4 bar à 2 000 tr/min.', 'Pression réelle basse : arrête le moteur. Crépine, pompe à huile, usure des coussinets. Pression bonne : capteur ou faisceau.', ['mechanical', 'sensor', 'fluid']);
const CANTOPO = T('cantopo', 1, 'Qui répond, qui est muet',
  'Lance un scan complet de tous les calculateurs. Note ceux qui ne répondent pas et ceux qui se plaignent du même calculateur.',
  'Tous les calculateurs du véhicule répondent.', 'Un seul calculateur muet et accusé par les autres : contrôle son alimentation, sa masse et son connecteur avant de le condamner. Plusieurs muets : ligne CAN ou alimentation commune.', ['network', 'power', 'ecu']);
const CANRES = T('canres', 2, 'Résistance et tensions du réseau CAN',
  'Batterie débranchée : mesure entre les broches 6 et 14 de la prise diagnostic. Batterie rebranchée, contact mis : tension de la broche 6 et de la broche 14 par rapport à la masse.',
  'Environ 60 ohms. CAN haut vers 2,6 à 2,8 V, CAN bas vers 2,2 à 2,4 V.', '120 ohms : une résistance de terminaison ou un tronçon est coupé. Proche de 0 : court-circuit entre les deux fils. Une ligne à 0 V ou 12 V : court-circuit à la masse ou au plus. Débranche les calculateurs un par un pour trouver le fautif.', ['network', 'wiring']);
const ECUPOWER = T('ecupower', 2, 'Alimentations et masses du calculateur',
  'Avec le schéma : contrôle chaque plus permanent, chaque plus après contact et chaque masse au connecteur du calculateur, sous charge (lampe témoin plutôt que multimètre seul).',
  'Toutes les alimentations à la tension batterie, toutes les masses à moins de 0,2 V.', 'Une alimentation ou une masse manque : la panne est là, pas dans le calculateur.', ['power', 'wiring']);
const ECULAST = T('eculast', 5, 'Calculateur : en dernier recours',
  'Seulement quand alimentations, masses, faisceau et composants sont validés : recherche une mise à jour logicielle constructeur, puis fais tester le calculateur par un spécialiste avant remplacement et codage.',
  'Une mise à jour ou une réparation règle le défaut.', 'Calculateur confirmé défaillant.', ['ecu']);
const WHEELLIVE = T('wheellive', 1, 'Vitesses des quatre roues en roulant',
  'Affiche les quatre vitesses de roue en graphique et roule doucement en ligne droite, puis freine jusqu’à l’arrêt.',
  'Quatre courbes superposées, qui descendent ensemble jusqu’à zéro.', 'Une roue décroche, saute ou tombe à zéro avant les autres : capteur, cible ou roulement de cette roue.', ['sensor', 'wiring', 'mechanical']);
const WHEELVIS = T('wheelvis', 0, 'Capteur, cible et roulement de la roue en défaut',
  'Roue déposée : faisceau du capteur (souvent coupé par frottement), tête du capteur encrassée de limaille, couronne dentée fendue ou rouillée, bague magnétique du roulement abîmée ou montée à l’envers, jeu du roulement.',
  'Faisceau entier, capteur propre, cible intacte, pas de jeu.', 'Répare ce qui est abîmé. Après un changement de roulement, vérifie le sens de la bague magnétique.', ['wiring', 'sensor', 'mechanical']);
const STEERCAL = T('steercal', 1, 'Capteur d’angle de volant : valeur et calibrage',
  'Roues droites, lis l’angle de volant. Tourne de butée à butée. Après une géométrie, une batterie débranchée ou un changement de pièce, refais le calibrage à la valise.',
  '0° roues droites à quelques degrés près, valeur continue de butée à butée.', 'Angle décalé : calibrage. Saut ou valeur figée : capteur ou contacteur tournant.', ['sensor', 'ecu']);
const AIRBAGSAFE = T('airbagsafe', 0, 'Airbag : mise en sécurité avant tout contrôle',
  'Coupe le contact, débranche la batterie et attends au moins 3 minutes avant de toucher un connecteur jaune. Ne mesure jamais un allumeur d’airbag au multimètre.',
  'Circuit hors tension.', 'Tant que ce n’est pas fait, ne touche à rien.', []);
const AIRBAGCONN = T('airbagconn', 0, 'Connecteurs jaunes sous les sièges et contacteur tournant',
  'Circuit en sécurité : contrôle les connecteurs sous les sièges (les plus souvent en cause après un réglage de siège), le verrouillage de chaque connecteur, et le contacteur tournant si le défaut vient du volant (klaxon ou commandes au volant en panne en même temps).',
  'Connecteurs verrouillés, pas de jeu, pas d’oxydation.', 'Résistance trop haute sur une ligne de siège : connecteur sous siège. Défaut conducteur avec klaxon muet : contacteur tournant.', ['wiring', 'part']);
const AIRBAGSUB = T('airbagsub', 3, 'Résistance de substitution',
  'Avec l’outil prévu (résistance de substitution de 2 à 3 ohms) à la place de l’élément accusé, rebranche la batterie et relis les défauts.',
  'Le défaut disparaît avec la résistance : l’élément est en cause.', 'Le défaut reste : faisceau ou calculateur d’airbag.', ['wiring', 'part'], { ok: { part: 4, wiring: 0.3 }, nok: { wiring: 3, ecu: 2, part: 0.3 } });
const ACPRESS = T('acpress', 3, 'Pressions de climatisation',
  'Manomètres haute et basse pression, moteur à 1 500 tr/min, climatisation au maximum. Compare aussi la valeur du capteur de pression à la valise, compresseur arrêté.',
  'Compresseur arrêté : pressions égales, cohérentes avec la température ambiante (environ 5 à 6 bar à 20 °C). En marche : basse pression vers 1,5 à 3 bar, haute pression vers 10 à 18 bar selon la température.', 'Pressions basses des deux côtés : manque de fluide, cherche la fuite. Pas d’écart en marche : compresseur ou sa commande. La manipulation du fluide demande l’attestation de capacité.', ['fluid', 'actuator', 'sensor']);
const BRAKESW = T('brakesw', 1, 'Contacteur de frein en live',
  'Affiche les deux états du contacteur de frein et appuie doucement sur la pédale. Vérifie que les feux stop s’allument.',
  'Les deux signaux basculent ensemble dès le début de la course.', 'Un signal en retard ou figé : réglage ou contacteur à remplacer.', ['sensor']);
const TRANSFLUID = T('transfluid', 0, 'Niveau et état de l’huile de boîte',
  'Contrôle le niveau selon la méthode constructeur (souvent moteur tournant à une température précise) et l’aspect : couleur, odeur de brûlé, limaille.',
  'Niveau correct, huile claire sans odeur.', 'Niveau bas : cherche la fuite, complète avec l’huile exacte. Huile brûlée ou chargée : usure interne.', ['fluid', 'mechanical']);
const TRANSLIVE = T('translive', 1, 'Boîte : régimes, glissement et adaptations',
  'En roulant, affiche régime moteur, régime d’entrée et de sortie de boîte, rapport engagé et glissement de l’embrayage ou du convertisseur. Relève les valeurs d’adaptation des embrayages.',
  'Rapport calculé égal au rapport engagé, glissement nul une fois verrouillé, adaptations dans la plage.', 'Glissement sur un rapport : embrayage ou pression de ce rapport. Adaptations en butée : usure. Après réparation, refais les apprentissages à la valise.', ['mechanical', 'actuator', 'ecu']);
const IMMOKEY = T('immokey', 1, 'Antidémarrage : clé reconnue ou non',
  'À la valise, lis l’état de l’antidémarrage : clé reconnue, nombre de clés apprises, autorisation de démarrage transmise au calculateur moteur. Essaie la deuxième clé.',
  'Clé reconnue et autorisation donnée.', 'Une seule clé refusée : clé ou transpondeur. Toutes refusées : antenne de lecture, boîtier ou synchronisation entre boîtier et calculateur moteur (à refaire après un remplacement).', ['part', 'ecu', 'wiring']);
const KNOCKTQ = T('knocktq', 4, 'Capteur de cliquetis : serrage et carburant',
  'Contrôle le couple de serrage du capteur (souvent 20 Nm) et son plan d’appui propre. Demande quel carburant a été mis récemment.',
  'Capteur serré au couple sur une surface propre.', 'Capteur desserré ou sur-serré : il n’entend plus rien. Un vrai cliquetis vient du carburant, de la calamine ou d’une surchauffe.', ['sensor', 'fluid', 'mechanical']);
const SAITEST = T('saitest', 1, 'Pompe et clapet d’air secondaire',
  'Test actionneur moteur froid : la pompe doit souffler fort. Contrôle le clapet anti-retour et les durites, souvent fondus par les gaz d’échappement.',
  'Pompe audible, débit franc, clapet étanche dans l’autre sens.', 'Pompe muette : fusible, relais, pompe noyée. Clapet qui fuit : il détruit la pompe, remplace les deux.', ['actuator', 'power', 'clog']);
const CHARGETEST = T('chargetest', 2, 'Alternateur sous charge',
  'Moteur à 2 000 tr/min, tous les consommateurs allumés : tension aux bornes de la batterie, puis entre la borne de sortie de l’alternateur et le plus batterie. Sur un alternateur piloté, regarde la consigne à la valise.',
  '13,5 V ou plus à la batterie. Moins de 0,3 V de perte sur le câble de charge.', 'Tension basse à la batterie et bonne à l’alternateur : câble ou cosse. Basse partout : alternateur, régulateur ou sa ligne de commande.', ['power', 'wiring', 'actuator']);
const VSS = T('vsslive', 1, 'Vitesse véhicule en live',
  'En roulant, compare la vitesse lue par le calculateur moteur, celle de l’ABS et celle du compteur.',
  'Les trois concordent.', 'La vitesse vient souvent de l’ABS : traite d’abord les défauts ABS ou de roue.', ['sensor', 'network']);

function familyTests(fam: Family, nature: Nature, fuel: Fuel): TestDef[] {
  const diesel = fuel === 'diesel';
  switch (fam.id) {
    case 'mixture':
      return nature === 'rich'
        ? [TRIMS, PURGE, MAFCHK, FUELP, O2RESP, INJCORR]
        : [TRIMS, EXLEAK, SMOKE, MAFCHK, FUELP, LOWP, O2RESP];
    case 'misfire': return diesel ? [MISCOUNT, INJCORR, FUELP, LEAKBACK, COMPRESSION] : [MISCOUNT, PERMUTE, TRIMS, PLUGS, SMOKE, FUELP, COMPRESSION];
    case 'coil': return [E_VIS, PERMUTE, MISCOUNT, E_SUPPLY, PLUGS, E_CONT];
    case 'o2': return nature === 'efficiency' ? [EXLEAK, O2RESP, CATTEST] : [E_VIS, EXLEAK, O2RESP, TRIMS, O2HEAT, E_CONT, SWAP];
    case 'catalyst': return [EXLEAK, MISCOUNT, TRIMS, O2RESP, CATTEST];
    case 'maf': return [E_VIS, MAFCHK, TRIMS, SMOKE, E_SUPPLY, E_CONT, SWAP];
    case 'map': return [E_VIS, E_LIVE, BOOSTLEAK, E_UNPLUG, E_SUPPLY, E_CONT, SWAP];
    case 'temp': return [E_VIS, TEMPCOLD, E_UNPLUG, E_RES, E_SUPPLY, E_CONT];
    case 'thermostat': return [THERMO, TEMPCOLD, FANTEST];
    case 'fan': return [FANTEST, THERMO, TEMPCOLD, E_FUSE, E_SUPPLY];
    case 'injector':
      return isElectrical(nature) ? [E_VIS, E_ACT, E_RES, E_SUPPLY, E_CONT, INJCORR] : diesel ? [INJCORR, FUELP, LEAKBACK, COMPRESSION, E_VIS] : [INJCORR, MISCOUNT, PERMUTE, TRIMS, E_VIS];
    case 'fuelp': return diesel ? [FUELP, LOWP, E_VIS, LEAKBACK, E_ACT, E_SUPPLY] : [FUELP, LOWP, E_FUSE, E_VIS, E_ACT, E_SUPPLY];
    case 'turbo':
      if (isElectrical(nature)) return [E_VIS, E_ACT, E_FUSE, E_SUPPLY, E_CONT, E_RES];
      return [BOOSTLEAK, BOOST, TURBOACT, EGRCMD, DPFDIFF, TURBOPLAY];
    case 'egr': return isElectrical(nature) ? [E_VIS, E_ACT, EGRCMD, E_SUPPLY, E_CONT, E_RES] : [EGRCMD, MAFCHK, E_VIS, EGRCLEAN];
    case 'dpf': return isElectrical(nature) ? [DPFHOSE, E_VIS, DPFDIFF, E_SUPPLY, E_CONT] : [DPFDIFF, DPFHOSE, DPFWHY, THERMO];
    case 'scr': return isElectrical(nature) ? [E_VIS, E_FUSE, E_ACT, E_SUPPLY, E_CONT, E_RES] : [SCRQUAL, NOXCHK, SCRPRESS, E_VIS, EXLEAK];
    case 'evap': return [EVAPCAP, PURGE, SMOKE, E_VIS, E_SUPPLY];
    case 'sai': return [SAITEST, E_FUSE, E_VIS, E_SUPPLY];
    case 'glow': return [GLOWRES, GLOWMOD, E_VIS, E_CONT];
    case 'knock': return [E_VIS, KNOCKTQ, E_CONT, SWAP];
    case 'vvt': return [OILCHK, TIMINGLIVE, E_VIS, VVTSOL, CKPSIG, TIMINGMARKS];
    case 'ckp': return isElectrical(nature) ? [E_VIS, CKPSIG, E_SUPPLY, E_CONT, E_RES, SWAP] : [CKPSIG, E_VIS, TIMINGLIVE, E_SUPPLY, E_CONT, TIMINGMARKS];
    case 'throttle': return [THROTTLE, E_VIS, E_ACT, E_SUPPLY, E_CONT, SWAP];
    case 'oil': return [OILCHK, E_VIS, OILPRESS, E_SUPPLY];
    case 'charge': return [BAT, CHARGETEST, GROUND, E_VIS, E_FUSE];
    case 'trans': return isElectrical(nature) ? [E_VIS, TRANSFLUID, E_ACT, E_RES, E_SUPPLY, E_CONT] : [TRANSFLUID, TRANSLIVE, E_VIS, BAT];
    case 'wheel': return [WHEELLIVE, WHEELVIS, E_RES, E_CONT, E_SUPPLY];
    case 'abs': return [BAT, WHEELLIVE, E_FUSE, BRAKESW, E_VIS, ECUPOWER];
    case 'steer': return [BAT, STEERCAL, E_VIS, E_FUSE, ECUPOWER];
    case 'airbag': return [AIRBAGSAFE, AIRBAGCONN, AIRBAGSUB];
    case 'immo': return [BAT, IMMOKEY, E_VIS, ECUPOWER];
    case 'ac': return [E_VIS, E_LIVE, ACPRESS, E_FUSE, E_SUPPLY];
    case 'vss': return [VSS, WHEELLIVE, E_VIS];
    case 'brake': return [BRAKESW, E_VIS, E_SUPPLY];
    case 'can': return [BAT, CANTOPO, E_FUSE, GROUND, CANRES, ECUPOWER];
    case 'ecu': return [BAT, GROUND, ECUPOWER, ECULAST];
    default: return [];
  }
}

/** Liste des contrôles pour un code, pas encore triée. */
export function testsFor(fam: Family, nature: Nature, fuel: Fuel): TestDef[] {
  let list = familyTests(fam, nature, fuel);
  if (!list.length) list = fam.id === 'unknown' ? [] : electrical(fam.kind, nature);
  else if (nature === 'intermittent' && !list.includes(E_WIGGLE)) list = [...list, E_WIGGLE];
  if ((fam.kind === 'sensor' || fam.kind === 'actuator') && !list.includes(SWAP) && fam.id !== 'airbag') list = [...list, SWAP];
  return list;
}

export const COMMON = { BAT, GROUND, PRELIM };
export const ALL_TESTS: TestDef[] = [PRELIM, BAT, GROUND, E_VIS, E_LIVE, E_UNPLUG, E_SUPPLY, E_CONT, E_RES, E_ACT, E_FUSE, E_WIGGLE, SWAP, SMOKE, TRIMS, MAFCHK, FUELP, LOWP, LEAKBACK, INJCORR, MISCOUNT, PERMUTE, PLUGS, COMPRESSION, O2RESP, O2HEAT, EXLEAK, CATTEST, BOOST, BOOSTLEAK, TURBOACT, TURBOPLAY, EGRCMD, EGRCLEAN, DPFDIFF, DPFHOSE, DPFWHY, SCRQUAL, SCRPRESS, NOXCHK, EVAPCAP, PURGE, GLOWRES, GLOWMOD, THERMO, TEMPCOLD, FANTEST, TIMINGLIVE, OILCHK, VVTSOL, TIMINGMARKS, CKPSIG, THROTTLE, OILPRESS, CANTOPO, CANRES, ECUPOWER, ECULAST, WHEELLIVE, WHEELVIS, STEERCAL, AIRBAGSAFE, AIRBAGCONN, AIRBAGSUB, ACPRESS, BRAKESW, TRANSFLUID, TRANSLIVE, IMMOKEY, KNOCKTQ, SAITEST, CHARGETEST, VSS];
export const TEST_BY_ID: Record<string, TestDef> = Object.fromEntries(ALL_TESTS.map((t) => [t.id, t]));
