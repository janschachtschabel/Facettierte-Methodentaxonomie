// Condition checker B1–B14 of spec E12 (docs/superpowers/specs/2026-11-27-fmt21-ergaenzung.md), Task P0.1 of
// docs/superpowers/plans/2026-11-27-fmt21.md. Pure functions: each reads one entry as run.mts records it (plan, match,
// adapt, mcpPlan), the yardstick of soll.mts and catalogue values; nothing here calls the engine.
// Every condition is decidable from the answer, the request and the catalogue; the reading of each is written next to
// its function. Result texts are German (they go into the reports).
import type { Baustein, FmtData, Funktionskette } from '../../packages/fmt-core/src/types.js';
import type { Soll, SollTeilgruppe } from './soll.mts';

export type Bedingung = 'B1' | 'B2' | 'B3' | 'B4' | 'B5' | 'B6' | 'B7' | 'B8' | 'B9' | 'B10' | 'B11' | 'B12' | 'B13' | 'B14';
export type Pruefstatus = 'erfuellt' | 'verletzt' | 'entfaellt';
export interface Pruefergebnis {
  status: Pruefstatus;
  detail: string;
}
type Json = Record<string, any>;
/** One scenario as run.mts records it in rohergebnisse.json. */
export interface Eintrag {
  id: string;
  kurz?: string;
  anfrage: Json;
  plan: { status: number; json: Json };
  match?: { status: number; json: Json };
  matchNote?: string;
  adapt?: { status: number; json: Json };
  mcpPlan?: { isError: boolean; json: Json };
  mcpAdapt?: { isError: boolean; json: Json };
}
export interface Katalog {
  bausteine: Map<string, Baustein>;
  ketten: Map<string, Funktionskette>;
  /** Vocabulary ids that contain a hyphen (never readable text, B10). */
  vokabelIdsMitBindestrich: string[];
  /** Ids of chain steps (k1, p2, …; B10). */
  schrittIds: string[];
  raumLabel: Map<string, string>;
  /** Subject names (labels, alternative names, terms) of data/crosswalk/oeh-faecher.json, lower case (B10). */
  fachNamen: string[];
}
export type Pruefer = (eintrag: Eintrag, soll: Soll, katalog: Katalog) => Pruefergebnis;

export const BEDINGUNGEN: Bedingung[] = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11', 'B12', 'B13', 'B14'];
/** Acceptance per package (spec „Reihenfolge und Abnahme“). */
export const PAKET: Record<1 | 2 | 3 | 4, Bedingung[]> = {
  1: ['B1', 'B4', 'B5', 'B6', 'B7', 'B10', 'B11'],
  2: ['B8', 'B12', 'B14'],
  3: ['B3', 'B9'],
  4: ['B2', 'B13']
};
export const KEINE_METHODE_SATZ = 'Für diesen Schritt steht keine passende Methode im Katalog.';

export function katalogAus(data: Pick<FmtData, 'bausteine' | 'ketten' | 'schemes'> & Partial<Pick<FmtData, 'faecher'>>): Katalog {
  const ids: string[] = [];
  const raumLabel = new Map<string, string>();
  const sammle = (knoten: any, schema: string) => {
    if (!knoten || typeof knoten !== 'object') return;
    if (Array.isArray(knoten)) return knoten.forEach((k) => sammle(k, schema));
    if (typeof knoten.id === 'string') {
      if (knoten.id.includes('-')) ids.push(knoten.id);
      if (schema === 'raumtyp' && typeof knoten.label === 'string') raumLabel.set(knoten.id, knoten.label);
    }
    sammle(knoten.werte, schema);
    sammle(knoten.gruppen, schema);
  };
  for (const s of data.schemes as any[]) {
    sammle(s.werte, s.id);
    sammle(s.gruppen, s.id);
  }
  return {
    bausteine: new Map(data.bausteine.map((b) => [b.kennung, b])),
    ketten: new Map(data.ketten.map((k) => [k.id, k])),
    vokabelIdsMitBindestrich: [...new Set(ids)],
    schrittIds: [...new Set(data.ketten.flatMap((k) => k.schritte.map((s) => s.id)))],
    raumLabel,
    fachNamen: [
      ...new Set(
        [...(data.faecher?.schulfaecher ?? []), ...(data.faecher?.hochschulfaecher ?? [])]
          .flatMap((f: any) => [f.label, ...(f.alt ?? []), ...(f.begriffe ?? [])])
          .filter((x): x is string => typeof x === 'string' && x.length > 0)
          .map((x) => x.toLocaleLowerCase('de'))
      )
    ]
  };
}

// ---------- reading helpers ----------

const ok = (detail = ''): Pruefergebnis => ({ status: 'erfuellt', detail });
const nein = (detail: string): Pruefergebnis => ({ status: 'verletzt', detail });
const entfaellt = (detail: string): Pruefergebnis => ({ status: 'entfaellt', detail });

const planJson = (e: Eintrag): Json | null => (e.plan?.status === 200 && e.plan.json && typeof e.plan.json === 'object' ? e.plan.json : null);
export const modusVon = (p: Json | null | undefined): string | undefined => p?.erkannteKriterien?.modus ?? p?.modus;

interface Zeile {
  row: Json;
  /** Arrangement node of the row (see tabellenKnoten). */
  knoten?: Json;
  methodId: string | null;
  /** Wiederkehr in later lessons, outside the stated time. */
  ausserhalb: boolean;
}
/**
 * Nodes that become table rows, walked exactly as extractScheduledPhases (apps/server/src/routes/assistant.ts) builds
 * the table: Sequenz and Schleife → teile, Parallel → haupt, Wahl → first option, Einsatz and Wiederkehr with a
 * baustein → one row each, plus the planned Freiphase node (P1.2). Other nodes give no row.
 */
