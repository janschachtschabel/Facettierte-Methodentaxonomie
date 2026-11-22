import type { Arrangement, ArrangementNode, Baustein, CatalogBundle, EinsatzNode } from '@fmt/core';
import { getMainSequence } from './arrangementOps.js';

export interface LearnerGroup {
  id: string;
  label: string;
  profile: string;
  focus: 'basis' | 'regel' | 'vertiefung' | 'sprachsensibel' | 'custom';
  active: boolean;
}

export interface StepDiffSuggestion {
  groupId: string;
  groupLabel: string;
  measure: string;
  source: 'fmt-regel' | 'ki';
}

export interface OerResource {
  id: string;
  title: string;
  description: string;
  url: string;
  previewUrl?: string | null;
  license?: string | null;
  resourceType?: string | null;
  educationalContext?: string[];
  source: 'wlo' | 'manual';
}

export interface ScenarioPhaseRow {
  key: string;
  orderLabel: string;
  stepIndex: number;
  slotKennung?: string;
  isNestedSlot: boolean;
  parentName?: string;
  phaseLabel: string;
  durationMin: number;
  orientationRange?: string;
  methodId: string;
  methodName: string;
  methodRange: string;
  methodUrl: string;
  evidenceGrade: string | null;
  teacherRole: string;
  learnerRole: string;
  socialForm: string;
  environment: string;
  materials: string[];
  differentiation: StepDiffSuggestion[];
  oerResources: OerResource[];
  block?: Baustein;
}

export interface MaterialTypeOption {
  id: string;
  label: string;
  description: string;
}

export const MATERIAL_TYPES: MaterialTypeOption[] = [
  { id: 'auto', label: 'Automatisch (passend zur FMT-Methode)', description: 'Wählt den optimalen Materialtyp aus Lernfunktion & Methode' },
  { id: 'arbeitsblatt', label: 'Gestuftes Arbeitsblatt', description: 'Aufgaben in Basis-, Regel- und Vertiefungsniveau inkl. Lösungshinweisen' },
  { id: 'infoblatt', label: 'Strukturiertes Infoblatt', description: 'Kompakte Kernkonzepte, Beispiele & Leitfragen' },
  { id: 'quiz', label: 'Kurz-Quiz / Abruftest (ohne Notendruck)', description: 'Abruf- und Diagnosefragen inkl. Musterlösung & häufigen Fehlvorstellungen' },
  { id: 'checkliste', label: 'Schritt-für-Schritt-Checkliste / Leittext', description: 'Prozedurale Handlungsanleitung zur Selbstkontrolle' },
  { id: 'versuchsanleitung', label: 'Beobachtungs- / Versuchsanleitung', description: 'Vorhersage-, Durchführungs- und Auswertungsbogen' },
  { id: 'diskussionskarten', label: 'Diskussions- & Impulskarten', description: 'Rollen-, Leitfragen- oder Pro/Contra-Karten für Austauschphasen' },
  { id: 'glossar', label: 'Fachbegriffs-Glossar & Satzstarter', description: 'Sprachsensible Begriffsübersicht mit Formulierungshilfen' }
];

export const DEFAULT_LEARNER_GROUPS: LearnerGroup[] = [
  {
    id: 'basis',
    label: 'Basisunterstützung & Sprachsensibel',
    profile: 'Geringeres Vorwissen, Bedarf an visuellen Strukturhilfen, Satzstartern und kleinschrittigen Beispielen',
    focus: 'basis',
    active: true
  },
  {
    id: 'regel',
    label: 'Regelniveau (Hauptgruppe)',
    profile: 'Kernanforderung gemäß Lehrplan und FMT-Baustein',
    focus: 'regel',
    active: true
  },
  {
    id: 'vertiefung',
    label: 'Vertiefung & Leistungsstark',
    profile: 'Hohes Vorwissen, Bedarf an Transferaufgaben, offenen Problemen oder Experten-/Tutorrolle',
    focus: 'vertiefung',
    active: true
  }
];

