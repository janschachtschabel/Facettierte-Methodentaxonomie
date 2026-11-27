import type { Funktionskette, Kernfeld, Planungsprofil, PlanungsprofileRegelsatz } from './types.js';

/** Guardrails for a language model that writes out a draft (verbatim, Paket D). */
export const ENTWURF_LEITPLANKEN: readonly string[] = [
  'Methoden, Reihenfolge und Kernkomponenten sind vorgegeben und werden nicht geändert.',
  'Aussagen zur Wirksamkeit stammen nur aus dem Katalog, mit Grad, Geltung und Bezug.',
  'Kennzeichne, was übernommen und was erzeugt ist.',
  'Beschreibe Gruppen, keine einzelnen Lernenden.'
] as const;

/** Text used wherever the draft would name a Bildungsstufe the request does not give. */
export const OHNE_BILDUNGSSTUFE = 'Bildungsstufe nicht angegeben';

export interface ProfilBegriffe {
  dokument: string;
  einheit: string;
  derEinheit: string;
  groessereEinheit: string;
  inGroessereEinheit: string;
  lehrende: string;
  lernende: string;
  taetigkeitLehrende: string;
  taetigkeitLernende: string;
  /** "für die Kursleitung": stored form, for headings like "Hinweise für …". */
  fuerLehrende: string;
}

/** Terms of the profile in the forms headings and column names need ("Tätigkeit der Kursleitung"). */
export function profilBegriffe(p: Planungsprofil): ProfilBegriffe {
  const f = p.formen;
  return {
    dokument: p.dokument,
    einheit: f.einheit,
    derEinheit: f.derEinheit,
    groessereEinheit: f.groessereEinheit,
    inGroessereEinheit: f.inGroessereEinheit,
    lehrende: p.lehrende,
    lernende: p.lernende,
    taetigkeitLehrende: `Tätigkeit ${f.derLehrenden}`,
    taetigkeitLernende: `Tätigkeit ${f.derLernenden}`,
    fuerLehrende: f.fuerLehrende
  };
}

export interface EntwurfPhase {
  zeitMin: number;
  phase: string;
  methode: string;
  sozialform?: string;
  medien?: string;
  /** What the teaching person does / what the learners do in this phase. */
  lehrende?: string;
  lernende?: string;
  /** Role of the chain step ('sicherung' is the fallback for the check step). */
  schrittRolle?: string;
  /** The phase fills the chain's check step (see istPruefschritt); a diagnosing method elsewhere does not count. */
  pruefschritt?: boolean;
  /** Distributed repetition (Wiederkehr): listed in the plan, never the check step or the closing step. */
  wiederkehr?: boolean;
  /** Phase of the accompanying strand (Begleitstrang): listed in the plan, read as an accompanying goal. */
  begleitend?: boolean;
  /** Adaptations per subgroup already decided in the plan (help, own method). */
  anpassungen?: Array<{ gruppe: string; text: string }>;
}

export interface EntwurfEingabe {
  profil: Planungsprofil;
  /** The profile was assumed (no Bildungsstufe, no stated profile). */
  profilAngenommen?: boolean;
  titel: string;
  fach?: string;
  thema?: string;
  dauerMin: number;
  /** Room as label. */
  raum?: string;
  /** Bildungsstufe as label. */
  bildungsstufe?: string;
  anzahl?: number;
  vorwissen?: string;
  sprachniveau?: string;
  teilgruppen?: Array<{ name: string; anzahl?: number; beschreibung?: string }>;
  /** Starting situation in free text (typical hurdles). */
  ausgangslage?: string;
  hauptziel?: string;
  begleitziele?: string[];
  /** Accompanying strand the plan proposes per accompanying goal (labels), not part of the lesson plan (D3). */
  begleitstrang?: Array<{ begleitziel: string; methode: string; dauerMin: number }>;
  /** Larger unit the lesson belongs to (free text). */
  einheit?: string;
  phasen: EntwurfPhase[];
  /** Form of proof (label). */
  nachweis?: string;
  hinweise?: string[];
}

export interface EntwurfKernfeld {
  id: Kernfeld['id'];
  /** Name of the core field in data/planungsprofile.json. */
  name: string;
  /** Heading with the profile's terms. */
  titel: string;
  /** Content as Markdown. */
  inhalt: string;
}

export interface Entwurf {
  planungsprofil: {
    id: Planungsprofil['id'];
    angenommen: boolean;
    dokument: string;
    einheit: string;
    groessereEinheit: string;
    lehrende: string;
    lernende: string;
  };
  /** Column names of the lesson plan table. */
  spalten: { zeit: string; phase: string; lehrende: string; lernende: string; methode: string; medien: string };
  kernfelder: EntwurfKernfeld[];
  /** Modules of the profile, empty to fill in (no generated text). */
  module: Array<{ id: string; name: string; inhalt: string }>;
}