export function tabellenKnoten(n: any, aus: Json[] = []): Json[] {
  if (!n || typeof n !== 'object') return aus;
  if ((n.typ === 'Sequenz' || n.typ === 'Schleife') && Array.isArray(n.teile)) n.teile.forEach((t: any) => tabellenKnoten(t, aus));
  else if (n.typ === 'Parallel') tabellenKnoten(n.haupt, aus);
  else if (n.typ === 'Wahl' && Array.isArray(n.optionen) && n.optionen.length) tabellenKnoten(n.optionen[0], aus);
  else if ((n.typ === 'Einsatz' || n.typ === 'Wiederkehr') && typeof n.baustein === 'string') aus.push(n);
  // Forward-compatible: the free phase node of P1.2 (ruling 1) becomes a row without method.
  else if (n.typ === 'Freiphase') aus.push(n);
  return aus;
}
/** Every node of the arrangement, including the begleitend branch of a Parallel and all options of a Wahl. */
function alleKnoten(n: any, aus: Json[] = []): Json[] {
  if (!n || typeof n !== 'object') return aus;
  if (Array.isArray(n)) {
    n.forEach((x) => alleKnoten(x, aus));
    return aus;
  }
  if (typeof n.typ === 'string') aus.push(n);
  alleKnoten(n.teile, aus);
  alleKnoten(n.haupt, aus);
  alleKnoten(n.begleitend, aus);
  alleKnoten(n.optionen, aus);
  for (const b of n.belegung ?? []) alleKnoten(b.inhalt, aus);
  return aus;
}
const arrangementVon = (p: Json): Json | undefined => p?.maschinenlesbar?.arrangement;
interface Tabelle {
  zeilen: Zeile[];
  /** Set when rows and nodes do not pair up; checks that need the node of a row fail with this reason. */
  fehlpassung?: string;
}
function tabelleVon(p: Json): Tabelle {
  const rows: Json[] = Array.isArray(p?.thematischeTabelle) ? p.thematischeTabelle : [];
  const arr = arrangementVon(p);
  const knoten = arr ? tabellenKnoten(arr.ablauf ?? arr) : [];
  let fehlpassung: string | undefined;
  if (knoten.length !== rows.length) fehlpassung = `Zeilen und Knoten passen nicht zusammen (${rows.length} Zeilen, ${knoten.length} Knoten im Arrangement)`;
  else {
    const i = rows.findIndex((row, j) => (row.methodId ?? null) !== (knoten[j].baustein ?? null));
    if (i >= 0) fehlpassung = `Zeilen und Knoten passen nicht zusammen (Zeile ${i + 1}: ${rows[i].methodId ?? '–'}, Knoten: ${knoten[i].baustein ?? '–'})`;
  }
  return {
    fehlpassung,
    zeilen: rows.map((row, i) => ({
      row,
      knoten: fehlpassung ? undefined : knoten[i],
      methodId: typeof row.methodId === 'string' && row.methodId ? row.methodId : null,
      ausserhalb: Boolean(row.wiederkehr) && Number(row.dauerAusserhalbMin) > 0
    }))
  };
}
const zeilenVon = (p: Json): Zeile[] => tabelleVon(p).zeilen;
/** Methods of the plan without a row of their own: slots (belegung) and the begleitend branch of a Parallel. */
function slotMethoden(p: Json): string[] {
  const arr = arrangementVon(p);
  const alle = alleKnoten(arr?.ablauf ?? arr);
  const inZeilen = new Set(tabellenKnoten(arr?.ablauf ?? arr));
  const optionen = new Set(alle.filter((n) => n.typ === 'Wahl').flatMap((n) => alleKnoten((n.optionen ?? []).slice(1))));
  return alle.filter((n) => typeof n.baustein === 'string' && !inZeilen.has(n) && !optionen.has(n)).map((n) => n.baustein);
}
/** Values of the keys baustein / kennung / methodId anywhere in a structure. */
function idsIn(x: any, aus: string[] = []): string[] {
  if (!x || typeof x !== 'object') return aus;
  if (Array.isArray(x)) {
    x.forEach((y) => idsIn(y, aus));
    return aus;
  }
  for (const [k, v] of Object.entries(x)) {
    if ((k === 'baustein' || k === 'kennung' || k === 'methodId') && typeof v === 'string') aus.push(v);
    else idsIn(v, aus);
  }
  return aus;
}
const norm = (s: string) => s.toLocaleLowerCase('de').replace(/\s+/g, ' ').trim();
const istStrukturiert = (anfrage: Json) => Object.keys(anfrage ?? {}).some((k) => k !== 'text');
const bausteinName = (k: Katalog, id: string) => k.bausteine.get(id)?.name ?? id;

/** Main step of the plan: the answer's own (kernhandlung.schritt, from P3), else the `haupt` step with the largest share. */
function hauptschritt(p: Json, k: Katalog): string | undefined {
  if (typeof p?.kernhandlung?.schritt === 'string') return p.kernhandlung.schritt;
  const kette = k.ketten.get(arrangementVon(p)?.zieltyp);
  if (!kette) return undefined;
  let best: { id: string; anteil: number } | undefined;
  for (const s of kette.schritte as any[]) {
    if (s.rolle !== 'haupt') continue;
    const anteil = Number(s.zeitanteil ?? 0);
    if (!best || anteil > best.anteil) best = { id: s.id, anteil };
  }
  return best?.id;
}
const hauptzeilen = (zeilen: Zeile[], schritt: string | undefined) => (schritt ? zeilen.filter((z) => z.knoten?.kettenschritt === schritt && !z.ausserhalb) : []);

