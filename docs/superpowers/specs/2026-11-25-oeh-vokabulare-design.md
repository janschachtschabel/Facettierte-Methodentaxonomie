# OEH/WLO-Vokabulare in der Methodenzuordnung – Entscheidung

Stand: 2026-11-25 · Geprüft: `discipline` (Schulfächer, 70), `hochschulfaechersystematik` (Destatis, 344),
`educationalContext` (Bildungsstufe, 12), `intendedEndUserRole` (Zielgruppe, 7).

## Frage

Helfen fertige Vokabulare für Bildungsstufe, Schulfach und Hochschulfach, oder bringen sie Verzerrungen?

## Entscheidung

| Vokabular | Nutzung | Begründung |
| --- | --- | --- |
| Schulfächer | Erkennungs- und Mapping-Schicht: Fach im Text → Fachbereich und OEH-Kennung | 70 Fächer an 289 Methoden ergäben dünn und ungleich besetzte Angaben. Was getaggt ist, würde bevorzugt, der Rest benachteiligt. Die Methode hängt am Fachbereich, nicht am Einzelfach. |
| Hochschulfächer | wie Schulfächer, nur bei Hochschulbezug gelesen | 344 Einträge, für Methoden viel zu fein. Als Erkennung schließt es die Lücke bei Hochschulanfragen. |
| Bildungsstufe | bleibt wie sie ist (sechs Werte mit `closeMatch` auf OEH) | Schon abgeglichen. Elementarbereich und Förderschule werden nicht ergänzt. |
| Zielgruppe | nicht an Methoden | Beschreibt, für wen ein Material ist (Lehrkraft, Lernende, Eltern). Eine Methode wird immer von Lehrenden geplant. Nutzbar wäre es nur als Filter der WLO-Suche. |

## Umsetzung (nur Erkennung, keine Angabe an Methoden)

- `data/crosswalk/oeh-faecher.json`: alle Schul- und Hochschulfächer mit OEH-Kennung, Bezeichnung und FMT-Fachbereich.
  Studienfächer erben vom Studienbereich, 5 Fächer weichen ab. Liste zur Durchsicht:
  `docs/datenpflege/2026-11-25-oeh-fachzuordnung.md`.
- `packages/fmt-core/src/fach.ts`: `createSubjectDetector()` liest das Fach aus dem Text. Ein Fachwort zählt nur,
  wenn der Text es als Fach rahmt: neben Klasse, Kurs oder Niveau („Geschichte Klasse 7“, „Spanisch A1“), als
  Zusammensetzung („Musikunterricht“, „Informatik-AG“), als eigener Abschnitt („…, Mathematik, …“, „Physik: Dichte“)
  oder nach einem Veranstaltungswort („Seminar Soziale Arbeit, …“). Ein Fachwort im Thema („Politik der Weimarer
  Republik“, „die Chemie stimmt nicht“) zählt nicht. Hochschulfächer werden nur bei Bildungsstufe Hochschule gelesen.
- Ein so erkanntes Fach bestimmt den Fachbereich und geht den älteren Textregeln vor. Diese bleiben für Texte ohne
  gerahmtes Fach bestehen. Ein ausdrücklich übergebener Fachbereich gewinnt weiterhin.
- Ergebnis von `zuordnen()` und `lesen()` nennt `fach` (Quelle, Kennung, URI, Bezeichnung, Fachbereich).
  `/api/v1/classify` gibt `fach` aus, `/api/v1/plan` und `build_scenario_plan` geben `fachErkannt` aus.
- Die WLO-Suche löst Fachnamen über das Vokabular auf statt über eine Liste mit 30 Einträgen.

## Bekannte Grenzen

- Zwei Quellen für den Fachbereich (Textregeln und Vokabular). Das gerahmte Fach aus dem Vokabular hat Vorrang.
- Veranstaltungstitel wie „Statistik für Psychologen“ rahmen das Fach nicht und bleiben unerkannt.
- „Naturwissenschaften“ und „Nawi“ laufen unter dem OEH-Eintrag MINT. Für „Technik“ als Schulfach gibt es keinen OEH-Eintrag.
- Themenwörter ohne Fachnamen („Bruchrechnen“) ergeben weiterhin keinen Fachbereich.
- Die Zuordnung einzelner Studienbereiche ist eine Setzung (z. B. Geographie → Gesellschaft, Medizin → Naturwissenschaft und Technik).

## Entschieden und offen

1. Bildungsstufe: Es bleibt bei sechs Stufen. Elementarbereich und Förderschule werden nicht ergänzt (Entscheidung vom 2026-11-25).
2. Offen: Zielgruppe als Filter der WLO-Suche (Material für Lernende oder für Lehrkräfte), nicht als Angabe an Methoden.