export function detectMaterialTypeForBlock(b?: Baustein): string {
  if (!b) return 'arbeitsblatt';
  const fns = b.lernfunktion || [];
  if (b.kennung === 'vbe' || b.kennung === 'experiment' || b.piktogramm === 'experiment') return 'versuchsanleitung';
  if (fns.includes('diagnose') || b.kennung === 'abrufquiz' || b.kennung === 'exit-ticket' || b.kennung === 'brain-dump') {
    return 'quiz';
  }
  if (b.piktogramm === 'dialog' || b.piktogramm === 'debatte' || b.piktogramm === 'rolle' || b.ansatz.includes('diskurs')) {
    return 'diskussionskarten';
  }
  if (fns.includes('erwerb') && b.anleitung.includes('explizit')) return 'infoblatt';
  if ((b.aufgabe || []).includes('prozeduren')) return 'checkliste';
  return 'arbeitsblatt';
}

function summarizeTeacherRole(b: Baustein, labelOf: (s: string, c: string) => string): string {
  const roles = (b.rolle || [])
    .filter((r) => r !== 'ki-keine')
    .map((r) => labelOf('lehrkraftrolle', r));
  const step0 = b.durchfuehrung?.[0] ? ` · Einstieg: ${b.durchfuehrung[0]}` : '';
  return `${roles.length ? roles.join(', ') : 'Moderation & Begleitung'}${step0}`;
}

function summarizeLearnerRole(b: Baustein, labelOf: (s: string, c: string) => string): string {
  const eng = (b.engagement || []).map((e) => labelOf('engagement', e)).join(' / ');
  const restSteps = (b.durchfuehrung || []).slice(1, 3).join('; ');
  return `${eng || 'aktiv'}${restSteps ? ` · ${restSteps}` : ''}`;
}

export function buildDeterministicDiffHints(
  b: Baustein | undefined,
  groups: LearnerGroup[]
): StepDiffSuggestion[] {
  if (!b) return [];
  const active = groups.filter((g) => g.active);
  const adapt = new Set(b.adaptivitaet || []);
  const hints: StepDiffSuggestion[] = [];

  for (const g of active) {
    if (g.focus === 'basis' || g.focus === 'sprachsensibel') {
      const parts: string[] = [];
      if (b.anleitung.includes('offen')) {
        parts.push('Gestufte Hilfekarten / Lösungsanfang bereitstellen (geringes Vorwissen entlasten).');
      } else {
        parts.push('Satzstarter, Fachbegriffs-Karten und ein ausgearbeitetes Musterbeispiel zur Orientierung geben.');
      }
      if (b.variante?.[0]) parts.push(`Variante: ${b.variante[0]}.`);
      hints.push({ groupId: g.id, groupLabel: g.label, measure: parts.join(' '), source: 'fmt-regel' });
    } else if (g.focus === 'vertiefung') {
      const parts: string[] = [];
      if (adapt.has('diff-inhalt') || adapt.has('diff-tempo')) {
        parts.push('Weiterführende Transfer- oder Gegenbeispiel-Aufgabe für schnellere Lernende bereithalten.');
      } else if (b.interaktion.includes('partner') || b.interaktion.includes('kleingruppe')) {
        parts.push('Als Peer-Coach / Rückmelder mit Kriterienraster einsetzen oder eigene Kontrollaufgabe entwerfen lassen.');
      } else {
        parts.push('Zusatzimpuls: Verfahren begründen, auf neuen Kontext übertragen oder typische Fehlerquelle analysieren.');
      }
      hints.push({ groupId: g.id, groupLabel: g.label, measure: parts.join(' '), source: 'fmt-regel' });
    } else if (g.focus === 'regel') {
      const core = b.kernkomponente?.[0]?.name;
      hints.push({
        groupId: g.id,
        groupLabel: g.label,
        measure: core
          ? `Standard-Durchführung mit Fokus auf Kernkomponente „${core}“.`
          : 'Standard-Durchführung gemäß Methodenprofil.',
        source: 'fmt-regel'
      });
    } else {
      hints.push({
        groupId: g.id,
        groupLabel: g.label,
        measure: `Anpassung für ${g.label}: ${g.profile || 'Zeit-, Hilfe- oder Sozialform-Anpassung vorsehen.'}`,
        source: 'fmt-regel'
      });
    }
  }
  return hints;
}