/** User-facing texts of a plan answer (B10). */
function sichtbareTexte(p: Json): Array<{ wo: string; text: string }> {
  const aus: Array<{ wo: string; text: string }> = [];
  const nimm = (wo: string, x: any) => {
    if (typeof x === 'string') aus.push({ wo, text: x });
    else if (Array.isArray(x)) x.forEach((y) => nimm(wo, y));
    else if (x && typeof x === 'object') for (const v of Object.values(x)) nimm(wo, v);
  };
  nimm('hinweise', p.hinweise);
  nimm('hinweis', p.hinweis);
  nimm('annahmen', p.annahmen);
  for (const r of p.regelmeldungen ?? []) nimm('regelmeldungen', r.text);
  for (const a of p.pflichtangaben?.angenommen ?? []) nimm('pflichtangaben', a.grund);
  for (const r of p.thematischeTabelle ?? []) {
    for (const [key, v] of Object.entries(r)) if (!['key', 'methodId', 'orderLabel'].includes(key)) nimm('Tabelle', v);
  }
  for (const f of p.entwurf?.kernfelder ?? []) nimm('Entwurf', [f.titel, f.inhalt]);
  for (const m of p.entwurf?.module ?? []) nimm('Entwurf', [m.name, m.inhalt]);
  return aus;
}
const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Parts of a request that name nothing but a stage or class, a group size, a room, a phase or a time (B10 ruling). */
const RAHMENTEIL = [
  'klasse \\d+',
  'kl\\. ?\\d+',
  'jahrgangsstufe \\d+',
  '\\d+\\. (?:lehrjahr|semester|klasse)',
  'oberstufe',
  'mittelstufe',
  'unterstufe',
  'q[12]',
  'sek(?:undarstufe)? ?(?:i{1,2}|1|2)',
  'grundschule',
  'berufsschule',
  '\\d+ ?(?:minuten|min\\.?|stunden?)',
  'doppelstunde',
  'einzelstunde',
  '\\d+ (?:kinder|schüler(?:innen)?|schülerinnen und schüler|studierende|azubis|auszubildende|teilnehmende|teilnehmer(?:innen)?|personen|lernende)',
  '[\\p{L}-]*raum',
  '[\\p{L}-]*halle',
  'sportplatz',
  'schulhof',
  'draußen',
  'labor',
  'lehrküche',
  'werkstatt',
  'skills lab',
  'einstieg',
  'erarbeitung',
  'sicherung',
  'abschluss'
];
/** Whether a whole part of the request text names only subject, stage/class, group size, room, phase or time. */
function nurRahmen(teil: string, k: Katalog): boolean {
  const muster = [...RAHMENTEIL, ...k.fachNamen.map(escape)].sort((a, b) => b.length - a.length);
  const re = new RegExp(`^(?:${muster.join('|')})(?=\\s|$)\\s*`, 'u');
  let rest = norm(teil).replace(/[.!?]+$/, '');
  if (!rest) return false;
  while (rest) {
    const m = rest.match(re);
    if (!m || !m[0]) return false;
    rest = rest.slice(m[0].length).trim();
  }
  return true;
}
const teileVon = (x: string) => x.split(/[,:]/).map((t) => norm(t)).filter(Boolean);
/**
 * B10 ruling: the topic is literal if it is one contiguous part of the request text, or if it is the request's
 * comma/colon parts in order with only whole parts missing that name nothing but subject, stage/class, group size,
 * room, phase or time. Cutting words inside a part fails.
 */
export function themaWoertlich(text: string, thema: string, k: Katalog): boolean {
  if (!thema.trim()) return false;
  if (norm(text).includes(norm(thema))) return true;
  const t = teileVon(text);
  const th = teileVon(thema);
  let j = 0;
  for (const teil of t) {
    if (j < th.length && teil === th[j]) j++;
    else if (!nurRahmen(teil, k)) return false;
  }
  return j === th.length;
}
const ganzesWort = (id: string) => new RegExp(`(?<![\\p{L}\\p{N}_-])${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}_-])`, 'u');

// ---------- B1–B14 ----------

/** B1: in mode ablauf the table sums to the stated time (else the assumed one) and to pruefung.dauerMin; a Wiederkehr outside stands apart. */
export const pruefeB1: Pruefer = (e, soll) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  if (modusVon(p) !== 'ablauf') return entfaellt(`Modus „${modusVon(p) ?? '–'}“, kein Ablauf`);
  let ziel = soll.zeitMin?.wert;
  let quelle = 'genannt';
  if (ziel === undefined) {
    const ang = (p.pflichtangaben?.angenommen ?? []).find((x: Json) => x.feld === 'zeitMin' || x.feld === 'zeit');
    ziel = typeof ang?.wert === 'number' ? ang.wert : undefined;
    quelle = 'angenommen';
    if (ziel === undefined) return nein('Keine Zeit genannt und keine angenommene Zeit unter pflichtangaben.angenommen (Feld zeit)');
  }
  const zeilen = zeilenVon(p);
  const summe = zeilen.reduce((s, z) => s + (Number(z.row.durationMin) || 0), 0);
  const fehler: string[] = [];
  if (summe !== ziel) fehler.push(`Summe der Tabelle ${summe} min ≠ ${ziel} min (${quelle})`);
  if (p.pruefung?.dauerMin !== ziel) fehler.push(`pruefung.dauerMin ${p.pruefung?.dauerMin} ≠ ${ziel}`);
  for (const z of zeilen.filter((x) => x.ausserhalb)) {
    if (z.row.durationMin !== 0) fehler.push(`Wiederkehr-Zeile „${z.row.phaseLabel}“ hat ${z.row.durationMin} min statt 0`);
    if (!String(z.row.phaseLabel ?? '').startsWith('Wiederkehr in Folgestunden')) fehler.push(`Wiederkehr-Zeile heißt „${z.row.phaseLabel}“`);
  }
  return fehler.length ? nein(fehler.join('; ')) : ok(`${summe} min`);
};

/** B2: with ohneSchrift (stated, or Klasse 1–2 without a writing goal) no method of table, slots or Wiederkehr needs that writing. */
export const pruefeB2: Pruefer = (e, soll, k) => {
  if (!soll.ohneSchrift || (soll.ohneSchrift.status === 'abgeleitet' && soll.zielSchrift)) return entfaellt('Schrift nicht ausgeschlossen');
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  const bedarf: string[] = soll.ohneSchrift.werte.map((w) => (w === 'lesen' ? 'liest' : 'schreibt'));
  const methoden = [...zeilenVon(p).map((z) => z.methodId).filter((x): x is string => Boolean(x)), ...slotMethoden(p)];
  if (methoden.length === 0) return entfaellt('kein Ablauf mit Methoden');
  const treffer = [...new Set(methoden)].filter((id) => (k.bausteine.get(id)?.schriftbedarf ?? []).some((s) => bedarf.includes(s)));
  return treffer.length
    ? nein(`Mit Schriftbedarf: ${treffer.map((id) => `${bausteinName(k, id)} (${(k.bausteine.get(id)?.schriftbedarf ?? []).join(', ')})`).join('; ')}`)
    : ok();
};

