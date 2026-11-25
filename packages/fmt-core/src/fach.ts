/**
 * Subject recognition on top of the OEH/WLO vocabularies (data/crosswalk/oeh-faecher.json).
 * A subject named in a request is mapped to one of the FMT subject areas and to its OEH URI.
 * Methods never carry single subjects: with 70 school and 344 university subjects per-method
 * tags would be sparse and would distort the ranking towards the few subjects that got tagged.
 */
export interface OehSubject {
  id: string;
  uri: string;
  label: string;
  alt?: string[];
  fachbereich: string;
  /** Recognition words that replace label and alt (for everyday words and abbreviations). */
  begriffe?: string[];
  /** false: too generic to be read from a text ("Allgemein", "Sonstiges"). */
  erkennung?: boolean;
  /** University subjects only: 1 subject group, 2 study area, 3 single subject. */
  ebene?: number;
  oberbegriff?: string;
}

export interface OehSubjectCrosswalk {
  schulfaecher: OehSubject[];
  hochschulfaecher: OehSubject[];
}

export interface DetectedSubject {
  quelle: 'schulfach' | 'hochschulfach';
  id: string;
  uri: string;
  label: string;
  fachbereich: string;
  beleg: string;
}

export interface FmtSubjectDetector {
  /** `stufe`: FMT bildungsstufe if known; university subjects are only read for `hochschule`. */
  erkenne(text: string, stufe?: string): DetectedSubject | null;
  /** Looks a subject up by its name, e.g. the content of a "Fach" form field. */
  schulfachUri(name: string): string | null;
}

const fold = (s: string) =>
  s
    .toLowerCase()
    .replace(/ä/g, 'a')
    .replace(/ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Labels such as "Maschinenbau/-wesen" or "Anglistik/Englisch" yield one search word per usable part. */
function termsOf(s: OehSubject, university: boolean): string[] {
  const raw = s.begriffe ?? [s.label, ...(s.alt || [])];
  const parts = university
    ? raw.flatMap((r) =>
        /\b(?:allgemein|interdisziplin|lernbereich|sonstige|orientierungsstudium)/i.test(r)
          ? []
          : r
              .replace(/\([^)]*\)/g, ' ')
              .split('/')
              .filter((p) => !p.trim().startsWith('-') && !p.includes(','))
      )
    : raw;
  return [...new Set(parts.map((p) => fold(p).replace(/\s+/g, ' ').trim()).filter((p) => p.length >= 3))];
}

// A word that is a subject in one place and plain language in another.
const NOT_BEFORE: Record<string, RegExp> = {
  geschichte: /^\s+(?:schreiben|erzahlen|lesen|vorlesen|horen)\b/,
  // "Deutsch als Zweitsprache" is its own subject (or a learner trait), not the subject Deutsch
  deutsch: /^\s+als\s+(?:zweit|fremd)/
};
// "5 Kinder mit Deutsch als Zweitsprache" describes learners, not the subject of the lesson.
const LEARNER_CONTEXT = /(?:\bmit|\bhaben|\bhat|\d)\s+$/;

const FRAME_AFTER = /^\s*,?\s*(?:in\s+(?:der\s+)?)?(?:klasse|klassenstufe|kurs|jahrgang|jg\b|stufe|oberstufe|grundschule|sek\b|sekundarstufe|vorlesung|seminar|\d{1,2}\.?\s*klasse|\d{1,2}\b)/;

interface Entry {
  re: RegExp;
  term: string;
  subject: OehSubject;
  quelle: DetectedSubject['quelle'];
}

export function createSubjectDetector(crosswalk?: OehSubjectCrosswalk): FmtSubjectDetector {
  const build = (list: OehSubject[], quelle: DetectedSubject['quelle']): Entry[] =>
    list
      .filter((s) => s.erkennung !== false && (quelle === 'schulfach' || s.ebene !== 1))
      .flatMap((s) =>
        termsOf(s, quelle === 'hochschulfach').map((term) => ({
          // Single words also match as "Biologieunterricht" or "Biologiestunde"; "deutsch-französisch" is no subject.
          re: new RegExp(`\\b${esc(term)}${term.includes(' ') ? '' : '(?:s?unterricht|s?stunde|lehre)?'}\\b(?!-)`, 'g'),
          term,
          subject: s,
          quelle
        }))
      );
  const school = build(crosswalk?.schulfaecher || [], 'schulfach');
  const university = build(crosswalk?.hochschulfaecher || [], 'hochschulfach');

  type Hit = { entry: Entry; index: number; beleg: string; framed: boolean };
  const best = (t: string, entries: Entry[]): Hit | null => {
    let hit: Hit | null = null;
    for (const entry of entries) {
      entry.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = entry.re.exec(t))) {
        const after = t.slice(m.index + m[0].length);
        const before = t.slice(0, m.index);
        if (NOT_BEFORE[entry.term]?.test(after)) continue;
        if (entry.term.includes('zweitsprache') || entry.term.includes('fremdsprache')) {
          if (LEARNER_CONTEXT.test(before)) continue;
        }
        // A subject word next to frame information ("Geschichte Klasse 7", "Musikunterricht", "Physik: …") names
        // the subject; elsewhere it may only be part of the topic ("Kunst der Renaissance"). Among equals the
        // earliest mention wins, the longer word on a tie ("Wirtschaftsinformatik" over "Wirtschaft").
        const framed = m[0].length > entry.term.length || FRAME_AFTER.test(after) || (m.index === 0 && /^\s*[:,]/.test(after));
        const cand = { entry, index: m.index, beleg: m[0], framed };
        if (
          !hit ||
          (cand.framed && !hit.framed) ||
          (cand.framed === hit.framed &&
            (cand.index < hit.index || (cand.index === hit.index && cand.beleg.length > hit.beleg.length)))
        ) {
          hit = cand;
        }
        if (framed) break;
      }
    }
    return hit;
  };

  const result = (h: { entry: Entry; beleg: string }): DetectedSubject => ({
    quelle: h.entry.quelle,
    id: h.entry.subject.id,
    uri: h.entry.subject.uri,
    label: h.entry.subject.label,
    fachbereich: h.entry.subject.fachbereich,
    beleg: h.beleg
  });

  return {
    erkenne(text, stufe) {
      const t = fold(text || '');
      if (!t.trim()) return null;
      if (stufe === 'hochschule') {
        const u = best(t, university);
        if (u) return result(u);
      }
      const s = best(t, school);
      return s ? result(s) : null;
    },
    schulfachUri(name) {
      const s = best(fold(name || ''), school);
      return s ? s.entry.subject.uri : null;
    }
  };
}
