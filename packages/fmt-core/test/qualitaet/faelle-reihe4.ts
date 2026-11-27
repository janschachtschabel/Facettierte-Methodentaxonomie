import type { Qualitaetsfall } from './faelle.js';

/**
 * Fourth test series (FMT 2.0): the 20 cases n01 to n20 of the proposal (fmt2-testfaelle.json), texts verbatim.
 * They cover all didactic W questions, not only the how: purpose and knowledge type (bindung), needs (bedarf),
 * subgroups, companion goals, planning profiles, mandatory details and rules.
 * Expectations name values that do not exist yet; each failing check carries `bekannt` with the package that fixes it.
 * Not part of the baseline file (ausgang.json).
 */
export const REIHE4: Qualitaetsfall[] = [
  // Package A: knowledge type binds the chain; room and writing needs are respected.
  {
    id: 'n01',
    text: 'Sport Klasse 7, Handstand, Sporthalle, 28 Schüler, 90 Minuten',
    erwartet: { kette: 'fertigkeit-bewegung', wissensartHaupt: ['psychomotorik'], ohneRaumbedarf: ['schreibplatz'] }
  },
  {
    id: 'n02',
    text: 'Sport Klasse 9, Trainingslehre Theorie im Klassenraum, 45 Minuten',
    erwartet: { kriterien: { raum: 'klassenraum' } }
  },
  {
    id: 'n03',
    text: 'Musik Klasse 5, Rhythmus-Patterns mit Bodypercussion, Musikraum, 45 Minuten',
    erwartet: { kette: 'fertigkeit-bewegung', wissensartHaupt: ['psychomotorik'], nicht: ['abrufquiz'] }
  },
  {
    id: 'n04',
    text: 'Kunst Klasse 7, Linolschnitt drucken, Werkraum, 90 Minuten',
    erwartet: { kette: 'produktion', praxis: true }
  },
  {
    id: 'n05',
    text: 'Ethik Klasse 10, Sterbehilfe, Hörsaal mit fester Bestuhlung, 30 Lernende',
    erwartet: { kette: 'urteilsbildung', ohneRaumbedarf: ['stellflaeche'], nicht: ['fishbowl', 'kugellager'] },
    bekannt: { modus: 'Paket B' }
  },
  {
    id: 'n06',
    text: 'Sachunterricht Klasse 1, Jahreszeiten, Kinder können noch nicht lesen',
    erwartet: { ohneSchriftbedarf: ['liest', 'schreibt'] },
    bekannt: { modus: 'Paket B' }
  },

  // Package C: subgroups (swap the method, add help, locked traits).
  {
    id: 'n07',
    text: 'Mathematik Klasse 8, lineare Funktionen, 45 Minuten, Teilgruppe: 6 Lernende mit geringem Vorwissen',
    erwartet: { teilgruppe: { antwort: 'tausch' } },
    bekannt: { teilgruppe: 'Paket C' }
  },
  {
    id: 'n08',
    text: 'Biologie Klasse 7, Fotosynthese, 45 Minuten, Teilgruppe: 4 Lernende DaZ Niveau A2',
    erwartet: { teilgruppe: { antwort: 'hilfe', abbau: true } },
    bekannt: { teilgruppe: 'Paket C' }
  },
  {
    id: 'n09',
    text: 'Deutsch Klasse 6, Balladen, Teilgruppe: visuelle Lerntypen',
    erwartet: { teilgruppe: { antwort: 'passt', gesperrt: true } },
    bekannt: { modus: 'Paket B', teilgruppe: 'Paket C' }
  },
  {
    id: 'n10',
    text: 'Geschichte Klasse 9, Weimarer Republik, 90 Minuten, Teilgruppe: 5 Leistungsstarke',
    erwartet: { teilgruppe: { antwort: 'tausch' } },
    bekannt: { teilgruppe: 'Paket C' }
  },

  // Package D: companion goals, new chain, planning profiles.
  {
    id: 'n11',
    text: 'Physik Klasse 8, Stromkreis, 45 Minuten, zusätzlich Selbstregulation fördern',
    erwartet: { begleitstrang: 'selbstregulation', regeln: ['begleitziel-braucht-termine'] },
    bekannt: { regel: 'Paket D', begleitziel: 'Paket D' }
  },
  {
    id: 'n12',
    text: 'Englisch Klasse 5, Wortschatz Tiere, 45 Minuten, soziales Lernen stärken',
    erwartet: { begleitstrang: 'soziales-lernen' },
    bekannt: { begleitziel: 'Paket D' }
  },
  {
    id: 'n13',
    text: 'Berufsschule, Lernfeld 3 Kfz-Mechatronik, Bremsanlage prüfen, Werkstatt, 180 Minuten',
    erwartet: { kette: 'vollstaendige-handlung', planungsprofil: 'berufsschule' },
    bekannt: { kette: 'Paket D', profil: 'Paket D' }
  },
  {
    id: 'n14',
    text: 'Betrieb, Auszubildende im 1. Lehrjahr, Unterweisung Bohren an der Ständerbohrmaschine, 15 Minuten',
    erwartet: { modus: 'phase', enthaelt: 'vier-stufen-methode', planungsprofil: 'betrieb' },
    bekannt: { profil: 'Paket D' }
  },
  {
    id: 'n15',
    text: 'Hochschule, Seminar Statistik, 90 Minuten, 25 Studierende, Prüfungsform Klausur',
    erwartet: { planungsprofil: 'hochschule', nachweisform: 'schriftlich' },
    bekannt: { profil: 'Paket D' }
  },
  {
    id: 'n16',
    text: 'Volkshochschule, Kochkurs Grundtechniken, Lehrküche, 3 Stunden, 12 Teilnehmende',
    erwartet: { planungsprofil: 'erwachsenenbildung', kriterien: { gruppe: 12 } },
    bekannt: { profil: 'Paket D' }
  },

  // Package B (and A for n18): mandatory details, named wishes, rules.
  {
    id: 'n17',
    text: 'Chemie Klasse 9, Säuren und Basen, 45 Minuten',
    erwartet: { pflichtFehlt: ['anzahl', 'raum'], angenommen: ['raum'] }
  },
  {
    id: 'n18',
    text: 'Sport Klasse 8, Ausdauer mit Leistungskontrolle, Sportplatz, 45 Minuten',
    erwartet: { leistungskontrolle: true, nachweisform: 'praktisch' }
  },
  {
    id: 'n19',
    text: 'Mathematik Klasse 5, Laufdiktat zu Bruchrechnen',
    erwartet: { enthaelt: 'laufdiktat', regeln: ['genannter-wunsch-bleibt'] },
    // Intended: the named method stays (genannter-wunsch-bleibt), so the general subject check finds a method of another
    // subject. Not a weakness to fix. Tor D2 dropped the subject entry of laufdiktat (no reason beyond its subject
    // matter): nothing speaks against it in Mathematik any more, so there is no warning and no message about the wish.
    bekannt: {
      fachpassung: 'gewollt: genannter Wunsch bleibt (Laufdiktat ist eine Methode der Sprachen)',
      regel: 'Tor D2: Laufdiktat ist in Mathematik nicht mehr als ungeeignet markiert, daher kein Hinweis zum Wunsch'
    }
  },
  {
    id: 'n20',
    text: 'Informatik Klasse 10, Sortieralgorithmen, 90 Minuten, komplexer Inhalt, geringes Vorwissen',
    erwartet: { regeln: ['wenig-anleitung-komplexer-inhalt'] }
  }
];