/** B3: a stated Kernhandlung holds the main step (accepted method, or a free phase with its words), no row is longer, minutes ≥ dauerMin. */
export const pruefeB3: Pruefer = (e, soll, k) => {
  const kh = soll.kernhandlung;
  if (!kh) return entfaellt('keine Kernhandlung genannt');
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  if (modusVon(p) !== 'ablauf') return nein(`Kernhandlung „${kh.wortlaut}“ genannt, aber kein Ablauf (Modus ${modusVon(p) ?? '–'})`);
  const { zeilen, fehlpassung } = tabelleVon(p);
  if (fehlpassung) return nein(fehlpassung);
  const schritt = hauptschritt(p, k);
  const haupt = hauptzeilen(zeilen, schritt);
  if (!haupt.length) return nein(`Hauptschritt ${schritt ?? '–'} nicht in der Tabelle`);
  const wort = norm(kh.wortlaut);
  const traeger = haupt.find((z) =>
    z.methodId ? kh.methoden !== 'frei' && kh.methoden.includes(z.methodId) : norm(String(z.row.phaseLabel ?? '') + ' ' + String(z.row.methodName ?? '')).includes(wort)
  );
  if (!traeger) return nein(`Hauptschritt „${haupt[0].row.phaseLabel}“ hält ${haupt.map((z) => z.row.methodName ?? 'keine Methode').join(', ')}, nicht „${kh.wortlaut}“`);
  const min = Number(traeger.row.durationMin) || 0;
  const laenger = zeilen.filter((z) => z !== traeger && !z.ausserhalb && (Number(z.row.durationMin) || 0) > min);
  if (laenger.length) return nein(`„${laenger[0].row.methodName ?? laenger[0].row.phaseLabel}“ (${laenger[0].row.durationMin} min) ist länger als die Kernhandlung (${min} min)`);
  const dauerMin = traeger.methodId ? k.bausteine.get(traeger.methodId)?.dauerMin : undefined;
  if (dauerMin !== undefined && min < dauerMin) return nein(`Kernhandlung ${min} min, Mindestdauer ${dauerMin} min`);
  return ok(`${traeger.row.methodName ?? traeger.row.phaseLabel} (${min} min)`);
};

/** B4: no method of Reichweite r3/r4 in table, slots, zusatzphasen, teilgruppenMethoden (they belong in `rahmen`). */
export const pruefeB4: Pruefer = (e, _soll, k) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  const quellen: Array<[string, string[]]> = [
    ['Tabelle', zeilenVon(p).map((z) => z.methodId).filter((x): x is string => Boolean(x))],
    ['Slot', slotMethoden(p)],
    ['Zusatzphase', idsIn(p.zusatzphasen)],
    ['Teilgruppenmethode', idsIn(p.teilgruppenMethoden)]
  ];
  const treffer: string[] = [];
  for (const [wo, ids] of quellen)
    for (const id of new Set(ids)) {
      const b = k.bausteine.get(id);
      if (!b) treffer.push(`${wo}: unbekannte Methode „${id}“`);
      const r = b?.reichweite;
      if (r === 'r3' || r === 'r4') treffer.push(`${wo}: ${bausteinName(k, id)} (${r})`);
    }
  return treffer.length ? nein(treffer.join('; ')) : ok();
};

/** B5: every row with a method and minutes lies within dauerMin…dauerMax; a Wiederkehr outside: one repetition within the range. */
export const pruefeB5: Pruefer = (e, _soll, k) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  const fehler: string[] = [];
  let geprueft = 0;
  const { zeilen, fehlpassung } = tabelleVon(p);
  if (fehlpassung) return nein(fehlpassung);
  for (const z of zeilen) {
    if (!z.methodId) continue;
    const b = k.bausteine.get(z.methodId);
    if (!b) {
      fehler.push(`unbekannte Methode „${z.methodId}“`);
      continue;
    }
    const min = z.row.wiederkehr ? Number(z.knoten?.dauerMin) : Number(z.row.durationMin);
    if (!z.row.wiederkehr && !(min > 0)) continue;
    if (!Number.isFinite(min)) {
      fehler.push(`${b.name}: Dauer je Wiederholung unbekannt`);
      continue;
    }
    geprueft++;
    if (min < b.dauerMin || min > b.dauerMax) fehler.push(`${b.name}${z.row.wiederkehr ? ' (je Wiederholung)' : ''}: ${min} min, erlaubt ${b.dauerMin}–${b.dauerMax}`);
  }
  if (!geprueft && !fehler.length) return entfaellt('keine Zeile mit Methode und Minuten');
  return fehler.length ? nein(fehler.join('; ')) : ok();
};

