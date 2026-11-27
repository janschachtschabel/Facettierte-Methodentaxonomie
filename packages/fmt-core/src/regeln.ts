import type { Arrangement, ArrangementNode, Baustein, FmtData, Grundlage, Passungsregel, Regelmeldung, RegelSituation, Wirkung } from './types.js';
import { KennungIndex } from './kennung.js';
import type { EntwurfRegelmeldung } from './entwurf.js';

/** Suitability entries of a method come from the rule machine, not from data/regeln.json; they carry their own name. */
export const EIGNUNG_REGEL_NAMEN: Readonly<Record<string, string>> = {
  'eignung-stufe': 'Eignung für die Bildungsstufe',
  'eignung-vorwissen': 'Eignung für das Vorwissen',
  'eignung-fach': 'Eignung für den Fachbereich'
};

/** Effect of a rule message in plain German; the keys are every effect a message can have. */
export const WIRKUNG_KLARTEXT: Readonly<Record<Wirkung, string>> = {
  'schliesst-aus': 'schließt aus',
  warnt: 'warnt',
  ordnet: 'ordnet',
  'weist-hin': 'weist hin'
};

/** Basis of a rule message in plain German (evidence is "belegt", a setting by the editors is "Setzung"); the keys are every basis. */
export const GRUNDLAGE_KLARTEXT: Readonly<Record<Grundlage, string>> = {
  E: 'belegt',
  S: 'gefolgert',
  A: 'Setzung',
  Recht: 'Recht',
  U: 'ungeklärt',
  formal: 'formal'
};

/** Readable name of a rule: from data/regeln.json, else the suitability names, else the id. */
export function regelName(id: string, regeln: readonly Passungsregel[] = []): string {
  return regeln.find((r) => r.id === id)?.name || EIGNUNG_REGEL_NAMEN[id] || id;
}

/** Basis in plain German with its source in brackets: "belegt (Sinha & Kapur 2021)". */
export function grundlageKlartext(m: Pick<Regelmeldung, 'grundlage' | 'quelle'>): string {
  const g = GRUNDLAGE_KLARTEXT[m.grundlage] || m.grundlage;
  return m.quelle ? `${g} (${m.quelle})` : g;
}

/** Rule messages of a plan in the readable form the draft lists (rule name, effect and basis in plain German). */
export function regelmeldungenFuerEntwurf(
  meldungen: ReadonlyArray<Pick<Regelmeldung, 'regel' | 'wirkung' | 'grundlage' | 'text'> & { quelle?: string }>,
  regeln: readonly Passungsregel[] = []
): EntwurfRegelmeldung[] {
  return meldungen.map((m) => ({
    text: m.text,
    ...(m.quelle ? { quelle: m.quelle } : {}),
    regel: regelName(m.regel, regeln),
    wirkung: WIRKUNG_KLARTEXT[m.wirkung] || m.wirkung,
    grundlage: GRUNDLAGE_KLARTEXT[m.grundlage] || m.grundlage
  }));
}

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

/** Request fields the fit rules read (prior knowledge, stage, complexity, language level, subject area). */
export const REGEL_LAGE_FELDER = ['vorwissen', 'bildungsstufe', 'komplexitaet', 'sprachniveau', 'fachbereich'] as const;

/**
 * Situation the fit rules read, from a request or the criteria of a match answer: prior knowledge, stage, complexity,
 * language level and subject area. Empty values are left out (a field that is not given never fires a rule).
 */
export function regelLageAus(a: Record<string, unknown> | null | undefined): RegelSituation {
  const lage: RegelSituation = {};
  for (const feld of REGEL_LAGE_FELDER) {
    const v = a?.[feld];
    if (v != null && v !== '') lage[feld] = String(v);
  }
  return lage;
}

/**
 * Rule messages after a change of the flow by hand. The warnings the rule machine gives per method and situation
 * (declarative rules, suitability entries, evidenz-geltung) are computed again for the methods now in the flow, in
 * the situation `lage`; every other message of the answer (situation-level notes, the safety note, a named wish, the
 * form of proof, dates for accompanying goals) stays as the answer gave it. The new warnings stand where the first
 * old one stood, or at the end.
 */
