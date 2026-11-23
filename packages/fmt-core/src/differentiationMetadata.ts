export type MeasureLevel = 'unterricht-sofort' | 'material-planung' | 'organisation-system';
export type MeasureEffort = 'sofort' | 'kurz' | 'mittel';
export type MeasureTech = 'analog' | 'projektion' | 'digital' | 'online';

export interface MeasureEnrichment {
  ebene: MeasureLevel;
  aufwand: MeasureEffort;
  technik: MeasureTech;
  /** Passende FMT-Lernfunktionen (leer = phasenübergreifend einsetzbar) */
  phasen: string[];
  /** Brücke zu validierten FMT-Facetten (Format "<schemeId>:<codeId>") */
  fmtBruecke: string[];
  /** Konkreter, praxisnaher 1-Satz-Umsetzungsimpuls für Lehrkraft & Client-LLM */
  umsetzungsimpuls: string;
}

/**
 * Category-level curated metadata across all 40 categories of the 172 differentiation measures.
 * Individual measure overrides below refine specific items (especially system/digital/analog distinctions).
 * License: CC BY 4.0 (Jan Schachtschabel).
 */
const CATEGORY_DEFAULTS: Record<string, MeasureEnrichment> = {
  // 1. Lernziele & Leistungsniveaus
  zieltypen: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['orientierung', 'konsolidierung', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-inhalt', 'feedback:bn-kriterial'],
    umsetzungsimpuls: 'Unterscheide verbindliche Kernziele für alle von Wahl- oder Vertiefungszielen und mache diese zu Stundenbeginn transparent.'
  },
  zielniveau: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['erwerb', 'konsolidierung', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-inhalt', 'adaptivitaet:diff-produkt'],
    umsetzungsimpuls: 'Formuliere Aufgaben in klar erkennbaren Anforderungsstufen (Basis, Regel, Vertiefung) am selben Kernthema.'
  },
  zielbestimmung: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['orientierung', 'metakognition'],
    fmtBruecke: ['anleitung:geleitet', 'feedback:selbstregulationsebene'],
    umsetzungsimpuls: 'Kläre das Stundenziel zu Beginn kurz und verständlich und lass Lernende ihren persönlichen Schwerpunkt markieren.'
  },
  'kompetenzfokus-fachlich': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['verstehen', 'anwendung', 'konsolidierung'],
    fmtBruecke: ['adaptivitaet:diff-produkt', 'engagement:konstruktiv'],
    umsetzungsimpuls: 'Richte die Aufgabenstellung gezielt auf den passenden Kompetenzschwerpunkt (Grundlagen, Anwendung, Kommunikation oder Selbstständigkeit) aus.'
  },
  'kompetenzfokus-kognitiv': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['verstehen', 'problemloesen', 'anwendung'],
    fmtBruecke: ['engagement:konstruktiv', 'adaptivitaet:diff-inhalt'],
    umsetzungsimpuls: 'Staffele die kognitiven Operatoren vom Sichern/Reproduzieren über Reorganisieren bis zu Transfer- und Problemlöseimpulsen.'
  },

  // 2. Inhalte und Themen
  themenwahl: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['orientierung', 'erwerb', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-inhalt', 'adaptivitaet:udl'],
    umsetzungsimpuls: 'Sichere ein gemeinsames Kernthema für alle und biete daneben kurze thematische Vertiefungs- oder Wahlbeispiele an.'
  },
  schwerpunkte: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['erwerb', 'verstehen', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-inhalt', 'repraesentation:enaktiv'],
    umsetzungsimpuls: 'Verknüpfe zentrale Grundlagen mit wählbaren Praxis- oder Vertiefungsschwerpunkten am selben Unterrichtsgegenstand.'
  },
  'tiefe-breite': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['erwerb', 'verstehen'],
    fmtBruecke: ['adaptivitaet:diff-inhalt', 'anleitung:geleitet'],
    umsetzungsimpuls: 'Reduziere für die Basisgruppe auf Schlüsselkonzepte mit klarem Überblick und öffne für Fortgeschrittene tiefere Zusammenhänge.'
  },
  interessengeleitet: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['orientierung', 'anwendung'],
    fmtBruecke: ['adaptivitaet:udl', 'engagement:konstruktiv'],
    umsetzungsimpuls: 'Binde lebensweltnahe Beispiele aus dem Alltag der Lerngruppe ein oder lass zwischen 2–3 thematischen Kontexten wählen.'
  },

  // 3. Aufgaben
  komplexitaet: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['verstehen', 'konsolidierung', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-inhalt', 'adaptivitaet:diff-prozess'],
    umsetzungsimpuls: 'Biete Aufgaben in gestufter Komplexität (★ Basis, ★★ Regel, ★★★ Transfer) mit klarer Einstiegsempfehlung an.'
  },
  umfang: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['konsolidierung', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-tempo', 'adaptivitaet:diff-produkt'],
    umsetzungsimpuls: 'Trenne klar zwischen verbindlichen Pflichtaufgaben (Kern) und freiwilligen Zusatz-/Sternchenaufgaben für schnelle Lernende.'
  },
  offenheit: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['verstehen', 'problemloesen', 'anwendung'],
    fmtBruecke: ['anleitung:geleitet', 'adaptivitaet:diff-prozess'],
    umsetzungsimpuls: 'Steuere den Öffnungsgrad gezielt: kleinschrittig-detaillierte Leitfragen für Orientierungsbedarf, offenere Problemstellungen für Fortgeschrittene.'
  },
  aufgabentypen: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['konsolidierung', 'anwendung', 'problemloesen'],
    fmtBruecke: ['engagement:konstruktiv', 'adaptivitaet:diff-produkt'],
    umsetzungsimpuls: 'Kombiniere grundlegende Übungsaufgaben mit Transfer-, Problemlöse- oder Kreativaufgaben am selben Lernziel.'
  },
  modifikation: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['verstehen', 'konsolidierung', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-prozess', 'adaptivitaet:udl'],
    umsetzungsimpuls: 'Lege optionale Hilfekarten, Lösungsbeispiele oder alternative Zugangswege bereit, die Lernende bei Bedarf selbstständig abrufen.'
  },

  // 4. Lernmaterialien und Medien
  medienformate: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['orientierung', 'erwerb', 'verstehen'],
    fmtBruecke: ['repraesentation:ikonisch', 'adaptivitaet:udl'],
    umsetzungsimpuls: 'Stelle zentrale Inhalte multimodal bereit (z. B. Bild/Skizze, kurzes Beispiel oder handelndes Anschauungsmaterial neben dem Text).'
  },
  'komplexitaet-struktur': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['erwerb', 'verstehen', 'konsolidierung'],
    fmtBruecke: ['anleitung:explizit', 'adaptivitaet:diff-prozess'],
    umsetzungsimpuls: 'Gliedere Arbeitsblätter klar in nummerierte Arbeitsschritte, hebe Schlüsselbegriffe hervor und stelle für Fortgeschrittene ungestützte Varianten bereit.'
  },
  authentizitaet: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['erwerb', 'verstehen', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-inhalt', 'repraesentation:symbolisch'],
    umsetzungsimpuls: 'Biete sprachlich entlastete, didaktisch aufbereitete Fassungen für die Basisgruppe und authentische Originalquellen für Leistungsstarke an.'
  },
  zugaenglichkeit: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['erwerb', 'verstehen', 'konsolidierung'],
    fmtBruecke: ['adaptivitaet:udl', 'repraesentation:ikonisch'],
    umsetzungsimpuls: 'Achte auf barrierefreie Gestaltung (klare Schrift, hoher Kontrast, Worterklärungen/mehrsprachiges Glossar) für alle Lernenden.'
  },

  // 5. Methoden und Lernwege
  'struktur-lehrersteuerung': {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['orientierung', 'erwerb', 'verstehen'],
    fmtBruecke: ['anleitung:explizit', 'adaptivitaet:mikro'],
    umsetzungsimpuls: 'Dosier den Lenkungsgrad phasenweise: klar angeleiteter Einstieg mit Modellierung, danach schrittweise Öffnung nach Lernstand.'
  },
  aktivitaetsgrad: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['erwerb', 'verstehen', 'anwendung'],
    fmtBruecke: ['engagement:aktiv', 'engagement:konstruktiv'],
    umsetzungsimpuls: 'Aktiviere Lernende unmittelbar mit kurzen, greifbaren Aufträgen (markieren, sortieren, skizzieren, selbst konstruieren) statt langer Passivphasen.'
  },
  'methodik-lernprozess': {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['verstehen', 'problemloesen', 'anwendung'],
    fmtBruecke: ['engagement:interaktiv', 'interaktion:kleingruppe-kooperativ'],
    umsetzungsimpuls: 'Verbinde strukturierte kooperative oder handlungsorientierte Arbeitsphasen mit klaren Rollen und greifbaren Zwischenergebnissen.'
  },
  'methodische-varianten': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['erwerb', 'verstehen', 'problemloesen'],
    fmtBruecke: ['anleitung:geleitet', 'engagement:konstruktiv'],
    umsetzungsimpuls: 'Wähle für die Kernphase die passende methodische Grundform (direkte Modellierung bei niedrigem, entdeckend/problembasiert bei höherem Vorwissen).'
  },

  // 6. Sozialformen
  sozialform: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['orientierung', 'verstehen', 'konsolidierung', 'anwendung'],
    fmtBruecke: ['interaktion:partner', 'adaptivitaet:mikro'],
    umsetzungsimpuls: 'Wechsle gezielt zwischen ruhiger Einzeldenkzeit, sicherem Tandem-Abgleich und klar strukturierten Gruppenphasen.'
  },

  // 7. Lernzeit und Lerntempo
  zeitstrukturen: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['konsolidierung', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-tempo', 'adaptivitaet:mikro'],
    umsetzungsimpuls: 'Plane sichtbare Zeitanker und Puffer ein (z. B. kurze 5–10-Min-Takte mit Zwischensicherung und Erweiterungsaufgaben für Schnelle).'
  },
  bearbeitungszeit: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['konsolidierung', 'anwendung', 'diagnose'],
    fmtBruecke: ['adaptivitaet:diff-tempo'],
    umsetzungsimpuls: 'Ermögliche individuelles Arbeitstempo durch verbindlichen Kernumfang plus direkt anschließende Vertiefungsstationen ohne Leerlauf.'
  },
  lernrhythmus: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: [],
    fmtBruecke: ['adaptivitaet:mikro', 'engagement:aktiv'],
    umsetzungsimpuls: 'Wechsle bewusst zwischen konzentrierten Einzelphasen, kurzen Austausch-/Bewegungsimpulsen und klaren Übergangssignalen.'
  },

  // 8. Unterstützungssysteme
  unterstuetzungsintensitaet: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['erwerb', 'verstehen', 'konsolidierung'],
    fmtBruecke: ['adaptivitaet:mikro', 'anleitung:explizit'],
    umsetzungsimpuls: 'Steuere deine Begleitung gezielt: kurze Initial-Check-ins bei der Basisgruppe direkt nach Aufgabenstart, danach schrittweises Ausblenden (Fading).'
  },
  unterstuetzungsart: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['erwerb', 'verstehen', 'konsolidierung'],
    fmtBruecke: ['adaptivitaet:diff-prozess', 'feedback:prozessebene'],
    umsetzungsimpuls: 'Stelle gezielte fachliche, sprachliche oder soziale Hilfestellungen (z. B. Beispielkarte, Wortbank, Rollenkarte) unmittelbar am Arbeitsplatz bereit.'
  },
  unterstuetzungsakteure: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['verstehen', 'konsolidierung'],
    fmtBruecke: ['interaktion:partner', 'feedback:peer'],
    umsetzungsimpuls: 'Nutze strukturierte Peer-Unterstützung (Lernpartnerschaften, Helfersystem) neben kurzen individuellen Lehrkraft-Check-ins.'
  },
  unterstuetzungsformate: {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    technik: 'analog',
    phasen: [],
    fmtBruecke: ['adaptivitaet:makro'],
    umsetzungsimpuls: 'Verknüpfe den Unterricht bei dauerhaftem Förderbedarf mit ergänzenden Förder-, Beratungs- oder Übungsangeboten außerhalb der Einzelstunde.'
  },
  unterstuetzungsanpassung: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['verstehen', 'konsolidierung', 'anwendung'],
    fmtBruecke: ['adaptivitaet:mikro', 'adaptivitaet:diff-prozess'],
    umsetzungsimpuls: 'Blende Hilfen schrittweise aus (Scaffolding → Fading), sobald Lernende die ersten Aufgaben sicher bewältigen.'
  },
  'sprachliche-unterstuetzung': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['orientierung', 'erwerb', 'verstehen', 'anwendung'],
    fmtBruecke: ['adaptivitaet:udl', 'repraesentation:ikonisch'],
    umsetzungsimpuls: 'Integriere Fachwortschatz-Boxen, Satzstarter (Scaffolds) und visualisierte Schlüsselbegriffe direkt auf dem Arbeitsauftrag.'
  },
  lernwerkzeuge: {
    ebene: 'material-planung',
    aufwand: 'mittel',
    technik: 'digital',
    phasen: ['konsolidierung', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-prozess'],
    umsetzungsimpuls: 'Setze passende analoge oder digitale Werkzeuge und Lernhilfen gezielt zur Entlastung von Nebenanforderungen ein.'
  },

  // 9. Feedback, Leistungserfassung und Bewertung
  feedbackformen: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['diagnose', 'konsolidierung', 'metakognition'],
    fmtBruecke: ['feedback:formativ', 'feedback:aufgabenebene'],
    umsetzungsimpuls: 'Gib kriteriengeleitete, konkrete Rückmeldungen zum nächsten Lernschritt (mündlich, per Musterlösung oder strukturiertem Peer-Feedback).'
  },
  feedbackfrequenz: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['diagnose', 'konsolidierung', 'verstehen'],
    fmtBruecke: ['feedback:unmittelbar', 'feedback:formativ'],
    umsetzungsimpuls: 'Baue bei hohem Unterstützungsbedarf kurze Zwischen-Checkpoints nach 5–10 Minuten ein, damit sich Fehlvorstellungen nicht verfestigen.'
  },
  leistungserfassung: {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'analog',
    phasen: ['diagnose', 'metakognition'],
    fmtBruecke: ['feedback:diagnostisch', 'feedback:formativ'],
    umsetzungsimpuls: 'Erfasse den Lernstand kontinuierlich über kurze formative Checks (Exit-Ticket, Kurzabfrage, Beobachtungsnotiz) statt erst am Reihenende.'
  },
  bewertungsformen: {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    technik: 'analog',
    phasen: ['diagnose', 'metakognition'],
    fmtBruecke: ['feedback:summativ', 'feedback:bn-kriterial'],
    umsetzungsimpuls: 'Mache Bewertungsmaßstäbe frühzeitig transparent und nutze begleitend kriterienorientierte Rückmeldungen.'
  },
  bewertungskriterien: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: ['orientierung', 'diagnose', 'metakognition'],
    fmtBruecke: ['feedback:bn-kriterial', 'feedback:selbstkontrolle'],
    umsetzungsimpuls: 'Lege 2–3 klare, schülergerechte Erfolgskriterien sichtbar aus, an denen Lernende ihre Ergebnisse selbst überprüfen können.'
  },
  pruefungsformate: {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    technik: 'analog',
    phasen: ['diagnose'],
    fmtBruecke: ['feedback:summativ'],
    umsetzungsimpuls: 'Wähle langfristig vielfältige Leistungsnachweise (mündlich, praktisch, Portfolio), die unterschiedliche Stärken sichtbar machen.'
  },

  // 10. Lernumgebung
  lernumgebung: {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    technik: 'analog',
    phasen: [],
    fmtBruecke: ['adaptivitaet:udl', 'adaptivitaet:mikro'],
    umsetzungsimpuls: 'Nutze den Raum gezielt (ruhige Einzelplätze, klare Gruppentische, visuelle Anker an der Tafel, geringe akustische Ablenkung).'
  }
};

