import { describe, it, expect } from 'vitest';
import { parseCodes, formatCode, obdSystem } from '../src/core/codes';
import { parseDictation, joinSpokenCodes } from '../src/core/voice';
import { violatesEmissionRule, scrubText } from '../src/core/guard';
import { detectFamily, detectNature, causeCat } from '../src/core/classify';
import { ftbLabel } from '../src/core/ftb';
import { detectBrand, detectFuel, detectEngine } from '../src/core/brands';
import { ALL_TESTS } from '../src/core/testlib';
import { KNOWN } from '../src/data/pannes-connues';

describe('lecture des codes', () => {
  it('lit les codes OBD avec ou sans espace et dédoublonne', () => {
    expect(parseCodes('p0171, P 0300 P0171').map((c) => c.code)).toEqual(['P0171', 'P0300']);
  });
  it('lit l’octet de type de défaut, collé ou séparé', () => {
    expect(parseCodes('P0171-13')[0]).toMatchObject({ code: 'P0171', ft: 0x13 });
    expect(parseCodes('P164E00')[0]).toMatchObject({ code: 'P164E', ft: 0 });
    expect(parseCodes('U0100:87')[0]).toMatchObject({ code: 'U0100', ft: 0x87 });
    expect(formatCode({ code: 'P0171', ft: 0x13 })).toBe('P0171-13');
  });
  it('lit les anciens codes VAG à 5 chiffres mais pas un kilométrage', () => {
    expect(parseCodes('17544 P0171').map((c) => [c.code, c.format])).toEqual([['P0171', 'obd'], ['17544', 'vag5']]);
    expect(parseCodes('148000 km')).toEqual([]);
    expect(parseCodes('48000 km')).toEqual([]);
  });
  it('lit les codes Renault DF', () => {
    expect(parseCodes('DF 025 et df1012').map((c) => c.code)).toEqual(['DF025', 'DF1012']);
  });
  it('lit les codes hexadécimaux BMW', () => {
    expect(parseCodes('4A63 4687', { hexHint: true }).map((c) => [c.code, c.format])).toEqual([['4A63', 'hex'], ['4687', 'hex']]);
    expect(parseCodes('4A63 en 2016').map((c) => c.code)).toEqual(['4A63']);
    expect(parseCodes('308 II 2016')).toEqual([]);
  });
  it('garde le code du cas BMW repris de la v1', () => {
    expect(parseCodes('BA6D1').map((c) => c.code)).toEqual(['BA6D1']);
  });
  it('ne prend pas un mot pour un code', () => {
    expect(parseCodes('face cade dead beef')).toEqual([]);
  });
  it('décrit le système d’un code', () => {
    expect(obdSystem('P0171')).toMatch(/générique/);
    expect(obdSystem('P1234')).toMatch(/constructeur/);
    expect(obdSystem('U0100')).toMatch(/Réseau/);
  });
});

describe('dictée', () => {
  it('recolle un code épelé', () => {
    expect(joinSpokenCodes('code p zéro un sept un')).toBe('code P0171');
    expect(joinSpokenCodes('pé 0 300')).toBe('P0300');
    expect(joinSpokenCodes('u zéro un zéro zéro')).toBe('U0100');
  });
  it('ne transforme pas une phrase normale', () => {
    expect(joinSpokenCodes('ce bruit vient de un cylindre')).toBe('ce bruit vient de un cylindre');
  });
  it('remplit la fiche à partir d’une phrase', () => {
    const d = parseDictation('Clio 4 1.5 dCi 90, 148 000 km, code p zéro deux neuf neuf, perte de puissance et sifflement');
    expect(d.codes.map((c) => c.code)).toEqual(['P0299']);
    expect(d.brand).toBe('RENAULT');
    expect(d.km).toBe(148000);
    expect(d.fuel).toBe('diesel');
    expect(d.engine).toMatch(/1.5 dCi 90/i);
    expect(d.sym).toMatch(/perte de puissance/);
    expect(d.sym).not.toMatch(/P0299/);
  });
  it('comprend « 150 mille » et une plaque', () => {
    const d = parseDictation('308 1.6 hdi 150 mille km AB-123-CD voyant moteur');
    expect(d.km).toBe(150000);
    expect(d.plate).toBe('AB-123-CD');
    expect(d.brand).toBe('PSA');
  });
});

describe('marques et moteurs', () => {
  it('détecte marque, carburant, moteur', () => {
    expect(detectBrand('Golf 6 2.0 TDI')).toBe('VOLKSWAGEN');
    expect(detectBrand('118d 2006')).toBe('BMW');
    expect(detectFuel('1.2 PureTech 110')).toBe('essence');
    expect(detectFuel('2.0 BlueHDi 150')).toBe('diesel');
    expect(detectEngine('308 II 1.6 BlueHDi 120 de 2016')).toMatch(/1.6 BlueHDi 120/);
  });
});

