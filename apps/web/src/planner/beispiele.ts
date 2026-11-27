import type { MehrAngaben } from './mehrAngaben.js';

/**
 * An example of step 1: a request, not a flow. Applying it fills the fields of step 1 and asks the core for a
 * proposal, so the chain follows from the goal kind and every check of the matcher applies (needs, binding, fit
 * rules, required details). It names no method and no chain.
 */
export interface BeispielAnfrage {
  id: string;
  label: string;
  fach: string;
  thema: string;
  text: string;
  /** Ids of the didactic approaches of step 1 (chips). */
  ansatz: string[];
  lernziele: string;
  problemstellung: string;
  /** "Mehr Angaben" of the example (codes of matcher.felder()). */
  mehr: MehrAngaben;
}

export const BEISPIEL_ANFRAGEN: BeispielAnfrage[] = [
  {
    id: 'mathe-bruch',
    label: 'Mathe · Bruchrechnen (90 min)',
    fach: 'Mathematik',
    thema: 'Addition und Subtraktion von Brüchen',
    text: 'Mathematik Bruchrechnen Doppelstunde Klasse 6, 90 Minuten, geringes Vorwissen',
    ansatz: ['instruktionsorientiert'],
    lernziele:
      '1. Gleichnamige und ungleichnamige Brüche sicher addieren\n2. Rechenschritte begründen und typische Fehler (Nenner addieren) erkennen',
    problemstellung:
      'Viele Lernende addieren Zähler und Nenner getrennt; schrittweise Lösungsbeispiele mit Fading beugen diesem Fehlkonzept vor.',
    mehr: { bildungsstufe: 'sek1', vorwissen: 'gering', zeitMin: 90 }
  },
  {
    id: 'physik-dichte',
    label: 'Physik · Dichte (Reihe, 270 min)',
    fach: 'Physik',
    thema: 'Dichte von Stoffen',
    text: 'Unterrichtsreihe Physik Klasse 7: das Konzept Dichte verstehen, wenig Vorwissen, 270 Minuten, ohne Geräte',
    ansatz: ['forschend'],
    lernziele:
      '1. Masse und Volumen als unabhängige Größen unterscheiden\n2. Dichte als Stoffkonstante berechnen und auf Schwimmen/Sinken anwenden',
    problemstellung:
      'Fehlvorstellung „schwere Dinge sinken immer“ – Vorhersage-Beobachtung-Erklärung macht das Alltagskonzept sichtbar.',
    mehr: { bildungsstufe: 'sek1', vorwissen: 'gering', zeitMin: 270 }
  },
  {
    id: 'bio-oekosystem',
    label: 'Biologie · Ökosystem Wald (5E, 135 min)',
    fach: 'Biologie',
    thema: 'Ökosystem Wald & Nahrungsnetze',
    text: 'Biologie Klasse 8 forschend 5E Ökosystem Wald, 135 Minuten, mittleres Vorwissen',
    ansatz: ['forschend', 'kooperativ'],
    lernziele:
      '1. Produzenten, Konsumenten und Destruenten in Nahrungsnetzen vernetzen\n2. Folgen von Störungen im Ökosystem hypothesengeleitet untersuchen',
    problemstellung: 'Abstrakte Stoffkreisläufe bleiben oft träges Wissen ohne eigene Erkundungs- und Erklärungsphase.',
    mehr: { bildungsstufe: 'sek1', vorwissen: 'mittel', zeitMin: 135 }
  },
  {
    id: 'deutsch-arg',
    label: 'Deutsch · Argumentieren (90 min)',
    fach: 'Deutsch',
    thema: 'Überzeugend argumentieren & Debatte',
    text: 'Deutsch Sekundarstufe I Doppelstunde 90 Minuten Argumentation und Problemlösen, mittleres Vorwissen',
    ansatz: ['diskursiv', 'kooperativ'],
    lernziele: '1. These, Argument und Beispiel klar strukturieren\n2. Gegenargumente fair aufgreifen und entkräften',
    problemstellung:
      'Meinungen werden häufig ohne Beleg geäußert; strukturierte Austausch- und Vergleichsphasen schärfen die Argumentationsqualität.',
    mehr: { bildungsstufe: 'sek1', vorwissen: 'mittel', zeitMin: 90 }
  },
  {
    id: 'gesch-demokratie',
    label: 'Politik · Demokratie & DaZ (135 min)',
    fach: 'Politik',
    thema: 'Gewaltenteilung & Demokratie',
    text: 'Politik Klasse 9 Faktenwissen und Verständnis Gewaltenteilung, 135 Minuten, wenig Vorwissen, mehrere DaZ-Kinder',
    ansatz: ['kooperativ'],
    lernziele:
      '1. Legislative, Exekutive und Judikative sicher zuordnen\n2. Kontrollmechanismen an einem aktuellen Fallbeispiel erläutern',
    problemstellung:
      'Institutionenkunde wirkt trocken, wenn Fachbegriffe nicht aktiv abgerufen und sprachsensibel (DaZ) an konkreten Fällen gesichert werden.',
    mehr: { bildungsstufe: 'sek1', vorwissen: 'gering', zeitMin: 135 }
  },
  {
    id: 'grundschule-sach',
    label: 'Grundschule · Wasserkreislauf (45 min)',
    fach: 'Sachunterricht',
    thema: 'Der Wasserkreislauf im Alltag',
    text: 'Grundschule Klasse 3 Sachunterricht Einzelstunde 45 Minuten Konzept Wasserkreislauf verstehen, geringes Vorwissen, ohne Internet',
    ansatz: ['kooperativ', 'spielerisch'],
    lernziele:
      '1. Verdunstung, Kondensation und Niederschlag in einfachen Worten benennen\n2. Den Kreislauf an einer Skizze gemeinsam erklären',
    problemstellung: 'Kinder kennen Regen und Pfützen, verbinden sie aber selten zu einem geschlossenen Kreislauf.',
    mehr: { bildungsstufe: 'primar', vorwissen: 'gering', zeitMin: 45 }
  },
  {
    id: 'berufsschule-auftrag',
    label: 'Berufsschule · Kundenauftrag (Lernfeld, 90 min)',
    fach: 'Elektrotechnik',
    thema: 'Kundenauftrag Elektroinstallation',
    text: 'Berufsschule, Lernfeld 3: Lernsituation Kundenauftrag für eine Elektroinstallation, 90 Minuten, mittleres Vorwissen',
    ansatz: ['handlungsorientiert'],
    lernziele:
      '1. Einen Kundenauftrag erfassen, planen und die Ausführung begründen\n2. Das eigene Vorgehen an Kriterien bewerten',
    problemstellung:
      'Auszubildende arbeiten Aufträge oft ab, ohne Planung und Bewertung als eigene Schritte zu sehen; die vollständige Handlung macht sie sichtbar.',
    mehr: { bildungsstufe: 'berufsbildung', vorwissen: 'mittel', zeitMin: 90 }
  }
];
