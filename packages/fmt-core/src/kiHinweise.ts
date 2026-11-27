/**
 * Guide for an AI that calls the FMT server (MCP server instructions). One text for the MCP server and the web page
 * "API & MCP", so both always say the same.
 */

/** Required details for a plan, as the calling AI should ask its user for them. */
export const KI_PFLICHTANGABEN = 'Bildungsstufe, Fach und Thema, Zeit, Gruppengröße, Raum, Ziel bzw. Zielart';
/** Optional details that change the plan when the user knows them. */
export const KI_OPTIONALE_ANGABEN =
  'Vorwissen, Sprachniveau, Komplexität, Teilgruppen mit Merkmalen, Begleitziel, Planungsprofil, Termine, Nachweis, Lehrende';

/** Server instructions for the calling AI: what to ask its user, how to read the answer, what never to do. Kept short. */
export const MCP_HINWEISE = [
  'FMT-Methodendatenbank: Der Server wählt Methoden deterministisch aus dem Katalog. Du wählst keine Methoden selbst und erfindest keine.',
  '',
  'Erfrage beim Nutzer grob, was er noch nicht gesagt hat:',
  `- nötig: ${KI_PFLICHTANGABEN} (Ziel: was die Lernenden danach können sollen).`,
  `- wenn bekannt: ${KI_OPTIONALE_ANGABEN} (z. B. Teamteaching).`,
  'Teilgruppen beschreibst du als Gruppe mit Anzahl und Merkmal (z. B. „4 Kinder lesen noch nicht“, „5 DaZ“), nie als einzelne Person.',
  '',
  'Ablauf:',
  '1. Den Text des Nutzers an classify_scenario_text, match_scenario oder build_scenario_plan geben; klar genannte Angaben zusätzlich als Felder.',
  '2. pflichtangaben.fehlt lesen. Fehlt etwas, stelle eine kurze Frage nach genau diesen Angaben und rufe danach mit den Antworten als Feldern erneut auf (ziel → zielart, fach-und-thema → fach und thema, bildungsstufe, anzahl → gruppe, raum, zeit → zeitMin). Optionales nur nachfragen, wenn es der Nutzer andeutet; kein Formular.',
  '   Kann oder will der Nutzer nicht antworten, plane trotzdem weiter und nenne die Annahmen aus pflichtangaben.angenommen.',
  '3. pflichtangaben.angenommen dem Nutzer als Annahme nennen (Feld, Wert, Grund), damit er sie korrigieren kann.',
  '4. regelmeldungen und hinweise mit ihrer Grundlage weitergeben; teilgruppenMethoden, zusatzphasen und begleitstrang sind Vorschläge zum Übernehmen, kein geänderter Plan.',
  '',
  'Für deine Antwort:',
  '- Methoden, Reihenfolge, Dauer und Kernkomponenten kommen aus dem Katalog und bleiben so.',
  '- Kennzeichne, was aus dem Katalog übernommen und was von dir erzeugt ist (Aufgaben, Beispiele, Formulierungen).',
  '- Wirkungsaussagen nur aus dem Katalog, mit Evidenzgrad, Geltung und Bezug.',
  '- Beschreibe Gruppen, keine einzelnen Lernenden; keine Namen, keine Diagnosen.'
].join('\n');