export function passungNeuPruefen(
  meldungen: Regelmeldung[],
  methoden: Baustein[],
  lage: RegelSituation,
  regeln: Passungsregel[],
  label?: (schema: string, code: string) => string
): Regelmeldung[] {
  const maschine = erstelleRegeln(regeln, label);
  const proMethode = (m: Regelmeldung) =>
    Boolean(m.baustein) &&
    !m.bausteine?.length &&
    (maschine.regel(m.regel)?.art === 'deklarativ' || m.regel.startsWith('eignung-') || m.regel === 'evidenz-geltung');
  const gesehen = new Set<string>();
  const neu: Regelmeldung[] = [];
  for (const b of methoden) {
    if (gesehen.has(b.kennung)) continue;
    gesehen.add(b.kennung);
    neu.push(...maschine.warnungen(b, lage));
  }
  const aus: Regelmeldung[] = [];
  let eingefuegt = false;
  for (const m of meldungen) {
    if (proMethode(m)) {
      if (!eingefuegt) aus.push(...neu);
      eingefuegt = true;
      continue;
    }
    aus.push(m);
  }
  if (!eingefuegt) aus.push(...neu);
  return aus;
}

/**
 * Method ids an arrangement uses, in the order of the flow and each once: Einsatz and Wiederkehr nodes, slot fillings
 * (after their method), every option of an Alternative and the accompanying strands of a Parallel. A Verweis to
 * another arrangement is not followed.
 */
export function bausteineImArrangement(arr: Pick<Arrangement, 'ablauf'>): string[] {
  const aus: string[] = [];
  const liste = (x: unknown): ArrangementNode[] => (Array.isArray(x) ? (x as ArrangementNode[]) : []);
  const besuche = (n: ArrangementNode | undefined, tiefe: number) => {
    if (!n || typeof n !== 'object' || tiefe > 32) return;
    if ((n.typ === 'Einsatz' || n.typ === 'Wiederkehr') && typeof n.baustein === 'string') {
      if (!aus.includes(n.baustein)) aus.push(n.baustein);
      if (n.typ === 'Einsatz') for (const bel of liste(n.belegung)) besuche((bel as { inhalt?: ArrangementNode })?.inhalt, tiefe + 1);
      return;
    }
    if (n.typ === 'Sequenz') liste(n.teile).forEach((x) => besuche(x, tiefe + 1));
    else if (n.typ === 'Parallel') [n.haupt, ...liste(n.begleitend)].forEach((x) => besuche(x, tiefe + 1));
    else if (n.typ === 'Alternative') liste(n.optionen).forEach((x) => besuche(x, tiefe + 1));
  };
  besuche(arr?.ablauf, 0);
  return aus;
}

/**
 * Fit rules for a given flow in a situation (REST /validate, MCP validate_arrangement with situation): the warnings
 * passungNeuPruefen computes for the methods of the arrangement (bausteineImArrangement; former ids are followed,
 * unknown ids skipped) in the situation regelLageAus reads from the request. Same shape and wording as the
 * regelmeldungen of a match answer.
 */
export function passungImArrangement(
  arr: Pick<Arrangement, 'ablauf'>,
  situation: Record<string, unknown> | null | undefined,
  data: Pick<FmtData, 'bausteine' | 'regeln' | 'schemes' | 'weiterleitungen'>
): Regelmeldung[] {
  const index = new KennungIndex(data.bausteine.map((b) => [b.kennung, b] as const), data.weiterleitungen);
  const methoden = bausteineImArrangement(arr)
    .map((k) => index.get(k))
    .filter((b): b is Baustein => Boolean(b));
  const label = (schema: string, code: string) => {
    const s = data.schemes.find((x) => x.id === schema);
    const w = (s?.werte || (s?.gruppen || []).flatMap((g) => g.werte)).find((x) => x.id === code);
    return w ? w.label : code;
  };
  return passungNeuPruefen([], methoden, regelLageAus(situation), data.regeln || [], label);
}
