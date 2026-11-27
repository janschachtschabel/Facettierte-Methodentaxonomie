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

const fold = (s: string) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');

/**
 * Every stated scope of the method's evidence names secondary school, university or adult learning only. "Schule" and
 * "Schulen" in general include primary school; schools named as vocational or "weiterführend" do not. "Schulen" and
 * "allgemeinbildende Schulen" count as school in general only without a secondary qualifier in the same scope.
 */
export function nurSekundarEvidenz(b: Baustein): boolean {
  const scopes = (b.evidenz || []).map((e) => fold(e.geltung || '')).filter(Boolean);
  if (!scopes.length) return false;
  const sekundar = /(?:sekundarstufe|oberstufe|\bsek\b)/;
  const schuleAllgemein = (s: string) =>
    /(?:\bschule\b|primar|grundschul|alle\s+stufen|facherubergreifend|klasse\s*[1-4])/.test(s) ||
    (!sekundar.test(s) && (/(?<!(?:beruflichen?|berufsbildenden?|weiterfuhrenden?) )\bschulen\b/.test(s) || (/allgemeinbildend/.test(s) && /\bschulen\b/.test(s))));
  return scopes.every(
    (s) => /(?:sekundarstufe|oberstufe|hochschule|universitat|berufsbildung|erwachsenenbildung|ab\s+sek|weiterfuhrende)/.test(s) && !schuleAllgemein(s)
  );
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
export function erstelleRegeln(regeln: Passungsregel[], label?: (schema: string, code: string) => string) {
  const nachId = new Map(regeln.map((r) => [r.id, r]));
  const fuelle = (text: string, b: Baustein) => text.replace(/\{methode\}/g, b.name);
  /** Message of a rule for a method; built-in rules take their text from the data as well. */
  const meldung = (r: Passungsregel, b?: Baustein, text?: string): Regelmeldung => ({
    regel: r.id,
    wirkung: r.wirkung,
    grundlage: r.grundlage,
    ...(r.quelle ? { quelle: r.quelle } : {}),
    text: text ?? (b ? fuelle(r.text, b) : r.text),
    ...(b ? { baustein: b.kennung } : {})
  });

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
    // With labels the sentence names the value ("passt weniger zum Fachbereich „Sport und Bewegung“").
    const wert = (schema: string, code: string | undefined, mit: string, ohne: string) =>
      label && code ? `${mit} „${label(schema, code)}“` : ohne;
    eintrag('eignung-stufe', 'stufe', b.ungeeignetBeiStufe, s.bildungsstufe, `${b.name} passt weniger ${wert('bildungsstufe', s.bildungsstufe, 'zur Bildungsstufe', 'zu dieser Bildungsstufe')}.`);
    eintrag('eignung-vorwissen', 'vorwissen', b.ungeeignetBeiVorwissen, s.vorwissen, `${b.name} passt weniger ${wert('vorwissen', s.vorwissen, 'zum Vorwissen', 'zu diesem Vorwissen')}.`);
    eintrag('eignung-fach', 'fachbereich', b.fachbereichUngeeignet, s.fachbereich, `${b.name} passt weniger ${wert('fachbereich', s.fachbereich, 'zum Fachbereich', 'zu diesem Fachbereich')}.`);
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

  function pruefe(b: Baustein, s: RegelSituation): Regelmeldung[] {
    const aus: Regelmeldung[] = [];
    for (const r of regeln) if (feuert(r, b, s)) aus.push(meldung(r, b));
    return aus.concat(eignung(b, s));
  }

  return {
    /** Declarative rules and suitability entries of the method that fire in this situation. */
    pruefe,
    /**
     * Every warning for the method in this situation: the declarative rules and suitability entries, plus the built-in
     * rule evidenz-geltung (primary school, evidence only from secondary school or later; not next to a stage entry).
     */
    warnungen(b: Baustein, s: RegelSituation): Regelmeldung[] {
      const aus = pruefe(b, s).filter((m) => m.wirkung === 'warnt');
      const geltung = nachId.get('evidenz-geltung');
      if (geltung && s.bildungsstufe === 'primar' && !aus.some((m) => m.regel === 'eignung-stufe') && nurSekundarEvidenz(b)) {
        aus.push(meldung(geltung, b));
      }
      return aus;
    },
    /** Message of a built-in rule (text from the data unless given), or null when the rule is not in the data. */
    meldung(id: string, b?: Baustein, text?: string): Regelmeldung | null {
      const r = nachId.get(id);
      return r ? meldung(r, b, text) : null;
    },
    regel(id: string): Passungsregel | undefined {
      return nachId.get(id);
    },
    alle(): Passungsregel[] {
      return regeln;
    }
  };
}
