import type { Baustein, Grundlage, Passungsregel, Regelmeldung, RegelSituation } from './types.js';

type Listenvergleich = NonNullable<NonNullable<Passungsregel['wenn']>['methode']>[string];

const SITUATION_FELDER: (keyof RegelSituation)[] = ['vorwissen', 'bildungsstufe', 'komplexitaet', 'sprachniveau', 'fachbereich'];

/** Compare a list of values of the method with one comparison; absent comparison parts are ignored. */
function vergleiche(werte: string[], v: Listenvergleich): boolean {
  if (v.enthaelt && !v.enthaelt.some((x) => werte.includes(x))) return false;
  if (v.nur && !(werte.length > 0 && werte.every((x) => v.nur!.includes(x)))) return false;
  if (v.ohne && v.ohne.some((x) => werte.includes(x))) return false;
  return true;
}

function listenwert(b: Baustein, feld: string): string[] {
  const w = (b as unknown as Record<string, unknown>)[feld];
  return Array.isArray(w) ? (w as string[]) : [];
}

/**
 * Fit rules as data. Declarative rules fire when every named method field and every named
 * situation field matches; a situation field that is not given never fires the rule.
 * Built-in rules are applied by the matcher; here they only carry their text and basis.
 */
export function erstelleRegeln(regeln: Passungsregel[]) {
  const nachId = new Map(regeln.map((r) => [r.id, r]));
  const fuelle = (text: string, b: Baustein) => text.replace(/\{methode\}/g, b.name);

  function eignung(b: Baustein, s: RegelSituation): Regelmeldung[] {
    const aus: Regelmeldung[] = [];
    const eintrag = (
      regel: string,
      art: 'stufe' | 'vorwissen' | 'fachbereich',
      liste: string[] | undefined,
      wert: string | undefined,
      standard: string
    ) => {
      if (!wert || !liste?.includes(wert)) return;
      const g = b.eignungsgrund?.[art];
      const grundlage: Grundlage = g?.grundlage ?? 'A';
      const text = g ? `${standard} ${g.text}` : `${standard} (Setzung der Redaktion)`;
      aus.push({ regel, wirkung: 'warnt', grundlage, ...(g?.quelle ? { quelle: g.quelle } : {}), text, baustein: b.kennung });
    };
    eintrag('eignung-stufe', 'stufe', b.ungeeignetBeiStufe, s.bildungsstufe, `${b.name} passt weniger zu dieser Bildungsstufe.`);
    eintrag('eignung-vorwissen', 'vorwissen', b.ungeeignetBeiVorwissen, s.vorwissen, `${b.name} passt weniger zu diesem Vorwissen.`);
    eintrag('eignung-fach', 'fachbereich', b.fachbereichUngeeignet, s.fachbereich, `${b.name} passt weniger zu diesem Fachbereich.`);
    return aus;
  }

  function feuert(r: Passungsregel, b: Baustein, s: RegelSituation): boolean {
    if (r.art !== 'deklarativ' || !r.wenn) return false;
    for (const [feld, v] of Object.entries(r.wenn.methode ?? {})) if (!vergleiche(listenwert(b, feld), v)) return false;
    for (const [feld, erlaubt] of Object.entries(r.wenn.situation ?? {})) {
      const wert = SITUATION_FELDER.includes(feld as keyof RegelSituation) ? s[feld as keyof RegelSituation] : undefined;
      if (!wert || !erlaubt.includes(wert)) return false;
    }
    return true;
  }

  return {
    /** Declarative rules and suitability entries of the method that fire in this situation. */
    pruefe(b: Baustein, s: RegelSituation): Regelmeldung[] {
      const aus: Regelmeldung[] = [];
      for (const r of regeln) {
        if (!feuert(r, b, s)) continue;
        aus.push({
          regel: r.id,
          wirkung: r.wirkung,
          grundlage: r.grundlage,
          ...(r.quelle ? { quelle: r.quelle } : {}),
          text: fuelle(r.text, b),
          baustein: b.kennung
        });
      }
      return aus.concat(eignung(b, s));
    },
    regel(id: string): Passungsregel | undefined {
      return nachId.get(id);
    },
    alle(): Passungsregel[] {
      return regeln;
    }
  };
}