export function buildScenarioRows(
  arrangement: Arrangement,
  bundle: CatalogBundle,
  blocksById: Map<string, Baustein>,
  labelOf: (schemeId: string, code: string) => string,
  groups: LearnerGroup[],
  aiDiffByStep: Record<string, StepDiffSuggestion[]>,
  oerByStep: Record<string, OerResource[]>,
  baseUrl = ''
): ScenarioPhaseRow[] {
  const { seq } = getMainSequence(arrangement);
  const kette = arrangement.zieltyp ? bundle.ketten.find((k) => k.id === arrangement.zieltyp) : null;
  const rows: ScenarioPhaseRow[] = [];
  const mainSteps = seq.teile.filter((t) => t && t.typ !== 'Wiederkehr');

  const gradeOf = (b?: Baustein): string | null => {
    if (!b?.evidenz?.length) return null;
    if (b.evidenz.some((e) => e.grad === 'A')) return 'A';
    if (b.evidenz.some((e) => e.grad === 'B')) return 'B';
    return 'C';
  };

  const makeRow = (
    key: string,
    orderLabel: string,
    stepIndex: number,
    phaseLabel: string,
    node: EinsatzNode,
    isNestedSlot: boolean,
    slotKennung?: string,
    parentName?: string
  ): ScenarioPhaseRow => {
    const b = blocksById.get(node.baustein);
    const social = (b?.interaktion || []).map((x) => labelOf('interaktion', x)).join(', ') || '–';
    const room = b?.raum || ((b?.raumzeit || []).map((x) => labelOf('raumzeit', x)).join(', ') || 'Klassenraum');
    const tech = b?.technik ? labelOf('technikbedarf', b.technik) : '';
    const diff = aiDiffByStep[key]?.length ? aiDiffByStep[key] : buildDeterministicDiffHints(b, groups);
    return {
      key,
      orderLabel,
      stepIndex,
      slotKennung,
      isNestedSlot,
      parentName,
      phaseLabel,
      durationMin: node.dauerMin ?? b?.dauerMin ?? 15,
      orientationRange: b ? `${b.dauerMin}–${b.dauerMax} min` : undefined,
      methodId: node.baustein,
      methodName: b?.name || node.baustein,
      methodRange: (b?.reichweite || '').toUpperCase(),
      methodUrl: `${baseUrl}/methoden/${node.baustein}`,
      evidenceGrade: gradeOf(b),
      teacherRole: b ? summarizeTeacherRole(b, labelOf) : 'Moderation',
      learnerRole: b ? summarizeLearnerRole(b, labelOf) : 'Bearbeitung',
      socialForm: social,
      environment: tech ? `${room} (${tech})` : room,
      materials: b?.material || [],
      differentiation: diff,
      oerResources: oerByStep[key] || [],
      block: b
    };
  };

  mainSteps.forEach((node: ArrangementNode, visIdx: number) => {
    const realIdx = seq.teile.indexOf(node);
    const chainStep = node.kettenschritt && kette ? kette.schritte.find((s) => s.id === node.kettenschritt) : null;
    const phaseLabel = chainStep ? `${chainStep.id.toUpperCase()} · ${chainStep.label}` : `Phase ${visIdx + 1}`;

    if (node.typ === 'Einsatz') {
      const parentBlock = blocksById.get(node.baustein);
      rows.push(makeRow(`step-${realIdx}`, `${visIdx + 1}`, realIdx, phaseLabel, node, false));
      (node.belegung || []).forEach((bel, si) => {
        if (bel.inhalt.typ === 'Einsatz') {
          const sl = parentBlock?.slot?.find((s) => s.kennung === bel.slotKennung);
          rows.push(
            makeRow(
              `step-${realIdx}-slot-${bel.slotKennung}`,
              `${visIdx + 1}.${si + 1}`,
              realIdx,
              `↳ Slot „${sl?.name || bel.slotKennung}“`,
              bel.inhalt,
              true,
              bel.slotKennung,
              parentBlock?.name || node.baustein
            )
          );
        }
      });
    } else if (node.typ === 'Alternative') {
      (node.optionen || []).forEach((opt, oi) => {
        if (opt.typ === 'Einsatz') {
          rows.push(
            makeRow(
              `step-${realIdx}-alt-${oi}`,
              `${visIdx + 1}${String.fromCharCode(97 + oi)}`,
              realIdx,
              `${phaseLabel} · Zweig ${oi + 1} (${node.kriterium || 'Differenzierung'})`,
              opt,
              false
            )
          );
        }
      });
    }
  });

  if (arrangement.ablauf.typ === 'Parallel' && Array.isArray(arrangement.ablauf.begleitend)) {
    arrangement.ablauf.begleitend.forEach((n, bi) => {
      if (n.typ === 'Einsatz') {
        rows.push(makeRow(`parallel-${bi}`, '═', -1, 'Begleitstrang (Parallel)', n, false));
      }
    });
  }

  const wk = seq.teile.find((t) => t.typ === 'Wiederkehr');
  if (wk && wk.typ === 'Wiederkehr') {
    const b = blocksById.get(wk.baustein);
    rows.push({
      key: 'wiederkehr',
      orderLabel: '◆',
      stepIndex: seq.teile.indexOf(wk),
      isNestedSlot: false,
      phaseLabel: `Verteilte Wiederkehr (${wk.anzahl}×, Abstand ${wk.abstand || 'P2D'})`,
      durationMin: (wk.dauerMin ?? b?.dauerMin ?? 6) * wk.anzahl,
      orientationRange: b ? `je ${b.dauerMin}–${b.dauerMax} min` : undefined,
      methodId: wk.baustein,
      methodName: b?.name || wk.baustein,
      methodRange: (b?.reichweite || 'r1').toUpperCase(),
      methodUrl: `${baseUrl}/methoden/${wk.baustein}`,
      evidenceGrade: gradeOf(b),
      teacherRole: 'Verteilte Abruftermine ansetzen und kurz auswerten',
      learnerRole: b ? summarizeLearnerRole(b, labelOf) : 'Wiederholter Abruf',
      socialForm: (b?.interaktion || []).map((x) => labelOf('interaktion', x)).join(', ') || 'Einzelarbeit',
      environment: b?.raum || 'Klassenraum',
      materials: b?.material || [],
      differentiation: buildDeterministicDiffHints(b, groups),
      oerResources: oerByStep['wiederkehr'] || [],
      block: b
    });
  }

  return rows;
}