/** Id of the check step the matcher inserts when a check is requested and the chain has none. */
export const LEISTUNGSKONTROLLE_SCHRITT = 'leistungskontrolle';

/**
 * Whether a chain step is the check step of the plan (Prüfschritt): the step the matcher inserts for a requested check,
 * or a step of the chain whose function is diagnose. The opening step is never one, even if its method diagnoses.
 */
export function istPruefschritt(kette: Pick<Funktionskette, 'schritte'> | null | undefined, schrittId: string | undefined): boolean {
  if (!schrittId) return false;
  if (schrittId === LEISTUNGSKONTROLLE_SCHRITT) return true;
  return Boolean(kette?.schritte.find((st) => st.id === schrittId)?.funktion.includes('diagnose'));
}

const zelle = (s: string | undefined) => (s || '–').replace(/\|/g, '\\|').replace(/\s*\n\s*/g, ' ').trim() || '–';
const nichtAngegeben = (v: string | undefined) => (v && v.trim() ? v.trim() : 'nicht angegeben');
const phaseKurz = (p: EntwurfPhase) => `${p.phase} – ${p.methode} (${p.zeitMin} min)`;

/**
 * Builds the draft of a lesson from the plan: seven core fields in fixed order with the profile's terms,
 * plus the profile's modules with empty content. Deterministic; it only arranges what the plan holds.
 */
