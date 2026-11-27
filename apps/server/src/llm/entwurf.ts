import {
  OHNE_BILDUNGSSTUFE,
  baueEntwurf,
  isRegularGroupId,
  profilBegriffe,
  waehlePlanungsprofil,
  type Entwurf,
  type EntwurfPhase,
  type Planungsprofil,
  type ProfilBegriffe
} from '@fmt/core';
import { schemeValues, type CatalogStore } from '../catalog-store.js';

/** Code of a vocabulary value given as code or as label (the web app sends labels, MCP sends codes). */
function codeOf(store: CatalogStore, scheme: string, v: string | undefined): string | undefined {
  const t = v?.trim();
  if (!t) return undefined;
  const werte = schemeValues(store.bundle, scheme);
  return (werte.find((w) => w.id === t) || werte.find((w) => w.label.toLowerCase() === t.toLowerCase()))?.id;
}

function labelOf(store: CatalogStore, scheme: string, code: string | undefined): string | undefined {
  if (!code) return undefined;
  return schemeValues(store.bundle, scheme).find((w) => w.id === code)?.label || code;
}

export interface ProfilRahmen {
  profil: Planungsprofil;
  angenommen: boolean;
  begriffe: ProfilBegriffe;
  /** Bildungsstufe as label, or "Bildungsstufe nicht angegeben" (never a silent default). */
  stufe: string;
  /** One prompt line with the profile's terms. */
  zeile: string;
}

/**
 * Planning profile for a briefing: a stated profile wins, else the Bildungsstufe decides (code or label);
 * without both the profile is assumed and the line says so.
 */
export function profilRahmen(
  store: CatalogStore,
  a: { planungsprofil?: string; bildungsstufe?: string; text?: string; angenommen?: boolean }
): ProfilRahmen {
  const stufeCode = codeOf(store, 'bildungsstufe', a.bildungsstufe);
  const wahl = waehlePlanungsprofil(store.bundle.planungsprofile.profile, { planungsprofil: a.planungsprofil, bildungsstufe: stufeCode, text: a.text });
  const angenommen = a.angenommen ?? wahl.angenommen;
  const begriffe = profilBegriffe(wahl.profil);
  const stufe = (stufeCode && labelOf(store, 'bildungsstufe', stufeCode)) || a.bildungsstufe?.trim() || OHNE_BILDUNGSSTUFE;
  const zeile =
    `Planungsprofil: ${labelOf(store, 'planungsprofil', wahl.profil.id)}${angenommen ? ' (angenommen)' : ''} · ` +
    `Lehrende: ${begriffe.lehrende} · Lernende: ${begriffe.lernende} · Einheit: ${begriffe.einheit} · größere Einheit: ${begriffe.groessereEinheit}`;
  return { profil: wahl.profil, angenommen, begriffe, stufe, zeile };
}

/** Rows of the deterministic thematic table the draft is built from. */
export interface EntwurfZeile {
  key: string;
  phaseLabel: string;
  durationMin: number;
  methodId: string;
  methodName: string;
  teacherAction: string;
  learnerAction: string;
  groupAdaptations: Record<string, string>;
  materialsAndOer: string;
}

export interface EntwurfKontext {
  planungsprofil?: string;
  planungsprofilAngenommen?: boolean;
  bildungsstufe?: string;
  text?: string;
  titel: string;
  fach?: string;
  thema?: string;
  dauerMin: number;
  raum?: string;
  anzahl?: number;
  vorwissen?: string;
  sprachniveau?: string;
  teilgruppen?: Array<{ id?: string; gruppe: string; anzahl?: number; profil?: string }>;
  ausgangslage?: string;
  hauptziel?: string;
  einheit?: string;
  nachweis?: string;
  hinweise?: string[];
  /** Chain step role per phase key (from the arrangement). */
  schrittRolle?: Record<string, string | undefined>;
}

/** Draft with the seven core fields from the deterministic table of an elaboration or a scenario plan. */
export function entwurfAusTabelle(store: CatalogStore, k: EntwurfKontext, zeilen: EntwurfZeile[]): Entwurf {
  const rahmen = profilRahmen(store, { planungsprofil: k.planungsprofil, bildungsstufe: k.bildungsstufe, text: k.text, angenommen: k.planungsprofilAngenommen });
  const gruppen = (k.teilgruppen || []).filter((g) => !isRegularGroupId(g.id || g.gruppe));
  const gruppenName = new Map((k.teilgruppen || []).map((g) => [g.id || g.gruppe, g.gruppe]));
  const phasen: EntwurfPhase[] = zeilen.map((z) => {
    const b = store.blocksById.get(z.methodId);
    return {
      zeitMin: z.durationMin,
      phase: z.phaseLabel,
      methode: z.methodName,
      sozialform: (b?.interaktion || []).map((x) => labelOf(store, 'interaktion', x)).join(', ') || undefined,
      medien: z.materialsAndOer,
      lehrende: z.teacherAction,
      lernende: z.learnerAction,
      lernfunktion: b?.lernfunktion,
      schrittRolle: k.schrittRolle?.[z.key],
      anpassungen: Object.entries(z.groupAdaptations || {})
        .filter(([gid]) => !isRegularGroupId(gid))
        .map(([gid, text]) => ({ gruppe: gruppenName.get(gid) || gid, text }))
    };
  });
  return baueEntwurf(store.bundle.planungsprofile, {
    profil: rahmen.profil,
    profilAngenommen: rahmen.angenommen,
    titel: k.titel,
    fach: k.fach,
    thema: k.thema,
    dauerMin: k.dauerMin,
    raum: k.raum,
    bildungsstufe: rahmen.stufe === OHNE_BILDUNGSSTUFE ? undefined : rahmen.stufe,
    anzahl: k.anzahl,
    vorwissen: labelOf(store, 'vorwissen', codeOf(store, 'vorwissen', k.vorwissen)) || k.vorwissen,
    sprachniveau: labelOf(store, 'sprachniveau', codeOf(store, 'sprachniveau', k.sprachniveau)) || k.sprachniveau,
    teilgruppen: gruppen.map((g) => ({ name: g.gruppe, anzahl: g.anzahl, beschreibung: g.profil })),
    ausgangslage: k.ausgangslage,
    hauptziel: k.hauptziel,
    einheit: k.einheit,
    phasen,
    nachweis: k.nachweis,
    hinweise: k.hinweise
  });
}