/** B6: an invalid check → the notes say the plan is incomplete and name each open step; every check message is in words in the notes or a rule message (ruling 9). */
export const pruefeB6: Pruefer = (e) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  if (!p.pruefung) return entfaellt('keine Prüfung (kein Ablauf)');
  const hinweise: string[] = (p.hinweise ?? []).filter((h: any) => typeof h === 'string');
  const texte = [...hinweise, ...(p.regelmeldungen ?? []).map((r: Json) => String(r.text ?? ''))].map(norm);
  const zitate = (s: string) => [...s.matchAll(/„([^“]+)“/g)].map((m) => m[1]);
  const fehler: string[] = [];
  if (p.pruefung.gueltig === false) {
    const unvollst = hinweise.filter((h) => /unvollständig/i.test(h)).map(norm);
    if (!unvollst.length) fehler.push('Plan ungültig, aber kein Hinweis „unvollständig“');
    const offen = new Set<string>();
    for (const m of p.pruefung.meldungen ?? []) if (m.regel === 'R-04') zitate(String(m.meldung ?? '')).slice(0, 1).forEach((x) => offen.add(x));
    if (e.match?.status === 200 && e.match.json?.modus === modusVon(p)) for (const o of e.match.json.offen ?? []) if (typeof o === 'string') offen.add(o);
    for (const z of zeilenVon(p)) if (!z.methodId && z.row.phaseLabel) offen.add(String(z.row.phaseLabel));
    for (const o of offen) if (!unvollst.some((h) => h.includes(norm(o)))) fehler.push(`offener Schritt „${o}“ nicht im Hinweis genannt`);
  }
  for (const m of p.pruefung.meldungen ?? []) {
    const text = norm(String(m.meldung ?? m.text ?? ''));
    const z = zitate(String(m.meldung ?? m.text ?? '')).map(norm);
    const gefunden = texte.some((t) => t.includes(text)) || (z.length > 0 && texte.some((t) => z.every((x) => t.includes(x))));
    if (!gefunden) fehler.push(`Prüfmeldung ${m.regel ?? ''} „${m.meldung ?? m.text}“ fehlt in den Hinweisen`);
  }
  return fehler.length ? nein(fehler.join('; ')) : ok(p.pruefung.gueltig === false ? 'ungültig, Hinweis vorhanden' : '');
};

const STANDARDGRUPPEN = ['Basisunterstützung', 'Regelgruppe', 'Vertiefung'];
/** B7: no named subgroup → no Zusatzphase, no Teilgruppenmethode, no group with matrix, no group in the Entwurf; named groups → exactly their ids. */
export const pruefeB7: Pruefer = (e, soll) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  const gruppen: Json[] = p.lerngruppenUndMatrix ?? [];
  const zp: Json[] = p.zusatzphasen ?? [];
  const tm: Json[] = p.teilgruppenMethoden ?? [];
  const soll_ids = soll.teilgruppen.map((t) => t.id);
  if (!soll_ids.length) {
    const fehler: string[] = [];
    if (gruppen.length) fehler.push(`Gruppen ohne Angabe: ${gruppen.map((g) => g.label ?? g.id).join(', ')}`);
    if (zp.length) fehler.push(`Zusatzphasen: ${zp.map((z) => z.name ?? z.kennung).join(', ')}`);
    if (tm.length) fehler.push(`Teilgruppenmethoden: ${tm.length}`);
    const labels = [...new Set([...gruppen.map((g) => g.label), ...zp.flatMap((z) => z.groupLabels ?? []), ...STANDARDGRUPPEN].filter((x): x is string => typeof x === 'string' && x.length > 0))];
    const entwurf = JSON.stringify(p.entwurf ?? {});
    const imEntwurf = labels.filter((l) => entwurf.includes(l));
    if (imEntwurf.length) fehler.push(`Entwurf nennt Gruppe: ${imEntwurf.join(', ')}`);
    return fehler.length ? nein(fehler.join('; ')) : ok();
  }
  const ist = [...new Set(gruppen.map((g) => String(g.id)))].sort();
  const sollSortiert = [...soll_ids].sort();
  const fehler: string[] = [];
  if (JSON.stringify(ist) !== JSON.stringify(sollSortiert)) fehler.push(`Gruppen ${ist.join(', ') || '–'} statt ${sollSortiert.join(', ')}`);
  const fremd = [...new Set([...zp.flatMap((z) => z.groupIds ?? []), ...tm.map((t) => t.groupId)].filter((g) => g && !soll_ids.includes(g)))];
  if (fremd.length) fehler.push(`Zusatzphase oder Teilgruppenmethode für nicht genannte Gruppe: ${fremd.join(', ')}`);
  return fehler.length ? nein(fehler.join('; ')) : ok();
};

/** B8: a safety note only with a room type with danger; it names the room and the Kernhandlung (method of the main step) and no other method; with such a room it must exist (ruling 10). */
export const pruefeB8: Pruefer = (e, soll, k) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  const notes: Json[] = (p.regelmeldungen ?? []).filter((r: Json) => r.regel === 'sicherheitshinweis');
  if (!soll.gefahrRaum) return notes.length ? nein(`Sicherheitshinweis ohne Raum mit Gefahr: „${notes[0].text}“`) : entfaellt('kein Raum mit Gefahr, kein Hinweis');
  if (!notes.length) return nein('Raum mit Gefahr, aber kein Sicherheitshinweis');
  const raeume = soll.raumtyp ? [soll.raumtyp.wert, ...(soll.raumtyp.auch ?? [])] : [];
  const raumWoerter = raeume.flatMap((r) => [k.raumLabel.get(r) ?? r, ...(k.raumLabel.get(r) ?? '').split(/,\s*/)]).filter(Boolean).map(norm);
  const { zeilen, fehlpassung } = tabelleVon(p);
  if (fehlpassung) return nein(fehlpassung);
  const haupt = hauptzeilen(zeilen, hauptschritt(p, k));
  const kernNamen = haupt.map((z) => String(z.row.methodName ?? z.row.phaseLabel ?? '')).filter(Boolean);
  const andere = [...new Set(zeilen.filter((z) => z.methodId && !haupt.includes(z)).map((z) => String(z.row.methodName ?? '')))].filter((n) => n && !kernNamen.includes(n));
  const fehler: string[] = [];
  for (const n of notes) {
    const t = norm(String(n.text ?? ''));
    if (!raumWoerter.some((w) => t.includes(w))) fehler.push(`Hinweis nennt den Raum nicht (${raeume.map((r) => k.raumLabel.get(r) ?? r).join(' / ')})`);
    if (!kernNamen.some((kn) => t.includes(norm(kn)))) fehler.push(`Hinweis nennt die Kernhandlung nicht (${kernNamen.join(', ') || '–'})`);
    const genannt = andere.filter((a) => t.includes(norm(a)));
    if (genannt.length) fehler.push(`Hinweis nennt andere Methode: ${genannt.join(', ')}`);
  }
  return fehler.length ? nein([...new Set(fehler)].join('; ')) : ok();
};