/**
 * Fine-grained overrides for individual measures that differ from their category default
 * (e.g. specific digital/online measures, specific system-level measures, or specific FMT bridges).
 */
const MEASURE_OVERRIDES: Record<string, Partial<MeasureEnrichment>> = {
  // System / multi-week / external-staff measures hidden by default in single-lesson scenario mode
  'zielbestimmung-lehrplan': {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    umsetzungsimpuls: 'Richte die langfristige Halbjahres- und Reihenplanung an den verbindlichen Bildungsstandards und Lehrplanvorgaben aus.'
  },
  'zielbestimmung-analyse': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    phasen: ['orientierung', 'diagnose'],
    fmtBruecke: ['feedback:diagnostisch'],
    umsetzungsimpuls: 'Starte mit einem 3–5-minütigen Lernstands-Check (z. B. Ampelspiel oder Kurzdiagnose) und passe die Ziele daraufhin an.'
  },
  'themenwahl-faecheruebergreifend': {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    umsetzungsimpuls: 'Koordiniere fächerübergreifende Projektvorhaben langfristig im Jahrgangsteam.'
  },
  'zeitstrukturen-projekt': {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    umsetzungsimpuls: 'Plane mehrstündige oder mehrtägige Projektfenster im Stunden- bzw. Schuljahresplan ein.'
  },
  'lernrhythmus-biorhythmen': {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    umsetzungsimpuls: 'Berücksichtige Tageszeit- und Stundenplanrhythmen bei der schulorganisatorischen Taktung anspruchsvoller Fächer.'
  },
  'unterstuetzungsakteure-sonderpaed': {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    umsetzungsimpuls: 'Stimme individuelle Förderpläne und Co-Teaching-Phasen frühzeitig mit sonderpädagogischen Fachkräften ab.'
  },
  'unterstuetzungsakteure-lernbegleiter': {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    umsetzungsimpuls: 'Beziehe Schulbegleitung bzw. Lernbegleiter verbindlich in Aufgaben- und Pausenabsprachen ein.'
  },
  'unterstuetzungsformate-online': {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    technik: 'online',
    umsetzungsimpuls: 'Stelle ergänzende Online-Übungspfade, Foren oder Erklär-Tutorials über die Lernplattform bereit.'
  },
  'sprachliche-unterstuetzung-zusatz': {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    umsetzungsimpuls: 'Verknüpfe den Fachunterricht mit separaten DaZ-/Sprachförderkursen der Schule.'
  },
  'lernwerkzeuge-lernwerkstaetten': {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    technik: 'analog',
    umsetzungsimpuls: 'Nutze schulische Lernwerkstätten oder außerschulische Lernorte für längerfristige Vertiefungsprojekte.'
  },
  'lernumgebung-ausserschulisch': {
    ebene: 'organisation-system',
    aufwand: 'mittel',
    technik: 'analog',
    umsetzungsimpuls: 'Plane Exkursionen oder außerschulische Lernorte als mehrstündige Reihenbausteine ein.'
  },
  'bewertungsformen-kompetenzraster': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    phasen: ['orientierung', 'diagnose', 'metakognition'],
    fmtBruecke: ['feedback:bn-kriterial', 'feedback:selbstkontrolle'],
    umsetzungsimpuls: 'Nutze ein kompaktes Kompetenzraster (3–4 Ich-kann-Kriterien) zur transparenten Selbsteinschätzung im Unterricht.'
  },
  'bewertungsformen-selbst-peer': {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    phasen: ['diagnose', 'metakognition'],
    fmtBruecke: ['feedback:peer', 'feedback:selbstkontrolle', 'feedback:formativ'],
    umsetzungsimpuls: 'Baue eine 5-minütige kriteriengeleitete Selbst- oder Peer-Rückmeldung (z. B. Two Stars and a Wish) vor der Endabgabe ein.'
  },
  'pruefungsformate-muendlich': {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    phasen: ['diagnose', 'anwendung'],
    fmtBruecke: ['adaptivitaet:diff-produkt', 'feedback:diagnostisch'],
    umsetzungsimpuls: 'Erlaube Lernenden mit Schreibhürden, Ergebnisse statt rein schriftlich auch kurz mündlich im Tandem oder Plenum darzustellen.'
  },
  'pruefungsformate-praktisch': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    phasen: ['anwendung', 'diagnose'],
    fmtBruecke: ['adaptivitaet:diff-produkt', 'repraesentation:enaktiv'],
    umsetzungsimpuls: 'Lass Verständnis über ein greifbares Produkt, Modell oder eine Demonstration statt nur über Textaufgaben zeigen.'
  },

  // Digital / Online / Projection tech classification (replaces hardcoded ID sets)
  'medienformate-audiovisuell': {
    technik: 'projektion',
    fmtBruecke: ['repraesentation:ikonisch', 'adaptivitaet:udl'],
    umsetzungsimpuls: 'Nutze eine kurze Visualisierung, Animation oder Videosequenz (max. 2–3 min) mit klarem Beobachtungsauftrag.'
  },
  'medienformate-interaktiv': {
    technik: 'digital',
    fmtBruecke: ['engagement:interaktiv', 'feedback:system'],
    umsetzungsimpuls: 'Setze interaktive digitale Übungen/Simulationen mit unmittelbarem Systemfeedback für selbstgesteuertes Erproben ein.'
  },
  'medienformate-haptisch': {
    technik: 'analog',
    fmtBruecke: ['repraesentation:enaktiv', 'adaptivitaet:udl'],
    umsetzungsimpuls: 'Biete greifbares Anschauungs- oder Legematerial (z. B. Faltstreifen, Karten, Modelle) zur handelnden Erschließung an.'
  },
  'medienformate-visuell': {
    technik: 'analog',
    fmtBruecke: ['repraesentation:ikonisch', 'adaptivitaet:udl'],
    umsetzungsimpuls: 'Unterstütze Erklärungen durch klare Skizzen, Piktogramme, Schaubilder oder farbcodierte Tafelbilder.'
  },
  'zugaenglichkeit-audio': {
    technik: 'digital',
    fmtBruecke: ['adaptivitaet:udl'],
    umsetzungsimpuls: 'Stelle zentrale Sachtexte oder Arbeitsaufträge zusätzlich als kurze Audio-Aufnahme / Vorlesefunktion bereit.'
  },
  'methodik-lernprozess-digital': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'online',
    fmtBruecke: ['engagement:interaktiv', 'adaptivitaet:diff-prozess'],
    umsetzungsimpuls: 'Nutze kollaborative Online-Boards oder digitale Recherche-Aufträge mit klar vorstrukturierten Leitfragen.'
  },
  'unterstuetzungsart-technisch': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'digital',
    fmtBruecke: ['adaptivitaet:udl', 'feedback:system'],
    umsetzungsimpuls: 'Erlaube gezielt assistive digitale Hilfen (Vorlesefunktion, Wörterbuch-App, Rechtschreibhilfe) zur Teilhabe.'
  },
  'lernwerkzeuge-digital': {
    ebene: 'material-planung',
    aufwand: 'mittel',
    technik: 'online',
    fmtBruecke: ['adaptivitaet:diff-tempo', 'feedback:system'],
    umsetzungsimpuls: 'Stelle gestufte digitale Lernpfade auf der Lernplattform für individuelles Üben mit Sofortrückmeldung bereit.'
  },
  'lernwerkzeuge-assistiv': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'digital',
    fmtBruecke: ['adaptivitaet:udl'],
    umsetzungsimpuls: 'Binde benötigte assistive Technologien (Screenreader, Vergrößerung, Schreibhilfen) barrierefrei in die Arbeitsphase ein.'
  },
  'leistungserfassung-digital': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    technik: 'online',
    fmtBruecke: ['feedback:system', 'feedback:unmittelbar', 'feedback:diagnostisch'],
    umsetzungsimpuls: 'Setze ein kurzes digitales Quiz mit Sofortauswertung ein, um Lernstände der gesamten Klasse in 3 Minuten sichtbar zu machen.'
  },

  // Specific FMT-facet bridge refinements for high-impact classroom measures
  'komplexitaet-struktur-schritt': {
    fmtBruecke: ['anleitung:explizit', 'adaptivitaet:diff-prozess'],
    umsetzungsimpuls: 'Zerlege den Hauptauftrag in 3–4 nummerierte, abhakbare Einzelschritte mit einem kurzen Musterbeispiel am Anfang.'
  },
  'komplexitaet-struktur-einfach': {
    fmtBruecke: ['anleitung:explizit', 'adaptivitaet:udl'],
    umsetzungsimpuls: 'Formuliere Aufgaben in kurzen, klaren Sätzen mit hervorgehobenen Operatoren und viel Weißraum.'
  },
  'komplexitaet-struktur-anspruchsvoll': {
    fmtBruecke: ['anleitung:offen', 'engagement:konstruktiv', 'adaptivitaet:diff-inhalt'],
    umsetzungsimpuls: 'Stelle für leistungsstarke Lernende anspruchsvolle Transfer- oder Begründungsaufgaben ohne vorgegebene Lösungsgerüste bereit.'
  },
  'komplexitaet-struktur-offen': {
    fmtBruecke: ['anleitung:offen', 'engagement:konstruktiv'],
    umsetzungsimpuls: 'Öffne die Materialstruktur für eigene Recherche- und Lösungswege bei Lernenden mit hohem Vorwissen.'
  },
  'offenheit-detailliert': {
    fmtBruecke: ['anleitung:explizit', 'adaptivitaet:diff-prozess'],
    umsetzungsimpuls: 'Gib eine eindeutige Schritt-für-Schritt-Vorgabe mit konkretem Beispiel und Zwischenziel vor.'
  },
  'offenheit-offen': {
    fmtBruecke: ['anleitung:offen', 'engagement:konstruktiv'],
    umsetzungsimpuls: 'Öffne die Aufgabenstellung für eigene Lösungswege und selbst gewählte Vertiefungsfragen.'
  },
  'offenheit-frei': {
    fmtBruecke: ['anleitung:offen', 'engagement:konstruktiv', 'adaptivitaet:diff-produkt'],
    umsetzungsimpuls: 'Ermögliche eigenverantwortliche Produkt- oder Forschungsentscheidungen mit klaren Qualitätskriterien.'
  },
  'struktur-lehrersteuerung-stark': {
    fmtBruecke: ['anleitung:explizit', 'interaktion:plenum-lehrergeleitet'],
    umsetzungsimpuls: 'Modelliere das Vorgehen zunächst laut denkend vor der Gruppe und begleite den ersten Übungsschritt eng.'
  },
  'struktur-lehrersteuerung-offen': {
    fmtBruecke: ['anleitung:offen', 'engagement:konstruktiv'],
    umsetzungsimpuls: 'Ziehe dich nach einer kurzen Zielklärung in die Lernbegleiter-Rolle zurück und gib Raum für selbstgesteuerte Bearbeitung.'
  },
  'struktur-lehrersteuerung-selbst': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    fmtBruecke: ['anleitung:offen', 'adaptivitaet:diff-tempo'],
    umsetzungsimpuls: 'Biete einen klar strukturierten Lernjob / Wahlplan mit Selbstkontroll-Station für eigenständiges Arbeiten an.'
  },
  'sozialform-einzel': {
    fmtBruecke: ['interaktion:einzel'],
    umsetzungsimpuls: 'Sichere vor jedem Austausch 2–5 Minuten ruhige Einzelarbeitszeit zum eigenständigen Durchdenken.'
  },
  'sozialform-partner': {
    fmtBruecke: ['interaktion:partner', 'engagement:interaktiv'],
    umsetzungsimpuls: 'Nutze strukturierte Partnerarbeit (klare Rollen A/B und Zeitlimit), um alle Lernenden sprachlich und fachlich zu aktivieren.'
  },
  'sozialform-gruppe': {
    fmtBruecke: ['interaktion:kleingruppe-kooperativ', 'engagement:interaktiv'],
    umsetzungsimpuls: 'Organisiere Kleingruppen mit festen Rollen (z. B. Zeitwächter, Protokoll, Präsentation) statt unstrukturierter Gruppenarbeit.'
  },
  'sozialform-plenum': {
    fmtBruecke: ['interaktion:plenum-lehrergeleitet'],
    umsetzungsimpuls: 'Halte Plenumsphasen kurz und aktivierend (z. B. mit All-Student-Response statt Einzelmeldungen).'
  },
  'sprachliche-unterstuetzung-wortschatz': {
    ebene: 'material-planung',
    aufwand: 'kurz',
    fmtBruecke: ['adaptivitaet:udl', 'repraesentation:ikonisch'],
    umsetzungsimpuls: 'Stelle eine kompakte Wortbank (5–8 Schlüsselbegriffe mit Artikel, Bild/Symbol und kurzem Beispielsatz) bereit.'
  },
  'sprachliche-unterstuetzung-fachunterricht': {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    fmtBruecke: ['adaptivitaet:udl', 'anleitung:geleitet'],
    umsetzungsimpuls: 'Hänge 3–4 Satzstarter für Erklärungen und Begründungen sichtbar an die Tafel und nutze sie im Unterrichtsgespräch bewusst vor.'
  },
  'sprachliche-unterstuetzung-mehrsprachig': {
    ebene: 'unterricht-sofort',
    aufwand: 'sofort',
    fmtBruecke: ['adaptivitaet:udl'],
    umsetzungsimpuls: 'Erlaube das kurze Klären von Fachbegriffen in der Herkunftssprache (z. B. im Tandem oder über zweisprachige Wortkarten).'
  },
  'feedbackformen-peer': {
    fmtBruecke: ['feedback:peer', 'engagement:interaktiv'],
    umsetzungsimpuls: 'Leite Peer-Feedback mit 2 konkreten Prüffragen an (z. B. „Zwei Stärken, ein konkreter Verbesserungstipp“).'
  },
  'feedbackformen-selbst': {
    fmtBruecke: ['feedback:selbstkontrolle', 'feedback:selbstregulationsebene'],
    umsetzungsimpuls: 'Lege Musterlösungen oder eine 3-Punkte-Checkliste zur eigenständigen Selbstkontrolle aus.'
  },
  'lernumgebung-akustisch-visuell': {
    fmtBruecke: ['adaptivitaet:udl'],
    umsetzungsimpuls: 'Reduziere akustische und visuelle Reizüberflutung (ruhiger Randplatz, klare Visualisierung des Stundenablaufs, feste Signale).'
  }
};

export const MEASURE_LEVEL_ORDER: Record<MeasureLevel, number> = {
  'unterricht-sofort': 0,
  'material-planung': 1,
  'organisation-system': 2
};

export const MEASURE_EFFORT_ORDER: Record<MeasureEffort, number> = {
  sofort: 0,
  kurz: 1,
  mittel: 2
};

/**
 * Resolves the curated classroom metadata for any of the 172 differentiation measures.
 */
export function getMeasureEnrichment(measureId: string, kategorieId: string): MeasureEnrichment {
  const base = CATEGORY_DEFAULTS[kategorieId];
  if (!base) {
    throw new Error(`Fehlende Kategorie-Metadaten für Maßnahmen-Kategorie „${kategorieId}“ (Maßnahme „${measureId}“).`);
  }
  const override = MEASURE_OVERRIDES[measureId];
  return override ? { ...base, ...override } : { ...base };
}
