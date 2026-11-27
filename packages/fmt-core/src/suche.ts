import { istMethode } from './eintragsart.js';
import type {
  Arrangement,
  Baustein,
  EvidenceGrade,
  FmtData,
  ReplacementCandidate,
  ReplacementCheck,
  MatchRequest,
  SearchCriteria
} from './types.js';
import { raumFehlt, schriftFehlt } from './bedarf.js';
import { ausschlussInSituation, kettenSchritt } from './alternativen.js';
import { baueSituation } from './situation.js';
import { erstelleRegeln } from './regeln.js';
import { einordnungInKetten, type KettenEinordnung } from './zielart.js';
import type { FmtValidator } from './validate.js';

const GRADE_ORDER: EvidenceGrade[] = ['A', 'B', 'C'];
const list = (x: unknown): string[] =>
  x == null || x === '' ? [] : Array.isArray(x) ? x.map(String) : [String(x)];
const fold = (s: string) =>
  String(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');

const AI_ROLES = new Set([
  'tutor',
  'dialogpartner',
  'simulationsrolle',
  'belehrbarer-agent',
  'antwortgeber'
]);
const usesAi = (b: Baustein) => Boolean(b.ki) || (b.rolle || []).some((r) => AI_ROLES.has(r));

export function locate(arr: Arrangement, pfad: string): { holder: Record<string, unknown>; key: string | number } {
  const segs = pfad.split('/').filter(Boolean);
  let holder: unknown = arr;
  let key: string | number = segs[0];
  for (let i = 1; i < segs.length; i++) {
    const cur = (holder as Record<string | number, unknown>)[key] as Record<string, unknown> | undefined;
    const seg = segs[i];
    if (!cur) throw new Error('Pfad nicht gefunden: ' + pfad);
    if (seg === 'belegung') {
      const slotKey = segs[++i];
      const bel = (cur.belegung as Array<{ slotKennung: string; inhalt: unknown }> | undefined) || [];
      holder = bel.find((x) => x.slotKennung === slotKey);
      key = 'inhalt';
    } else if (Array.isArray(cur[seg])) {
      holder = cur[seg];
      key = Number(segs[++i]);
    } else {
      holder = cur;
      key = seg;
    }
    if (!holder) throw new Error('Pfad nicht gefunden: ' + pfad);
  }
  return { holder: holder as Record<string, unknown>, key };
}

export interface FmtSearch {
  suche(k?: SearchCriteria): Baustein[];
  bestGrade(b: Baustein): EvidenceGrade | null;
  /**
   * Methods that may replace the one at `pfad`: the arrangement stays valid, the method carries the knowledge type of
   * the chain step, and with `situation` (raum, raumBietet, ohneSchrift, termine …) its needs are covered there.
   */
  ersatz(arrangement: Arrangement, pfad: string, registry?: Map<string, Arrangement>, situation?: MatchRequest): ReplacementCandidate[];
  /** As ersatz, plus the methods left out by ausschlussInSituation with their reason (helps are never listed). */
  ersatzPruefung(arrangement: Arrangement, pfad: string, registry?: Map<string, Arrangement>, situation?: MatchRequest): ReplacementCheck;
}

/**
 * Rules that exclude a method from the search for a stage or prior-knowledge level: the remaining lists (eignung-stufe,
 * eignung-vorwissen) and the evidence-based (E) rules that replaced former list entries in Tor D2 ("… deckt" in parts 2
 * and 3 of durchsicht-2-eignung-geprueft.csv). evidenz-geltung also replaced entries but is left out: its basis is A
 * ("the evidence comes only from secondary school or later") – missing evidence, not shown unsuitability – so it warns
 * in the planner but hides no method (cautious reading, design §12). Other rules (e.g. viel-anleitung-hohes-vorwissen)
 * only warn as well.
 */
export const SUCHE_AUSSCHLUSS_REGELN: Record<'bildungsstufe' | 'vorwissen', readonly string[]> = {
  bildungsstufe: ['eignung-stufe', 'problemloesen-vor-instruktion-primar'],
  vorwissen: ['eignung-vorwissen', 'wenig-anleitung-geringes-vorwissen']
};

export function createSearch(data: FmtData, validator?: FmtValidator): FmtSearch {
  const facetFields = data.facetten.map((f) => f.feld).filter((f) => f !== 'steuerung');
  const techScheme = data.schemes.find((s) => s.id === 'technikbedarf')!;
  const techRank = new Map((techScheme.werte || []).map((w) => [w.id, w.rang ?? 0]));
  const fnScheme = data.schemes.find((s) => s.id === 'lernfunktion')!;
  const functionWords = new Map((fnScheme.werte || []).map((w) => [w.id, [w.label, ...(w.alt || [])].join(' ')]));
  const stateScheme = data.schemes.find((s) => s.id === 'lernzustand')!;
  const implies = new Map((stateScheme.werte || []).map((w) => [w.id, w.impliziert || []]));
  const regeln = erstelleRegeln(data.regeln || []);
  /** Chain steps each method can fill (helps fill none), for the filters zieltyp and kettenschritt. */
  const einordnung = new Map<string, KettenEinordnung[]>(data.bausteine.map((b) => [b.kennung, einordnungInKetten(b, data.ketten || [])]));
  const closure = (states: string[]): Set<string> => {
    const set = new Set<string>();
    const stack = [...states];
    while (stack.length) {
      const s = stack.pop()!;
      if (set.has(s)) continue;
      set.add(s);
      (implies.get(s) || []).forEach((x) => stack.push(x));
    }
    return set;
  };

  const bestGrade = (b: Baustein): EvidenceGrade | null =>
    GRADE_ORDER.find((g) => (b.evidenz || []).some((e) => e.grad === g)) || null;

  const haystackById = new Map<string, string>(
    data.bausteine.map((b) => [
      b.kennung,
      fold(
        [
          b.name,
          b.kennung,
          b.kurzbeschreibung || '',
          ...(b.alternativname || []),
          ...(b.variante || []),
          ...b.lernfunktion.map((f) => functionWords.get(f) || '')
        ].join(' ')
      )
    ])
  );

  /** The codes of ohneSchrift (lesen, schreiben) are accepted for the scheme schriftbedarf (liest, schreibt). */
  const SCHRIFT_ALIAS: Record<string, string> = { lesen: 'liest', schreiben: 'schreibt' };

  function suche(k: SearchCriteria = {}): Baustein[] {
    const words = k.text ? fold(k.text).split(/\s+/).filter(Boolean) : [];
    const have = k.vorhanden !== undefined ? closure(list(k.vorhanden)) : null;
    const want = list(k.liefert);
    const minIdx = k.minEvidenz ? GRADE_ORDER.indexOf(k.minEvidenz) : -1;
    const wantedAnsatz = list(k.ansatz);
    const wantedStatus = list(k.status);

    const given = (v: unknown) => v != null && v !== '';
    // Same reading as the request field ohneSchrift: a flag means both, otherwise the named abilities.
    const ohneSchriftRoh = k.ohneSchrift === false ? [] : k.ohneSchrift === true ? ['true'] : list(k.ohneSchrift);
    const ohneSchrift = ohneSchriftRoh.some((x) => x === 'true' || x === '1') ? ['lesen', 'schreiben'] : ohneSchriftRoh;
    const termine = given(k.termine) && Number.isFinite(Number(k.termine)) ? Number(k.termine) : undefined;
    const zieltyp = given(k.zieltyp) ? String(k.zieltyp) : '';
    const kettenschritt = zieltyp && given(k.kettenschritt) ? String(k.kettenschritt) : '';
    const hits = data.bausteine.filter((b) => {
      if (words.length) {
        const hay = haystackById.get(b.kennung) || '';
        if (!words.every((w) => hay.includes(w))) return false;
      }
      for (const f of facetFields) {
        const wanted = list(k[f]);
        if (wanted.length && !wanted.some((v) => ((b[f] as string[] | undefined) || []).includes(v))) return false;
      }
      // Bedarf of the method: any of the named values is needed; ohneRaumbedarf drops methods needing one of them.
      for (const f of ['raumbedarf', 'schriftbedarf'] as const) {
        const wanted = f === 'schriftbedarf' ? list(k[f]).map((v) => SCHRIFT_ALIAS[v] ?? v) : list(k[f]);
        if (wanted.length && !wanted.some((v) => (b[f] || []).includes(v))) return false;
      }
      if (ohneSchrift.length && schriftFehlt(b, ohneSchrift).length) return false;
      if (termine != null && b.termineMin != null && b.termineMin > termine) return false;
      const without = list(k.ohneRaumbedarf);
      if (without.length && (b.raumbedarf || []).some((v) => without.includes(v))) return false;
      if (wantedAnsatz.length && !wantedAnsatz.some((v) => (b.ansatz || []).includes(v))) return false;
      if (wantedStatus.length && !wantedStatus.includes(b.status)) return false;
      if (given(k.eintragsart) && (b.eintragsart || 'methode') !== k.eintragsart) return false;
      // Chain (zieltyp) and optionally its step: the method can fill a step of the chain (einordnungInKetten).
      if (zieltyp && !(einordnung.get(b.kennung) || []).some((e) => e.kette === zieltyp && (!kettenschritt || e.schritt === kettenschritt))) return false;
      const wantedArea = list(k.fachbereich);
      if (wantedArea.length && !wantedArea.some((v) => (b.fachbereich || []).includes(v))) return false;
      // Fits a subject area: at home there or without subject binding, and not marked as unsuitable for it.
      const fitArea = given(k.fuerFachbereich) ? String(k.fuerFachbereich) : '';
      if (fitArea && fitArea !== 'uebergreifend') {
        const areas = b.fachbereich || [];
        if (!(areas.includes(fitArea) || areas.includes('uebergreifend') || !areas.length)) return false;
        if ((b.fachbereichUngeeignet || []).includes(fitArea)) return false;
      }

      const ranges = list(k.reichweite);
      if (ranges.length && !ranges.includes(b.reichweite)) return false;
      if (k.maxDauer != null && k.maxDauer !== '' && b.dauerMin > Number(k.maxDauer)) return false;
      if (have && !(b.vorbedingung || []).every((z) => have.has(z))) return false;
      if (want.length) {
        const gives = closure(b.nachbedingung || []);
        if (!want.every((z) => gives.has(z))) return false;
      }
      if (given(k.gruppe) && (Number(k.gruppe) < b.gruppeMin || Number(k.gruppe) > b.gruppeMax)) return false;
      if (given(k.maxVorbereitung) && b.vorbereitungMin > Number(k.maxVorbereitung)) return false;
      if (given(k.maxTechnik) && (techRank.get(b.technik) ?? 0) > (techRank.get(String(k.maxTechnik)) ?? 0)) return false;
      if (k.ohneInternet && b.internet) return false;
      if (given(k.raum) && raumFehlt(b, baueSituation({ raum: String(k.raum) }, data)).length) return false;
      if (given(k.kategorie) && !(b.kategorie || []).includes(String(k.kategorie))) return false;
      if (k.vorwissen && (b.ungeeignetBeiVorwissen || []).includes(k.vorwissen)) return false;
      if (k.bildungsstufe && (b.ungeeignetBeiStufe || []).includes(k.bildungsstufe)) return false;
      for (const feld of ['bildungsstufe', 'vorwissen'] as const) {
        if (!k[feld]) continue;
        const ids = SUCHE_AUSSCHLUSS_REGELN[feld];
        if (regeln.warnungen(b, { [feld]: k[feld] }).some((m) => m.wirkung === 'warnt' && ids.includes(m.regel))) return false;
      }
      if (minIdx >= 0) {
        const g = bestGrade(b);
        if (!g || GRADE_ORDER.indexOf(g) > minIdx) return false;
      }
      if (k.ohneKI && usesAi(b)) return false;
      return true;
    });

    const rank = (b: Baustein) => {
      const g = bestGrade(b);
      return g ? GRADE_ORDER.indexOf(g) : GRADE_ORDER.length;
    };
    // With a search text, hits in the name come first: whole words, then word beginnings and endings
    // (German compounds such as Rollen-spiel), then synonyms, then chance substrings ("Lösungsbei-spiel-e").
    const query = words.join(' ');
    const tokens = (x: string) => fold(x).split(/[^a-z0-9]+/).filter(Boolean);
    const textRank = (b: Baustein): number => {
      if (!words.length) return 0;
      const name = fold(b.name);
      const nameWords = tokens(b.name);
      const alt = [...(b.alternativname || []), ...(b.variante || [])];
      if (name === query || tokens(b.kennung).join(' ') === query) return 0;
      if (words.every((w) => nameWords.includes(w))) return 1;
      if (alt.some((x) => fold(x) === query)) return 2;
      if (words.every((w) => nameWords.some((n) => n.startsWith(w) || n.endsWith(w)))) return 3;
      if (alt.some((x) => words.every((w) => tokens(x).includes(w)))) return 4;
      if (words.every((w) => name.includes(w))) return 5;
      return 6;
    };
    const tr = new Map(hits.map((b) => [b.kennung, textRank(b)]));
    return hits.sort(
      (a, b) => tr.get(a.kennung)! - tr.get(b.kennung)! || rank(a) - rank(b) || a.name.localeCompare(b.name, 'de')
    );
  }

  function ersatzPruefung(
    arrangement: Arrangement,
    pfad: string,
    registry?: Map<string, Arrangement>,
    situation?: MatchRequest
  ): ReplacementCheck {
    if (!validator) throw new Error('ersatz() braucht einen Validator: createSearch(data, validator)');
    const original = locate(arrangement, pfad);
    const node = original.holder[original.key] as {
      typ?: string;
      baustein?: string;
      dauerMin?: number;
      kettenschritt?: string;
      anzahl?: number;
      abstand?: string;
      ausserhalbBudget?: boolean;
    };
    if (!node || !node.baustein) throw new Error('Kein Einsatz an ' + pfad);

    const out: ReplacementCandidate[] = [];
    const ausgeschlossen: ReplacementCheck['ausgeschlossen'] = [];
    // A help is never a phase; the chain step binds its knowledge type; the situation's needs must be covered.
    const schritt = kettenSchritt(data, arrangement.zieltyp, node.kettenschritt);
    const lage = situation ? baueSituation(situation, data) : undefined;
    data.bausteine
      .filter((b) => b.kennung !== node.baustein && istMethode(b))
      .filter((b) => {
        const aus = ausschlussInSituation(b, { anfrage: situation, situation: lage, schritt, data });
        if (aus) ausgeschlossen.push({ baustein: b.kennung, merkmal: aus.merkmal, grund: `${b.name} ${aus.grund}` });
        return !aus;
      })
      .forEach((b) => {
        const copy = JSON.parse(JSON.stringify(arrangement)) as Arrangement;
        const at = locate(copy, pfad);
        const dauerMin = Math.max(b.dauerMin, Math.min(b.dauerMax, node.dauerMin != null ? node.dauerMin : b.dauerMin));
        at.holder[at.key] = Object.assign(
          { typ: node.typ === 'Wiederkehr' ? 'Wiederkehr' : 'Einsatz', baustein: b.kennung, dauerMin },
          node.kettenschritt ? { kettenschritt: node.kettenschritt } : {},
          node.typ === 'Wiederkehr'
            ? { anzahl: node.anzahl, abstand: node.abstand, ...(node.ausserhalbBudget ? { ausserhalbBudget: true } : {}) }
            : {}
        );
        const r = validator.validate(copy, registry);
        if (r.gueltig) {
          out.push({
            baustein: b.kennung,
            name: b.name,
            dauerMin,
            warnungen: r.meldungen.map((m) => `${m.regel}: ${m.meldung}`),
            raumbedarf: b.raumbedarf || [],
            schriftbedarf: b.schriftbedarf || [],
            ...(b.termineMin != null ? { termineMin: b.termineMin } : {})
          });
        }
      });

    return {
      kandidaten: out.sort((x, y) => x.warnungen.length - y.warnungen.length || x.name.localeCompare(y.name, 'de')),
      ausgeschlossen
    };
  }

  const ersatz = (arrangement: Arrangement, pfad: string, registry?: Map<string, Arrangement>, situation?: MatchRequest): ReplacementCandidate[] =>
    ersatzPruefung(arrangement, pfad, registry, situation).kandidaten;

  return { suche, bestGrade, ersatz, ersatzPruefung };
}