const SOLL_FELD: Record<string, (s: Soll) => { wert: unknown; status: string; auch?: unknown[] } | null> = {
  zeitMin: (s) => s.zeitMin,
  gruppe: (s) => s.gruppe,
  raum: (s) => s.raumtyp,
  bildungsstufe: (s) => s.bildungsstufe,
  fachbereich: (s) => s.fachbereich,
  ohneSchrift: (s) => (s.ohneSchrift ? { wert: s.ohneSchrift.werte, status: s.ohneSchrift.status } : null)
};
/** Names of a criterion under pflichtangaben.angenommen where they differ from the key of erkannteKriterien. */
const PFLICHT_FELD: Record<string, string[]> = { zeitMin: ['zeitMin', 'zeit'], gruppe: ['gruppe', 'anzahl'], fachbereich: ['fachbereich', 'fach'] };
const gleich = (a: unknown, b: unknown) => JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);
/** Whether the request states this value: the yardstick decides for the fields it models; otherwise a request field or words of the text (a beleg that is not a semantic guess). */
function genannt(feld: string, wert: unknown, e: Eintrag, soll: Soll): boolean {
  const modell = SOLL_FELD[feld];
  if (modell) {
    const s = modell(soll);
    return Boolean(s && s.status === 'genannt' && (gleich(s.wert, wert) || (s.auch ?? []).some((x) => gleich(x, wert))));
  }
  // The value must be the one the request states: an engine that replaces a stated value does not get „genannt“.
  if (e.anfrage && feld in e.anfrage) return gleich(e.anfrage[feld], wert);
  const erkannt: Json[] = e.match?.json?.erkannt ?? [];
  return erkannt.some((x) => x.feld === feld && typeof x.beleg === 'string' && !/^(semantisch|Thema):/i.test(x.beleg) && (x.wert === undefined || gleich(x.wert, wert)));
}
/** B9: every derived or assumed value stands with its reason under pflichtangaben.angenommen; nothing unstated counts as stated. */
export const pruefeB9: Pruefer = (e, soll) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  const angenommen: Json[] = p.pflichtangaben?.angenommen ?? [];
  const fehler: string[] = [];
  const unterAnnahmen = (feld: string) => {
    const namen = PFLICHT_FELD[feld] ?? [feld];
    return angenommen.find((a) => namen.includes(a.feld) && typeof a.grund === 'string' && a.grund.trim().length > 0);
  };
  if (p.angaben) {
    const liste: Json[] = Array.isArray(p.angaben) ? p.angaben : Object.entries(p.angaben).map(([feld, v]) => ({ feld, ...(v as Json) }));
    for (const a of liste) {
      if (a.status === 'abgeleitet' || a.status === 'angenommen') {
        if (!(typeof a.grund === 'string' && a.grund.trim())) fehler.push(`${a.feld}: ${a.status} ohne Grund`);
        if (!unterAnnahmen(a.feld)) fehler.push(`${a.feld}: ${a.status}, aber nicht unter den Annahmen`);
      } else if (a.status === 'genannt' && !genannt(a.feld, a.wert, e, soll)) fehler.push(`${a.feld} = ${JSON.stringify(a.wert)} gilt als genannt, steht aber nicht in der Anfrage`);
    }
  }
  for (const [feld, wert] of Object.entries(p.erkannteKriterien ?? {})) {
    if (feld === 'modus' || wert === undefined || wert === null || (Array.isArray(wert) && wert.length === 0)) continue;
    if (genannt(feld, wert, e, soll)) continue;
    if (!unterAnnahmen(feld)) fehler.push(`${feld} = ${JSON.stringify(wert)} nicht genannt und nicht unter den Annahmen`);
  }
  return fehler.length ? nein([...new Set(fehler)].join('; ')) : ok();
};

/** B10: no label „Phase N“, no vocabulary id with hyphen, chain step id or rule code in user-facing text; the topic stays verbatim. */
export const pruefeB10: Pruefer = (e, _soll, k) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  const fehler: string[] = [];
  for (const r of p.thematischeTabelle ?? []) if (/^Phase \d+$/.test(String(r.phaseLabel ?? ''))) fehler.push(`Phasenname „${r.phaseLabel}“`);
  const muster = [...k.vokabelIdsMitBindestrich.map((id) => ({ id, re: ganzesWort(id) })), ...k.schrittIds.map((id) => ({ id, re: ganzesWort(id) })), { id: 'R-\\d\\d', re: /\bR-\d\d\b/ }];
  const funde = new Map<string, string>();
  for (const { wo, text } of sichtbareTexte(p))
    for (const { id, re } of muster) {
      const m = text.match(re);
      if (m && !funde.has(m[0])) funde.set(m[0], wo);
    }
  for (const [code, wo] of funde) fehler.push(`Code „${code}“ in ${wo}`);
  const text = String(e.anfrage?.text ?? '');
  const thema = typeof p.thema === 'string' ? p.thema : '';
  if (istStrukturiert(e.anfrage)) {
    if (thema.trim() !== text.trim()) fehler.push(`Thema „${thema}“ ≠ Text der Anfrage „${text}“`);
  } else if (!themaWoertlich(text, thema, k)) fehler.push(`Thema „${thema}“ ist kein zusammenhängender Teil der Anfrage (Wörter innerhalb eines Satzteils fehlen, oder ein fehlender Teil nennt mehr als Fach, Stufe, Gruppengröße, Raum, Phase oder Zeit)`);
  return fehler.length ? nein(fehler.join('; ')) : ok();
};

