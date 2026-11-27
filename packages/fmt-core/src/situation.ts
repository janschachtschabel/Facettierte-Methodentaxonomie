import type { FmtData, MatchRequest } from './types.js';

export type Pflichtangabe = 'ziel' | 'fach-und-thema' | 'bildungsstufe' | 'anzahl' | 'raum' | 'zeit';
export interface Annahme {
  feld: string;
  wert: unknown;
  grund: string;
}

export interface Situation {
  /** Room type; stated or assumed. */
  raum?: string;
  /** Whether the request states the room (type or properties). Only then an uncovered room need excludes. */
  raumGenannt: boolean;
  /** What the room offers. */
  bietet: Set<string>;
  fachausstattungArt?: string;
  /** 'lesen' | 'schreiben': what the learners cannot do. */
  ohneSchrift: string[];
  termine?: number;
  pflichtangaben: { fehlt: Pflichtangabe[]; angenommen: Annahme[] };
}

const list = (x: unknown): string[] => (x == null || x === '' ? [] : Array.isArray(x) ? x.map(String) : [String(x)]);
const given = (v: unknown) => v != null && v !== '';

/** Room types that share the class of another one (a lab is a specialist room), or none ('' for computer room, digital). */
const RAUM_KLASSE: Record<string, string> = {
  'fachraum-nawi': 'fachraum',
  musikraum: 'fachraum',
  werkraum: 'fachraum',
  lehrkueche: 'fachraum',
  computerraum: '',
  ausserschulisch: 'draussen',
  digital: ''
};
/** Class of a room type (fachraum, bewegungsraum, draussen, klassenraum …); '' when no room is given. */
export const raumKlasse = (raum: unknown): string => (given(raum) ? (RAUM_KLASSE[String(raum)] ?? String(raum)) : '');

/** Old callers sent a flag; the field holds what the learners cannot do. */
function ohneSchriftListe(v: unknown): string[] {
  if (v === true) return ['lesen', 'schreiben'];
  if (v === false) return [];
  return list(v);
}

/**
 * Turns the request into the situation the methods are checked against: the room with what it offers,
 * what the learners cannot do, the number of dates, and which of the required details are missing or assumed.
 */
export function baueSituation(
  a: MatchRequest,
  data: Pick<FmtData, 'schemes'>,
  kontext: { thema?: string; fachErkannt?: boolean; psychomotorisch?: boolean; sportAusKondition?: boolean } = {}
): Situation {
  const raumtypen = data.schemes.find((s) => s.id === 'raumtyp')?.werte || [];
  const angenommen: Annahme[] = [];

  const genannt = given(a.raum) ? String(a.raum) : given(a.lernort) ? String(a.lernort) : undefined;
  const eigenschaften = given(a.raumBietet) ? list(a.raumBietet) : undefined;
  const raumGenannt = genannt != null || eigenschaften != null;
  const fachbereich = given(a.fachbereich) ? String(a.fachbereich) : undefined;

  let raum = genannt;
  if (!raumGenannt) {
    if (fachbereich === 'sport') {
      raum = 'bewegungsraum';
      // When sport itself was assumed from the goal kind conditioning, the goal is the reason, not the subject.
      const weil = kontext.sportAusKondition ? 'weil das Ziel Kondition ist' : 'weil das Fach Sport ist';
      angenommen.push({ feld: 'raum', wert: raum, grund: `Raum nicht angegeben: Sporthalle angenommen, ${weil}.` });
    } else if (kontext.psychomotorisch && (fachbereich === 'beruf-praxis' || fachbereich === 'nawi-technik')) {
      raum = 'fachraum';
      angenommen.push({ feld: 'raum', wert: raum, grund: 'Raum nicht angegeben: Fachraum angenommen, weil das Ziel praktisches Können ist.' });
    } else {
      raum = 'klassenraum';
      angenommen.push({ feld: 'raum', wert: raum, grund: 'Raum nicht angegeben: Klassenraum angenommen.' });
    }
  }

  const typ = raumtypen.find((w) => w.id === raum);
  const bietet = new Set(eigenschaften ?? typ?.bietet ?? []);
  const art = given(a.fachausstattungArt) ? String(a.fachausstattungArt) : typ?.fachausstattungArt;

  const ohneSchrift = ohneSchriftListe(a.ohneSchrift);
  const termine = given(a.termine) && Number.isFinite(Number(a.termine)) ? Number(a.termine) : undefined;

  const fehlt: Pflichtangabe[] = [];
  if (!given(a.zielart) && !given(a.zieltyp) && !list(a.lernfunktion).length && !list(a.liefert).length) fehlt.push('ziel');
  if (!(fachbereich || kontext.fachErkannt) || !kontext.thema) fehlt.push('fach-und-thema');
  if (!given(a.bildungsstufe)) fehlt.push('bildungsstufe');
  if (!given(a.gruppe)) fehlt.push('anzahl');
  if (!raumGenannt) fehlt.push('raum');
  if (!given(a.zeitMin)) fehlt.push('zeit');

  const s: Situation = { raum, raumGenannt, bietet, ohneSchrift, pflichtangaben: { fehlt, angenommen } };
  if (art) s.fachausstattungArt = art;
  if (termine != null) s.termine = termine;
  return s;
}
