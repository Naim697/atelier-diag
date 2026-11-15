/** Schéma de données d'Atelier diag v2. Toute évolution passe par une migration (src/db/db.ts). */

export type CodeFormat = 'obd' | 'vag5' | 'hex' | 'df';

/** Un code défaut tel que relevé sur la valise. */
export interface CodeRef {
  code: string;            // P0171, 17544, 4A63, DF001
  format: CodeFormat;
  ft?: number | null;      // octet de type de défaut (P0171-13 -> 0x13)
  label?: string;          // libellé affiché par la valise
  ecu?: string;            // calculateur d'origine
}

export type Fuel = '' | 'essence' | 'diesel' | 'hybride' | 'electrique' | 'gpl';

export interface VehicleInfo {
  plate: string;           // immatriculation ou VIN
  brand: string;           // clé de marque (PSA, RENAULT, BMW…) ou texte libre
  model: string;           // « 308 II 2016 »
  engine: string;          // « 1.6 BlueHDi 120 »
  fuel: Fuel;
  km: number | null;
}

export type StepOutcome = 'ok' | 'nok' | 'skip';

/** Résultat d'un contrôle du plan de tests. */
export interface StepResult {
  testId: string;
  title: string;
  outcome: StepOutcome;
  measured?: string;
  at: string;
}

export interface Case extends VehicleInfo {
  id: string;
  date: string;            // AAAA-MM-JJ
  status: 'wip' | 'ok';
  codes: CodeRef[];
  codeStatus: string;      // permanent, intermittent…
  sym: string;
  live: string;
  steps: StepResult[];
  tests: string;           // contrôles en texte libre
  cause: string;           // cause réelle trouvée
  causeCat: string;        // catégorie de cause (voir classify.ts), '' si inconnue
  fix: string;
  cost: string;
  time: string;
  notes: string;
  photoIds: string[];
  created: string;
  updated: string;
  deleted?: boolean;       // pierre tombale : permet la fusion à l'import
}

export interface Photo {
  id: string;
  caseId: string;
  blob: Blob;
  created: string;
}

export interface MyDef {
  id: string;              // code|marque
  code: string;
  brand: string;
  text: string;
  notes: string;
  updated: string;
  deleted?: boolean;
}

/** Une fiche de la base de codes (un enregistrement par code et par paquet). */
export interface DtcEntry {
  id: string;              // paquet|code
  pack: string;
  code: string;
  t?: string;              // titre d'origine
  tf?: string;             // titre français
  d?: string;              // description
  k?: string[];            // composants
  cs?: [string, number][]; // causes [texte, fréquence 1..3]
  s?: string[];            // symptômes
  r?: [string, boolean, [number, number] | null, [number, number] | null]; // difficulté, faisable, coût, temps
  f?: string;              // drapeaux M (voyant) L (dégradé) E (antipollution) D (cycle de conduite)
  x?: string[];            // codes liés
  brands?: Record<string, string>;            // paquet constructeurs : marque -> libellé
  variants?: [string, string, string[], string[]][]; // PSA : [calculateur, libellé, types de défaut, calculateurs]
}

export interface PackMeta {
  id: string;
  name: string;
  version: string;
  license: string;
  source: string;
  lang: string;
  count: number;
  installed?: string;
  removedByRule?: number;  // phrases retirées par la règle antipollution
}

export interface PackFile extends PackMeta {
  format: 'atelier-diag-pack';
  entries: Omit<DtcEntry, 'id' | 'pack'>[];
  extra?: Record<string, unknown>; // ex. noms de calculateurs, PIDs
}

export interface Settings {
  tool: string;            // valise utilisée
  lastBackup: string;
  theme: '' | 'light' | 'dark';
}

export interface BackupFile {
  format: 'atelier-diag-backup';
  version: 2;
  exported: string;
  cases: Case[];
  defs: MyDef[];
  settings: Settings;
  photos?: { id: string; caseId: string; created: string; type: string; data: string }[];
}