/** B11: /match with the same fields answers the same mode as /plan; in mode ablauf the same methods in the same order. */
export const pruefeB11: Pruefer = (e) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  if (!e.match) return entfaellt('kein /match im Lauf');
  if (e.matchNote) return entfaellt(`/match nur mit weniger Feldern beantwortet (${e.matchNote.slice(0, 80)})`);
  if (e.match.status !== 200) return nein(`/match antwortet mit Status ${e.match.status}`);
  const m = e.match.json;
  if (m.modus !== modusVon(p)) return nein(`/plan „${modusVon(p)}“, /match „${m.modus}“`);
  if (m.modus !== 'ablauf') return ok(`beide „${m.modus}“`);
  const planIds = zeilenVon(p).filter((z) => !z.row.wiederkehr).map((z) => z.methodId);
  const matchIds = (m.schritte ?? []).map((s: Json) => s.baustein ?? null);
  return JSON.stringify(planIds) === JSON.stringify(matchIds) ? ok() : nein(`/plan ${planIds.join(', ')} · /match ${matchIds.join(', ')}`);
};

/** B12: no method twice among rows and slots (a Wiederkehr outside does not count, ruling 13); the stated group size lies within every method's range. */
export const pruefeB12: Pruefer = (e, soll, k) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  const zeilen = zeilenVon(p);
  const imPlan = [...zeilen.filter((z) => !z.ausserhalb).map((z) => z.methodId).filter((x): x is string => Boolean(x)), ...slotMethoden(p)];
  if (!imPlan.length) return entfaellt('kein Ablauf mit Methoden');
  const fehler: string[] = [];
  const doppelt = [...new Set(imPlan.filter((id, i) => imPlan.indexOf(id) !== i))];
  if (doppelt.length) fehler.push(`zweimal: ${doppelt.map((id) => bausteinName(k, id)).join(', ')}`);
  const n = soll.gruppe?.wert;
  if (n !== undefined) {
    const alle = new Set([...imPlan, ...zeilen.map((z) => z.methodId).filter((x): x is string => Boolean(x))]);
    for (const id of alle) {
      const b = k.bausteine.get(id);
      if (b && (n < b.gruppeMin || n > b.gruppeMax)) fehler.push(`${b.name}: ${n} Personen, erlaubt ${b.gruppeMin}–${b.gruppeMax}`);
    }
  }
  return fehler.length ? nein(fehler.join('; ')) : ok();
};

/**
 * Words by which a help text in a row's groupAdaptations addresses the group's named trait (controller ruling, fix
 * round 1). A matrix measure that does not touch the trait (e.g. „ruhige Ecken“ for DaZ) is no help for it.
 */
const HILFE_FUER: Record<SollTeilgruppe['art'], RegExp | null> = {
  sprache: /sprach|wortschatz|wortspeicher|satzanf|satzstarter|satzmuster|fachbegriff|glossar|daz|zweitsprache|mehrsprach/i,
  lesen: /lese|vorles|screenreader|vorlesefunktion|vorgelesen|audio|hörfassung|text(?:entlast|reduz)|einfache sprache|leichte sprache|bildgestützt|piktogramm/i,
  foerderLernen: /anleitung|strategie|schritt-für-schritt|schrittweise|lösungsbeispiel|musterlösung|strukturhilfe|modellier|kleinschritt/i,
  leistungsstark: /vertief|anspruch|herausforder|zusatzaufgabe|expert|offener|weniger anleitung|knobel|transfer/i,
  keins: null
};
/** B13: each named group a rule applies to gets „hilfe“ or „tausch“ in /adapt and, where the plan carries groups, in teilgruppenMethoden or teilgruppenHilfen of the plan. */
export const pruefeB13: Pruefer = (e, soll) => {
  const gruppen = soll.teilgruppen.filter((t) => t.regelGreift);
  if (!gruppen.length) return entfaellt('keine Teilgruppe, für die eine Regel greift');
  const p = planJson(e);
  const fehler: string[] = [];
  if (!e.adapt || e.adapt.status !== 200) fehler.push(`kein /adapt (Status ${e.adapt?.status ?? '–'})`);
  const impulse: Json[] = (e.adapt?.json?.phasenAnpassungen ?? []).flatMap((ph: Json) => ph.teilgruppenImpulse ?? []);
  const traegtGruppen = Boolean(p?.lerngruppenUndMatrix?.length);
  const tm: Json[] = p?.teilgruppenMethoden ?? [];
  const hilfen: Json[] = Array.isArray(p?.teilgruppenHilfen) ? p.teilgruppenHilfen : [];
  for (const g of gruppen) {
    if (e.adapt?.status === 200 && !impulse.some((i) => i.groupId === g.id && (i.antwort === 'hilfe' || i.antwort === 'tausch'))) fehler.push(`/adapt: „${g.id}“ (${g.merkmal}) bekommt nur „passt“`);
    const wort = HILFE_FUER[g.art];
    const zeilenHilfe = (p?.thematischeTabelle ?? []).some((row: Json) => {
      const t = row?.groupAdaptations?.[g.id];
      // The text starts with the topic („Zu „…“: …“); only the measures after it count.
      return typeof t === 'string' && Boolean(wort) && wort!.test(t.replace(/^Zu „[^“]*“:\s*/, ''));
    });
    const imPlan = tm.some((t) => t.groupId === g.id && (t.antwort === 'hilfe' || t.antwort === 'tausch')) || hilfen.some((h) => h.groupId === g.id) || zeilenHilfe;
    if (traegtGruppen && !imPlan) fehler.push(`Plan: „${g.id}“ ohne Hilfe oder Tausch (teilgruppenMethoden, teilgruppenHilfen, Hilfetext zum Merkmal in groupAdaptations)`);
  }
  return fehler.length ? nein(fehler.join('; ')) : ok();
};

