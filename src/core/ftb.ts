/** Octet de type de défaut (ISO 15031-6 / SAE J2012-DA), en français d'atelier. */
const FTB: Record<number, string> = {
  0x00: 'Sans précision', 0x01: 'Défaut électrique général', 0x02: 'Défaut de signal général', 0x03: 'Signal PWM ou fréquence',
  0x04: 'Défaut interne du calculateur', 0x05: 'Défaut de programmation', 0x06: 'Défaut d’algorithme', 0x07: 'Défaut mécanique',
  0x08: 'Défaut de signal ou message sur le réseau', 0x09: 'Défaut du composant',
  0x11: 'Court-circuit à la masse', 0x12: 'Court-circuit au plus batterie', 0x13: 'Circuit ouvert',
  0x14: 'Court-circuit à la masse ou circuit ouvert', 0x15: 'Court-circuit au plus ou circuit ouvert',
  0x16: 'Tension sous le seuil', 0x17: 'Tension au-dessus du seuil', 0x18: 'Courant sous le seuil', 0x19: 'Courant au-dessus du seuil',
  0x1A: 'Résistance sous le seuil', 0x1B: 'Résistance au-dessus du seuil', 0x1C: 'Tension hors plage', 0x1D: 'Courant hors plage',
  0x1E: 'Résistance hors plage', 0x1F: 'Défaut intermittent',
  0x21: 'Amplitude du signal trop faible', 0x22: 'Amplitude du signal trop forte', 0x23: 'Signal bloqué à l’état bas', 0x24: 'Signal bloqué à l’état haut',
  0x25: 'Forme du signal incorrecte', 0x26: 'Variation du signal trop lente', 0x27: 'Variation du signal trop rapide',
  0x28: 'Décalage du signal (offset)', 0x29: 'Signal invalide', 0x2A: 'Signal figé', 0x2B: 'Signal en court-circuit avec un autre signal', 0x2F: 'Signal erratique',
  0x31: 'Pas de signal', 0x32: 'Largeur d’impulsion trop faible', 0x33: 'Largeur d’impulsion trop forte', 0x34: 'Rapport cyclique trop faible', 0x35: 'Rapport cyclique trop fort',
  0x36: 'Fréquence trop basse', 0x37: 'Fréquence trop haute', 0x38: 'Fréquence incorrecte', 0x39: 'Nombre d’impulsions incorrect',
  0x41: 'Erreur de somme de contrôle', 0x42: 'Défaut de mémoire', 0x43: 'Défaut de mémoire spéciale', 0x44: 'Défaut de mémoire de données',
  0x45: 'Défaut de mémoire programme', 0x46: 'Défaut de mémoire de calibration', 0x47: 'Défaut du chien de garde', 0x48: 'Défaut du logiciel de surveillance',
  0x49: 'Défaut électronique interne', 0x4A: 'Mauvais composant installé', 0x4B: 'Surchauffe',
  0x51: 'Non programmé', 0x52: 'Non activé', 0x53: 'Désactivé', 0x54: 'Calibration manquante', 0x55: 'Non configuré', 0x56: 'Configuration invalide', 0x57: 'Logiciel incompatible',
  0x61: 'Erreur de calcul du signal', 0x62: 'Écart entre deux signaux comparés', 0x63: 'Temps de protection dépassé', 0x64: 'Signal non plausible',
  0x65: 'Trop peu de transitions', 0x66: 'Trop de transitions', 0x67: 'Signal incorrect après événement', 0x68: 'Information d’événement',
  0x71: 'Actionneur bloqué', 0x72: 'Actionneur bloqué ouvert', 0x73: 'Actionneur bloqué fermé', 0x74: 'Actionneur qui patine',
  0x75: 'Position de secours inatteignable', 0x76: 'Mauvaise position de montage', 0x77: 'Position commandée inatteignable', 0x78: 'Alignement ou réglage incorrect',
  0x79: 'Défaut de liaison mécanique', 0x7A: 'Fuite de fluide ou joint', 0x7B: 'Niveau de fluide bas',
  0x81: 'Donnée reçue invalide', 0x82: 'Compteur de vie incorrect', 0x83: 'Valeur de protection du signal incorrecte',
  0x84: 'Signal sous la plage admise', 0x85: 'Signal au-dessus de la plage admise', 0x86: 'Signal invalide', 0x87: 'Message manquant', 0x88: 'Bus coupé (bus off)',
  0x8F: 'Signal erratique',
  0x91: 'Paramétrique', 0x92: 'Performance ou fonctionnement incorrect', 0x93: 'Ne fonctionne pas', 0x94: 'Fonctionnement inattendu',
  0x95: 'Montage incorrect', 0x96: 'Défaut interne du composant', 0x97: 'Composant ou système obstrué ou bloqué', 0x98: 'Surchauffe du composant',
  0x9A: 'Conditions de fonctionnement du composant',
};

export function ftbLabel(ft: number | null | undefined): string {
  if (ft == null) return '';
  return FTB[ft] || '';
}

/** Nature de défaut déduite de l'octet, pour orienter le plan de tests. */
export function ftbNature(ft: number | null | undefined): string {
  if (ft == null) return '';
  if ([0x11, 0x16, 0x23, 0x1A, 0x84].includes(ft)) return 'circuit_low';
  if ([0x12, 0x17, 0x24, 0x1B, 0x85].includes(ft)) return 'circuit_high';
  if ([0x13, 0x14, 0x15, 0x31].includes(ft)) return 'circuit_open';
  if ([0x1F, 0x2F, 0x8F].includes(ft)) return 'intermittent';
  if ([0x71, 0x72, 0x73, 0x77, 0x97, 0x79, 0x07].includes(ft)) return 'stuck';
  if ([0x29, 0x62, 0x64, 0x92, 0x28, 0x2A, 0x26, 0x27].includes(ft)) return 'range_perf';
  if ([0x81, 0x82, 0x83, 0x86, 0x87, 0x88, 0x08].includes(ft)) return 'comm';
  if (ft >= 0x41 && ft <= 0x57 || ft === 0x04) return 'internal';
  if ([0x01, 0x1C, 0x1D, 0x1E, 0x18, 0x19].includes(ft)) return 'circuit';
  return '';
}
