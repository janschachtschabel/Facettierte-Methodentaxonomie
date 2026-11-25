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

/**
 * Search words of a subject. University labels are catalogue headings ("Maschinenbau/-wesen",
 * "Kunstgeschichte, Kunstwissenschaft", "Medizin (Allgemein-Medizin)"), so they are split into their
 * usable parts; fragments ("-wesen", "Transport-") and collective headings are left out.
 */
export function termsOf(s: OehSubject, university: boolean): string[] {
  const raw = s.begriffe ?? [s.label, ...(s.alt || [])];
  const parts =
    university && !s.begriffe
      ? raw.flatMap((r) => {
          const plain = r.replace(/\([^)]*\)/g, ' ').replace(/^\s*Studienbereich\s+/i, '');
          if (/\b(?:allgemein|interdisziplinäre|lernbereich|sonstige|orientierungsstudium)\b/i.test(plain)) return [];
          return plain
            .split(/[/,]/)
            .map((p) => p.trim())
            .filter((p) => p && !p.startsWith('-') && !p.endsWith('-') && !p.includes('.') && !/\s(?:oder|und)\s*$/.test(p));
        })
      : raw;
  return [...new Set(parts.map((p) => fold(p).replace(/\s+/g, ' ').trim()).filter((p) => p.length >= 3))];
}

// A word that is a subject in one place and plain language in another.
const NOT_BEFORE: Record<string, RegExp> = {
  // "Deutsch als Zweitsprache" is its own subject (or a learner trait), not the subject Deutsch
  deutsch: /^\s+als\s+(?:zweit|fremd)/
};
// "5 Kinder mit Deutsch als Zweitsprache" and "viele DaZ-Kinder" describe learners, not the subject of the lesson.
const LEARNER_TERM = /zweitsprache|fremdsprache|^da[zf]$/;
const LEARNER_BEFORE = /(?:\bmit|\bhaben|\bhat|\bund|\boder|\bviele|\beinige|\bmehrere|\bwenige|\d)\s+$/;
const LEARNER_AFTER = /^-?\s?(?:kind|schuler|lernend|sus\b|anteil|hintergrund)|^\s+(?:und|oder)\s/;

/**
 * A subject word only names the subject of the lesson when the text frames it as such. Everywhere else it
 * may be the topic or plain language ("Politik der Weimarer Republik", "die Chemie stimmt nicht").
 */
const SUFFIX = '(?:s?unterricht|s?stunde|-(?:unterricht|stunde|ag|kurs|lk|gk|leistungskurs|grundkurs|forderkurs|forderunterricht|vorlesung|seminar))';
const BOUNDARY_AFTER = /^\s*(?:[,;:.]|$)/;
const BOUNDARY_BEFORE = /(?:^|[,;:.])\s*$/;
const NOT_A_GRADE = '(?!\\s*(?:min\\b|minuten|std\\b|stunden|kinder|schuler|lernende|studierende|teilnehm|x\\b|×|%|[.,]\\d))';
const FRAME_AFTER = new RegExp(
  '^\\s*,?\\s*(?:(?:in|fur)\\s+(?:der\\s+|die\\s+)?)?(?:' +
    'klasse|klassenstufe|kurs\\b|jahrgang|jg\\b|stufe|oberstufe|unterstufe|mittelstufe|grundschule|sek\\b|sekundarstufe|berufsschule|' +
    'vorlesung|seminar|leistungskurs|grundkurs|lk\\b|gk\\b|bachelor|master|\\d\\.?\\s*semester|an\\s+der\\s+(?:uni|hochschule|fh)|' +
    '[abc][12]\\b|\\d{1,2}\\.\\s*klasse|\\d{1,2}[a-e]?\\b' + NOT_A_GRADE +
    ')'
);
const COURSE_BEFORE = /\b(?:seminar|vorlesung|ubung|tutorium|kurs|fach|studiengang|lehrveranstaltung|modul|leistungskurs|grundkurs|lk|gk|vhs|unterricht\s+in|ausbildung(?:\s+(?:zur|zum|in))?)\s+$/;

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
          // "deutsch-französisch" is no subject; "Physik-Unterricht" and "Informatik-AG" are.
          re: new RegExp(`(?<!-)\\b${esc(term)}${term.includes(' ') ? '' : `${SUFFIX}?`}\\b(?!-)`, 'g'),
          term,
          subject: s,
          quelle
        }))
      );
  const school = build(crosswalk?.schulfaecher || [], 'schulfach');
  const university = build(crosswalk?.hochschulfaecher || [], 'hochschulfach');

  type Hit = { entry: Entry; index: number; beleg: string };
  const best = (t: string, entries: Entry[]): Hit | null => {
    let hit: Hit | null = null;
    for (const entry of entries) {
      entry.re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = entry.re.exec(t))) {
        const after = t.slice(m.index + m[0].length);
        const before = t.slice(0, m.index);
        if (NOT_BEFORE[entry.term]?.test(after)) continue;
        if (LEARNER_TERM.test(entry.term) && (LEARNER_BEFORE.test(before) || LEARNER_AFTER.test(after))) continue;
        const framed =
          m[0].length > entry.term.length || // Biologieunterricht, Informatik-AG
          FRAME_AFTER.test(after) || // Geschichte Klasse 7, Spanisch A1
          (BOUNDARY_BEFORE.test(before) && BOUNDARY_AFTER.test(after)) || // "…, Mathematik, …", "Physik: Dichte"
          (COURSE_BEFORE.test(before) && BOUNDARY_AFTER.test(after)); // "Seminar Soziale Arbeit, …"
        if (!framed) continue;
        // Earliest framed mention wins, the longer word on a tie ("Wirtschaftsinformatik" over "Wirtschaft").
        if (!hit || m.index < hit.index || (m.index === hit.index && m[0].length > hit.beleg.length)) {
          hit = { entry, index: m.index, beleg: m[0] };
        }
        break;
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