/** B14: every fallback is named in the notes with its step; a row without method carries the gap sentence; no method from another subject steps in. */
export const pruefeB14: Pruefer = (e, soll, k) => {
  const p = planJson(e);
  if (!p) return nein(`/plan antwortet mit Status ${e.plan?.status}`);
  const fehler: string[] = [];
  const hinweise = (p.hinweise ?? []).filter((h: any) => typeof h === 'string').map(norm);
  for (const r of (p.rueckfall ?? []) as Json[]) {
    const schritt = String(r.schritt ?? r.label ?? r.schrittLabel ?? '');
    const was = String(r.name ?? r.titel ?? (typeof r.baustein === 'string' ? bausteinName(k, r.baustein) : ''));
    if (!schritt && !was) {
      fehler.push(`Rückfall ohne Schritt und ohne Namen: ${JSON.stringify(r).slice(0, 120)}`);
      continue;
    }
    if (!hinweise.some((h: string) => (!schritt || h.includes(norm(schritt))) && (!was || h.includes(norm(was))))) fehler.push(`Rückfall „${was}“ im Schritt „${schritt}“ nicht unter den Hinweisen`);
  }
  const zeilen = zeilenVon(p);
  for (const z of zeilen.filter((x) => !x.methodId)) {
    if (!JSON.stringify(z.row).includes(KEINE_METHODE_SATZ)) fehler.push(`Zeile „${z.row.phaseLabel}“ ohne Methode und ohne den Satz „${KEINE_METHODE_SATZ}“`);
  }
  const fach = soll.fachbereich ? [soll.fachbereich.wert, ...(soll.fachbereich.auch ?? [])] : [];
  if (fach.length) {
    const benannt = new Set(idsIn(p.verankert));
    const ids = new Set([...zeilen.map((z) => z.methodId).filter((x): x is string => Boolean(x)), ...slotMethoden(p)]);
    for (const id of ids) {
      const b = k.bausteine.get(id) as (Baustein & { grundform?: boolean }) | undefined;
      if (!b) continue;
      const fb = b.fachbereich ?? [];
      if (!fb.length || fb.includes('uebergreifend') || fb.some((f) => fach.includes(f)) || b.grundform === true || benannt.has(id)) continue;
      fehler.push(`fachfremd: ${b.name} (${fb.join(', ')})`);
    }
  }
  return fehler.length ? nein(fehler.join('; ')) : ok(fach.length ? '' : 'kein Fach genannt, Fachpassung nicht geprüft');
};

export const PRUEFER: Record<Bedingung, Pruefer> = {
  B1: pruefeB1,
  B2: pruefeB2,
  B3: pruefeB3,
  B4: pruefeB4,
  B5: pruefeB5,
  B6: pruefeB6,
  B7: pruefeB7,
  B8: pruefeB8,
  B9: pruefeB9,
  B10: pruefeB10,
  B11: pruefeB11,
  B12: pruefeB12,
  B13: pruefeB13,
  B14: pruefeB14
};

export type Matrix = Record<string, Record<Bedingung, Pruefergebnis>>;
export function pruefeAlle(eintraege: Eintrag[], sollVon: (id: string) => Soll, katalog: Katalog): Matrix {
  const aus: Matrix = {};
  for (const e of eintraege) {
    const soll = sollVon(e.id);
    aus[e.id] = Object.fromEntries(BEDINGUNGEN.map((b) => [b, PRUEFER[b](e, soll, katalog)])) as Record<Bedingung, Pruefergebnis>;
  }
  return aus;
}
export function zaehle(matrix: Matrix): Record<Bedingung, Record<Pruefstatus, number>> {
  return Object.fromEntries(
    BEDINGUNGEN.map((b) => {
      const z = { erfuellt: 0, verletzt: 0, entfaellt: 0 };
      for (const zeile of Object.values(matrix)) z[zeile[b].status]++;
      return [b, z];
    })
  ) as Record<Bedingung, Record<Pruefstatus, number>>;
}

const ZEICHEN: Record<Pruefstatus, string> = { erfuellt: '✓', verletzt: '✗', entfaellt: '–' };
const zelle = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
/** German report: counts per condition, matrix per scenario, details of every violation. */
export function berichtMarkdown(matrix: Matrix, meta: { titel: string; stand: string; sollPruefstand: string; nummer: (id: string) => number }): string {
  const z = zaehle(matrix);
  const ids = Object.keys(matrix).sort((a, b) => meta.nummer(a) - meta.nummer(b));
  const paketVon = (b: Bedingung) => Object.entries(PAKET).find(([, l]) => l.includes(b))?.[0] ?? '–';
  const zeilen: string[] = [];
  zeilen.push(`# ${meta.titel}`, '', `Stand: ${meta.stand} · Maßstab soll.mts: ${meta.sollPruefstand} · ${ids.length} Szenarien`, '');
  zeilen.push('Zeichen: ✓ erfüllt, ✗ verletzt, – entfällt (die Bedingung trifft auf das Szenario nicht zu).', '');
  zeilen.push('## Je Bedingung', '', '| Bedingung | Paket | erfüllt | verletzt | entfällt |', '|---|---|---|---|---|');
  for (const b of BEDINGUNGEN) zeilen.push(`| ${b} | ${paketVon(b)} | ${z[b].erfuellt} | ${z[b].verletzt} | ${z[b].entfaellt} |`);
  zeilen.push('', '## Je Szenario', '', `| Nr. | Szenario | ${BEDINGUNGEN.join(' | ')} | verletzt |`, `|---|---|${BEDINGUNGEN.map(() => '---').join('|')}|---|`);
  for (const id of ids) {
    const r = matrix[id];
    const n = BEDINGUNGEN.filter((b) => r[b].status === 'verletzt').length;
    zeilen.push(`| ${meta.nummer(id)} | ${id} | ${BEDINGUNGEN.map((b) => ZEICHEN[r[b].status]).join(' | ')} | ${n} |`);
  }
  zeilen.push('', '## Verletzungen im Einzelnen', '');
  for (const b of BEDINGUNGEN) {
    const verl = ids.filter((id) => matrix[id][b].status === 'verletzt');
    zeilen.push(`### ${b} (${verl.length} verletzt)`, '');
    if (!verl.length) {
      zeilen.push('Keine.', '');
      continue;
    }
    zeilen.push('| Nr. | Szenario | Befund |', '|---|---|---|');
    for (const id of verl) zeilen.push(`| ${meta.nummer(id)} | ${id} | ${zelle(matrix[id][b].detail)} |`);
    zeilen.push('');
  }
  return zeilen.join('\n');
}
