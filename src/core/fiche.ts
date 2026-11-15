import { parseCodes } from './codes';

/** Fiche de code rédigée par Claude à la fin d'un guidage, que l'appli sait relire. */
export interface Fiche { code: string; brand: string; text: string; causes: string[]; checks: string }

export const FICHE_INSTRUCTION =
  `Quand un code est identifié (surtout s’il n’était pas dans ma base), termine ta réponse par une fiche par code, dans un bloc de code, exactement sous cette forme pour que je la colle dans mon appli :\n` +
  `FICHE ATELIER DIAG\nCODE: P0000\nMARQUE: marque et moteur concernés\nDEFINITION: sens du code en une phrase\nCAUSES: cause la plus fréquente ; cause suivante ; cause rare\nCONTROLES: les vérifications dans l’ordre, avec les valeurs attendues`;

const clean = (s: string) => s.replace(/[*_`]/g, '').trim();

/** Lit une ou plusieurs fiches dans un texte collé, même entouré d'autre texte ou de mise en forme. */
export function parseFiches(raw: string): Fiche[] {
  const out: Fiche[] = [];
  const text = (raw || '').replace(/\r/g, '');
  const blocks = text.split(/(?=^[\s>*_`#-]*CODE\s*:)/im);
  for (const block of blocks) {
    const field = (name: string) => {
      const re = new RegExp(`^[\\s>*_\`#-]*${name}\\s*:\\s*([\\s\\S]*?)(?=^[\\s>*_\`#-]*(?:CODE|MARQUE|D[ÉE]FINITION|CAUSES?|CONTR[ÔO]LES?|FICHE ATELIER DIAG)\\b|^\`\`\`|(?![\\s\\S]))`, 'im');
      const m = re.exec(block);
      return m ? clean(m[1].replace(/\n+/g, ' ')) : '';
    };
    const code = parseCodes(field('CODE'), { hexHint: true })[0]?.code;
    const def = field('D[ÉE]FINITION');
    if (!code || !def) continue;
    const causes = field('CAUSES?').split(/\s*;\s*|\s*\|\s*/).map((c) => c.replace(/^\d+[.)]\s*/, '').trim()).filter((c) => c.length > 2).slice(0, 8);
    out.push({ code, brand: field('MARQUE'), text: def, causes, checks: field('CONTR[ÔO]LES?') });
  }
  return out;
}