/**
 * IMS-LD-inspired Neutral Learning Scenario linking didactic sequence,
 * actors, differentiation, OER resources, and canonical FMT methods.
 */
export interface NeutralLearningScenario {
  '@type': 'NeutralLearningScenario';
  schemaVersion: '1.3-fmt-imsld';
  license: string;
  metadata: {
    title: string;
    subject: string;
    topic: string;
    educationalLevel: string;
    priorKnowledge: string;
    granularity: string;
    chain: string;
    totalDurationMin: number;
    timeBudgetMin?: number;
    createdAt: string;
  };
  actors: Array<{
    id: string;
    name: string;
    type: 'Lehrkraft' | 'Lerngruppe';
    profile: string;
  }>;
  learning_sequences: Array<{
    sequence_id: string;
    sequence_name: string;
    phases: Array<{
      phase_id: string;
      order: string;
      phase_name: string;
      nested_in?: string;
      duration_min: number;
      orientation_range?: string;
      fmt_method: {
        kennung: string;
        name: string;
        reichweite: string;
        database_url: string;
        evidence_grade: string | null;
        lernfunktion: string[];
        anleitung: string[];
        engagement: string[];
        adaptivitaet: string[];
        durchfuehrung: string[];
        kernkomponenten: string[];
        quellen: Array<{ titel: string; url?: string; lizenz?: string }>;
      };
      roles: {
        lehrkraft: string;
        lernende: string;
        sozialform: string;
      };
      environment: {
        raum_und_technik: string;
        materialien: string[];
        oer_ressourcen: OerResource[];
      };
      differentiation: StepDiffSuggestion[];
    }>;
  }>;
  fmt_arrangement: Arrangement;
}