export function baueEntwurf(regelsatz: PlanungsprofileRegelsatz, e: EntwurfEingabe): Entwurf {
  const b = profilBegriffe(e.profil);
  const spalten = {
    zeit: 'Zeit',
    phase: 'Phase',
    lehrende: b.taetigkeitLehrende,
    lernende: b.taetigkeitLernende,
    methode: 'Methode und Sozialform',
    medien: 'Medien'
  };
  const plan = e.phasen.filter((p) => !p.begleitend);
  const begleitstrang = e.phasen.filter((p) => p.begleitend);

  const rahmendaten = () => {
    const bereich = e.fach?.trim() ? `${e.fach.trim()}${e.thema?.trim() ? ` – ${e.thema.trim()}` : ''}` : e.thema?.trim() || 'nicht angegeben';
    const stufe = e.bildungsstufe?.trim() || OHNE_BILDUNGSSTUFE;
    return [
      `- **Titel:** ${e.titel}`,
      `- **Bereich:** ${bereich}`,
      `- **Dauer:** ${e.dauerMin} min (${b.einheit})`,
      `- **Ort:** ${nichtAngegeben(e.raum)}`,
      `- **Zielgruppe:** ${stufe}${e.anzahl ? ` · ${e.anzahl} ${b.lernende}` : ` · ${b.lernende}`}`,
      `- **Dokument:** ${b.dokument}${e.profilAngenommen ? ` (Planungsprofil angenommen, weil keine Bildungsstufe angegeben ist)` : ''}`
    ].join('\n');
  };

  const lernvoraussetzungen = () => {
    const lines = [`- **Vorwissen:** ${nichtAngegeben(e.vorwissen)}`, `- **Sprachniveau:** ${nichtAngegeben(e.sprachniveau)}`];
    const tg = e.teilgruppen || [];
    lines.push(
      tg.length
        ? `- **Teilgruppen:**\n${tg.map((g) => `  - ${g.name}${g.anzahl ? ` (${g.anzahl})` : ''}${g.beschreibung ? `: ${g.beschreibung}` : ''}`).join('\n')}`
        : '- **Teilgruppen:** keine angegeben'
    );
    if (e.ausgangslage?.trim()) lines.push(`- **Ausgangslage:** ${e.ausgangslage.trim()}`);
    return lines.join('\n');
  };

  const ziele = () => {
    const begleit = [
      ...(e.begleitziele || []),
      ...begleitstrang.map((p) => `Begleitstrang: ${p.methode}`),
      ...(e.begleitstrang || []).map((s) => `Begleitstrang (Vorschlag): ${s.methode}, ${s.dauerMin} min am Ende (${s.begleitziel})`)
    ];
    return [`- **Hauptziel:** ${nichtAngegeben(e.hauptziel)}`, `- **Begleitziele:** ${begleit.length ? begleit.join('; ') : 'keine'}`].join('\n');
  };

  const einordnung = () => (e.einheit?.trim() ? e.einheit.trim() : `${b.groessereEinheit} nicht angegeben.`);

  const verlauf = () => {
    const kopf = `| ${spalten.zeit} | ${spalten.phase} | ${spalten.lehrende} | ${spalten.lernende} | ${spalten.methode} | ${spalten.medien} |`;
    const zeilen = e.phasen.map(
      (p) =>
        `| ${p.zeitMin} min | ${zelle(p.begleitend ? `${p.phase} (Begleitstrang)` : p.phase)} | ${zelle(p.lehrende)} | ${zelle(p.lernende)} | ${zelle(
          p.sozialform ? `${p.methode} · ${p.sozialform}` : p.methode
        )} | ${zelle(p.medien)} |`
    );
    const out = [kopf, '|---|---|---|---|---|---|', ...zeilen];
    const anpassungen = e.phasen.filter((p) => p.anpassungen?.length);
    if (anpassungen.length) {
      out.push('', '**Anpassungen je Teilgruppe:**');
      for (const p of anpassungen) {
        out.push(`- ${p.phase} (${p.methode}): ${p.anpassungen!.map((a) => `${a.gruppe}: ${a.text}`).join(' | ')}`);
      }
    }
    return out.join('\n');
  };

  // Design section 8: the check field comes from the check step, the reflection from the closing step of the lesson.
  const stunde = plan.filter((p) => !p.wiederkehr);
  const lernerfolg = () => {
    const pruef = stunde.filter((p) => p.pruefschritt);
    const schritte = pruef.length ? pruef : stunde.filter((p) => p.schrittRolle === 'sicherung');
    const lines = schritte.length
      ? schritte.map((p) => `- **${pruef.length ? 'Prüfschritt' : 'Sicherung'}:** ${phaseKurz(p)}`)
      : ['- Kein eigener Prüfschritt im Ablauf.'];
    if (e.nachweis?.trim()) lines.push(`- **Nachweis:** ${e.nachweis.trim()}`);
    return lines.join('\n');
  };

  const reflexion = () => {
    const last = stunde[stunde.length - 1];
    const lines = [`- **Abschluss:** ${last ? phaseKurz(last) : 'nicht angegeben'}`];
    const hinweise = (e.hinweise || []).map((h) => h.trim()).filter(Boolean);
    if (hinweise.length) lines.push(`- **Hinweise:**\n${hinweise.map((h) => `  - ${h}`).join('\n')}`);
    return lines.join('\n');
  };

  const bau: Record<Kernfeld['id'], { titel: string; inhalt: () => string }> = {
    rahmendaten: { titel: 'Rahmendaten', inhalt: rahmendaten },
    lernvoraussetzungen: { titel: `Lernvoraussetzungen ${e.profil.formen.derLernenden}`, inhalt: lernvoraussetzungen },
    ziele: { titel: 'Ziele oder Lernergebnisse', inhalt: ziele },
    einordnung: { titel: `Einordnung ${b.inGroessereEinheit}`, inhalt: einordnung },
    verlauf: { titel: `Verlaufsplan ${b.derEinheit}`, inhalt: verlauf },
    lernerfolg: { titel: 'Sicherung und Kontrolle des Lernerfolgs', inhalt: lernerfolg },
    reflexion: { titel: 'Reflexion und Evaluation', inhalt: reflexion }
  };

  return {
    planungsprofil: {
      id: e.profil.id,
      angenommen: Boolean(e.profilAngenommen),
      dokument: b.dokument,
      einheit: b.einheit,
      groessereEinheit: b.groessereEinheit,
      lehrende: b.lehrende,
      lernende: b.lernende
    },
    spalten,
    kernfelder: regelsatz.kernfelder.map((k) => ({ id: k.id, name: k.name, titel: bau[k.id].titel, inhalt: bau[k.id].inhalt() })),
    module: e.profil.module.map((m) => ({ id: m.id, name: m.name, inhalt: '' }))
  };
}

/**
 * The draft as Markdown: numbered core fields, then the modules as headings to fill in.
 * `nach` adds caller text after a core field (e.g. the phase-by-phase procedure after the lesson plan).
 */
export function entwurfMarkdown(e: Entwurf, ebene = 3, nach: Partial<Record<Kernfeld['id'], string>> = {}): string {
  const h = '#'.repeat(ebene);
  const lines: string[] = [];
  e.kernfelder.forEach((k, i) => {
    if (i) lines.push('');
    lines.push(`${h} ${i + 1}. ${k.titel}`, k.inhalt);
    if (nach[k.id]?.trim()) lines.push('', nach[k.id]!.trim());
  });
  if (e.module.length) {
    lines.push('', `${h} Module (${e.planungsprofil.dokument})`);
    for (const m of e.module) lines.push('', `${h}# ${m.name}`, m.inhalt || '_auszufüllen_');
  }
  return lines.join('\n');
}
