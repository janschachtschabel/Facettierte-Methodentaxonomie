import type { RuleBasis, RuleMeta } from './types.js';

export const FMT_RULES: RuleMeta[] = [
  { id: 'R-00', prueft: 'Bekannte Bausteine und Knotentypen', schwere: 'Fehler', grundlage: 'formal', begruendung: 'Konsistenz der Daten' },
  { id: 'R-01', prueft: 'Schachtelung: Inhalt hat kleinere Reichweite als Behälter und Slot', schwere: 'Fehler', grundlage: 'formal', begruendung: 'Folgt aus der Reichweiten-Hierarchie' },
  { id: 'R-02', prueft: 'Slot-Passung: Lernfunktion des Inhalts passt zum Slot', schwere: 'Fehler', grundlage: 'formal', begruendung: 'Typisierung der Slots' },
  { id: 'R-03', prueft: 'Anschluss: Vorbedingungen sind beim Einsatz erfüllt', schwere: 'Fehler', grundlage: 'S', begruendung: 'Zwischenwissen bestimmt die Folgephase (Loibl et al. 2024). Die Lernzustände selbst sind nicht empirisch geeicht.' },
  { id: 'R-04', prueft: 'Funktionsdeckung: Alle Zielzustände der Kette werden erreicht; jeder Kettenschritt trägt einen Baustein mit passender Lernfunktion', schwere: 'Fehler', grundlage: 'S', begruendung: 'Lehrfunktionen und Basismodelle (Klauer & Leutner 2012; Oser & Baeriswyl 2001). Als Gesamtabfolge nicht auf Wirkung geprüft.' },
  { id: 'R-05', prueft: 'Konsolidierungspflicht: Auf offene Phasen folgt eine Sicherung', schwere: 'Fehler', grundlage: 'E', begruendung: 'Belegt für Entdecken ohne Unterstützung und für Problemlösen vor Instruktion (Alfieri et al. 2011; Sinha & Kapur 2021). Auf jede offene Phase verallgemeinert.' },
  { id: 'R-06', prueft: 'Eignung: Baustein passt zu Vorwissen und Bildungsstufe', schwere: 'Warnung', grundlage: 'E', begruendung: 'Expertise-Reversal (Tetzlaff et al. 2025); Alterseffekt bei Problemlösen vor Instruktion (Sinha & Kapur 2021)' },
  { id: 'R-07', prueft: 'Verteilung: Konsolidierungsziele sollten verteilt wiederholt werden', schwere: 'Warnung', grundlage: 'E', begruendung: 'Verteilte Wiederholung verbessert das Behalten (Cepeda et al. 2006). Abruf wirkt auch einmalig (Yang et al. 2021), deshalb nur eine Warnung.' },
  { id: 'R-08', prueft: 'Moduswechsel: höchstens 20 Minuten am Stück passiv', schwere: 'Warnung', grundlage: 'A', begruendung: 'Setzung. Für die Schwelle von 20 Minuten gibt es keinen Beleg.' },
  { id: 'R-09', prueft: 'Zeit: Dauern im Rahmen, Budget eingehalten', schwere: 'Warnung', grundlage: 'formal', begruendung: 'Rechnerische Prüfung' },
  { id: 'R-10', prueft: 'Kernkomponenten: Weglassen entzieht die Bezeichnung', schwere: 'Fehler', grundlage: 'S', begruendung: 'Regel für die Bezeichnung. Dass ohne Kernkomponente auch die Wirkung entfällt, ist nur für einzelne Methoden belegt.' },
  { id: 'R-11', prueft: 'Pflichtslots sind belegt; ein Kompositbaustein wirkt nur über die Bausteine in seinen Slots', schwere: 'Warnung', grundlage: 'formal', begruendung: 'Folgt aus der Slot-Struktur' },
  { id: 'R-12', prueft: 'Verweise sind auflösbar und nicht zirkulär', schwere: 'Warnung / Fehler', grundlage: 'formal', begruendung: 'Konsistenz der Daten' }
];

const BASIS_MAP = new Map<string, RuleBasis>(FMT_RULES.map((r) => [r.id, r.grundlage]));

export function ruleBasisOf(regel: string): RuleBasis {
  return BASIS_MAP.get(regel) ?? 'formal';
}

export const FMT_GUARDRAILS: readonly string[] = [
  'Der Prüfer ist ein struktureller Filter – ein gültiger Ablauf ist kein Qualitätsurteil über die Durchführung.',
  'Jede Regelmeldung weist aus, ob sie formal, empirisch belegt [E], gefolgert [S] oder gesetzt [A] ist.',
  'Werte hoch-inferenter Facetten (A1, D1) sind didaktische Einschätzungen, keine objektiven Tatsachen.',
  'Evidenzbefunde gelten immer nur mit ihrer genannten Geltung und Gegenposition; die didaktische Entscheidung bleibt bei der Lehrkraft.'
] as const;