describe('règle antipollution', () => {
  const forbidden = ['Suppression FAP', 'défapage et reprog', 'Reprog stage 1 EGR off', 'DPF delete', 'fit a blanking plate on the EGR', 'émulateur AdBlue', 'neutralisation de la vanne EGR',
    'obturer l’EGR', 'ligne sans FAP', 'supprimer l’AdBlue', 'AdBlue emulator installed', 'décata', 'FAP vidé', 'désactivation de l’EGR'];
  const allowed = ['Déposer la vanne EGR pour nettoyage', 'Remplacer le FAP', 'Nettoyage EGR et adaptation', 'The EGR cooler bypass valve on bank 1 is stuck', 'Vidanger le réservoir AdBlue et refaire le plein',
    'Without pump pressure no AdBlue reaches the SCR catalyst', 'The ECU disables exhaust gas recirculation and may set further EGR codes', 'Régénération forcée du FAP', 'Ford’s DPFE check at idle with EGR off expects no pressure',
    'Remplacement sonde NOx amont', 'EGR is off.', 'the module uses a substitute value or switches EGR off.'];
  it.each(forbidden)('refuse : %s', (t) => expect(violatesEmissionRule(t)).toBe(true));
  it.each(allowed)('accepte : %s', (t) => expect(violatesEmissionRule(t)).toBe(false));
  it('retire seulement la phrase interdite', () => {
    const r = scrubText('Nettoyer la vanne. Sinon suppression EGR. Puis adaptation.');
    expect(r.removed).toBe(1);
    expect(r.text).toBe('Nettoyer la vanne. Puis adaptation.');
  });
  it('aucun contrôle ni aucune panne connue livrés ne violent la règle', () => {
    for (const t of ALL_TESTS) expect(violatesEmissionRule(`${t.title}. ${t.how} ${t.expect} ${t.bad}`), t.id).toBe(false);
    for (const k of KNOWN) expect(violatesEmissionRule(`${k.cause} ${k.check} ${k.fix}`), k.id).toBe(false);
  });
});

describe('classification', () => {
  it('reconnaît les familles', () => {
    expect(detectFamily('System Too Lean Bank 1').id).toBe('mixture');
    expect(detectFamily('Turbocharger/Supercharger A Underboost Condition').id).toBe('turbo');
    expect(detectFamily('Mass or Volume Air Flow Sensor A Circuit Low').id).toBe('maf');
    expect(detectFamily('Lost Communication With ECM/PCM A', 'U0100').id).toBe('can');
    expect(detectFamily('Reductant Pressure Too Low').id).toBe('scr');
    expect(detectFamily('Diesel Particulate Filter Efficiency Below Threshold').id).toBe('dpf');
    expect(detectFamily('Cylinder 1 Misfire Detected').id).toBe('misfire');
    expect(detectFamily('Driver Frontal Stage 1 Deployment Control').id).toBe('airbag');
    expect(detectFamily('Vanne de régulation de pression d’huile N428 : défaut électrique').id).toBe('oil');
    expect(detectFamily('Capteur de pression de suralimentation').id).toBe('turbo');
    expect(detectFamily('Glow Plug Circuit').id).toBe('glow');
    expect(detectFamily('rien de connu').id).toBe('unknown');
  });
  it('reconnaît la nature du défaut', () => {
    expect(detectNature('Mass Air Flow Sensor Circuit Low')).toBe('circuit_low');
    expect(detectNature('Sensor Circuit High')).toBe('circuit_high');
    expect(detectNature('System Too Lean Bank 1')).toBe('lean');
    expect(detectNature('Sensor Circuit', 0x13)).toBe('circuit_open');
    expect(detectNature('Reductant Pressure Too Low')).toBe('low');
    expect(detectNature('EGR Valve Stuck Open')).toBe('stuck');
  });
  it('range les causes par catégorie', () => {
    expect(causeCat('Signal wire shorted to ground')).toBe('wiring');
    expect(causeCat('Vacuum leak at intake manifold gasket')).toBe('air_leak');
    expect(causeCat('Faulty MAF sensor')).toBe('sensor');
    expect(causeCat('Fuel pump weak')).toBe('fuel');
    expect(causeCat('Supply fuse blown')).toBe('power');
    expect(causeCat('Timing chain stretched')).toBe('mechanical');
  });
  it('décode l’octet de type', () => {
    expect(ftbLabel(0x13)).toBe('Circuit ouvert');
    expect(ftbLabel(0x87)).toBe('Message manquant');
    expect(ftbLabel(null)).toBe('');
  });
});

describe('dictée : kilométrage collé à la puissance', () => {
  it('sépare « 90 148 000 km »', () => {
    const d = parseDictation('P0299 Clio 4 1.5 dCi 90 148 000 km perte de puissance');
    expect(d.km).toBe(148000);
    expect(d.engine).toMatch(/1.5 dCi 90/);
  });
  it('lit un kilométrage sans espace', () => {
    expect(parseDictation('golf 2.0 tdi 232000 km').km).toBe(232000);
  });
});