export function buildNeutralLearningScenario(
  arrangement: Arrangement,
  rows: ScenarioPhaseRow[],
  groups: LearnerGroup[],
  meta: { fach: string; thema: string; totalDurationMin: number; labelOf: (s: string, c: string) => string }
): NeutralLearningScenario {
  return {
    '@type': 'NeutralLearningScenario',
    schemaVersion: '1.3-fmt-imsld',
    license: 'https://creativecommons.org/licenses/by/4.0/',
    metadata: {
      title: meta.thema ? `${arrangement.name} – ${meta.thema}` : arrangement.name,
      subject: meta.fach,
      topic: meta.thema,
      educationalLevel: arrangement.kontext?.bildungsstufe
        ? meta.labelOf('bildungsstufe', arrangement.kontext.bildungsstufe)
        : 'nicht angegeben',
      priorKnowledge: arrangement.kontext?.vorwissen
        ? meta.labelOf('vorwissen', arrangement.kontext.vorwissen)
        : 'nicht angegeben',
      granularity: arrangement.reichweite.toUpperCase(),
      chain: arrangement.zieltyp || 'Freier Ablauf',
      totalDurationMin: meta.totalDurationMin,
      timeBudgetMin: arrangement.kontext?.zeitbudgetMin,
      createdAt: new Date().toISOString()
    },
    actors: [
      {
        id: 'actor-lehrkraft',
        name: 'Lehrkraft',
        type: 'Lehrkraft',
        profile: 'Planung, Moderation, Scaffolding, Feedback & Sicherung'
      },
      ...groups
        .filter((g) => g.active)
        .map((g) => ({
          id: `actor-${g.id}`,
          name: g.label,
          type: 'Lerngruppe' as const,
          profile: g.profile
        }))
    ],
    learning_sequences: [
      {
        sequence_id: 'seq-main',
        sequence_name: arrangement.name,
        phases: rows.map((r) => ({
          phase_id: r.key,
          order: r.orderLabel,
          phase_name: r.phaseLabel,
          ...(r.parentName ? { nested_in: r.parentName } : {}),
          duration_min: r.durationMin,
          ...(r.orientationRange ? { orientation_range: r.orientationRange } : {}),
          fmt_method: {
            kennung: r.methodId,
            name: r.methodName,
            reichweite: r.methodRange,
            database_url: r.methodUrl,
            evidence_grade: r.evidenceGrade,
            lernfunktion: r.block?.lernfunktion || [],
            anleitung: r.block?.anleitung || [],
            engagement: r.block?.engagement || [],
            adaptivitaet: r.block?.adaptivitaet || [],
            durchfuehrung: r.block?.durchfuehrung || [],
            kernkomponenten: (r.block?.kernkomponente || []).map((k) => k.name),
            quellen: (r.block?.quellen || []).map((q) => ({ titel: q.titel, url: q.url, lizenz: q.lizenz }))
          },
          roles: {
            lehrkraft: r.teacherRole,
            lernende: r.learnerRole,
            sozialform: r.socialForm
          },
          environment: {
            raum_und_technik: r.environment,
            materialien: r.materials,
            oer_ressourcen: r.oerResources
          },
          differentiation: r.differentiation
        }))
      }
    ],
    fmt_arrangement: arrangement
  };
}
