import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator } from '../src/index.js';
import { negatedMethods } from '../src/zuordnung.js';
import type { MatchResult } from '../src/types.js';
import { LESEFAELLE, NENNUNGEN, THEMEN, szenarioText } from './golden-szenarien.js';
import { alleBausteine } from './qualitaet/pruefen.js';
import { mitEintraegen } from './fixtures/eignung.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));

function usedBlocks(node: unknown, out: string[] = []): string[] {
  if (!node || typeof node !== 'object') return out;
  const n = node as Record<string, unknown>;
  if (typeof n.baustein === 'string') out.push(n.baustein);
  for (const key of ['teile', 'begleitend', 'optionen']) {
    if (Array.isArray(n[key])) (n[key] as unknown[]).forEach((x) => usedBlocks(x, out));
  }
  if (Array.isArray(n.belegung)) n.belegung.forEach((x) => usedBlocks((x as { inhalt?: unknown }).inhalt, out));
  if (n.haupt) usedBlocks(n.haupt, out);
  return out;
}
const blocksOf = (r: MatchResult) => (r.modus === 'ablauf' && r.arrangement ? usedBlocks(r.arrangement.ablauf) : []);
const sequenceOf = (r: MatchResult) => (r.modus === 'ablauf' ? (r.schritte || []).map((s) => s.baustein).join(' > ') : '');

describe('Referenzsatz: Qualität der Methodenvorschläge', () => {
  const plans45 = THEMEN.map(([f, t]) => M.zuordnen({ text: szenarioText(f, t, 45) }));
  const plans90 = THEMEN.map(([f, t]) => M.zuordnen({ text: szenarioText(f, t, 90) }));

  it('gueltigkeit: alle 60 Themen-Szenarien ergeben formal gültige Abläufe', () => {
    for (const r of [...plans45, ...plans90]) {
      expect(r.modus).toBe('ablauf');
      if (r.modus === 'ablauf') {
        expect(r.pruefung?.gueltig, JSON.stringify(r.pruefung?.meldungen)).toBe(true);
        expect(r.offen).toEqual([]);
      }
    }
  });

  it('variabilitaet-45: mindestens 15 verschiedene Abläufe, häufigster höchstens 20 %', () => {
    const counts = new Map<string, number>();
    plans45.forEach((r) => counts.set(sequenceOf(r), (counts.get(sequenceOf(r)) || 0) + 1));
    expect(counts.size).toBeGreaterThanOrEqual(15);
    expect(Math.max(...counts.values()) / plans45.length).toBeLessThanOrEqual(0.2);
  });

  it('katalognutzung: mindestens 40 verschiedene Methoden über 60 Szenarien', () => {
    const used = new Set([...plans45, ...plans90].flatMap(blocksOf));
    expect(used.size).toBeGreaterThanOrEqual(40);
  });

  it('zeitbudget: Abläufe nutzen 90 bis 100 % der angegebenen Zeit', () => {
    const check = (plans: MatchResult[], budget: number) => {
      for (const r of plans) {
        if (r.modus !== 'ablauf' || !r.pruefung) continue;
        expect(r.pruefung.dauerMin, sequenceOf(r)).toBeLessThanOrEqual(budget);
        expect(r.pruefung.dauerMin, sequenceOf(r)).toBeGreaterThanOrEqual(budget * 0.9);
      }
    };
    check(plans45, 45);
    check(plans90, 90);
  });

  it('determinismus: gleiche Anfrage ergibt denselben Ablauf', () => {
    const [f, t] = THEMEN[3];
    expect(sequenceOf(M.zuordnen({ text: szenarioText(f, t, 90) }))).toBe(sequenceOf(plans90[3]));
  });

  it('nennungen: im Text genannte Methoden stehen im Ablauf', () => {
    for (const c of NENNUNGEN) {
      const r = M.zuordnen({ text: c.text });
      expect(r.modus, c.text).toBe('ablauf');
      expect(blocksOf(r), c.text).toContain(c.baustein);
      if (r.modus === 'ablauf') expect(r.pruefung?.gueltig, c.text).toBe(true);
    }
  });

  it('lesefaelle: Freitext wird wie beabsichtigt gelesen', () => {
    for (const c of LESEFAELLE) {
      const k = M.lesen(c.text).kriterien;
      for (const [feld, wert] of Object.entries(c.erwartet)) expect(k[feld], `${c.text} → ${feld}`).toEqual(wert);
      for (const [feld, wert] of Object.entries(c.nicht || {})) {
        if (Array.isArray(wert)) {
          for (const w of wert) expect((k[feld] as string[] | undefined) || [], `${c.text} → kein ${feld}=${w}`).not.toContain(w);
        } else {
          expect(k[feld], `${c.text} → nicht ${feld}=${String(wert)}`).not.toBe(wert);
        }
      }
    }
  });

  it('einzelphase: Themenwörter filtern Einstiegsmethoden nicht weg', () => {
    const r = M.zuordnen({ text: 'Einstieg in das Thema Bruchrechnen, 10 Minuten, Klasse 6' });
    expect(r.modus).toBe('phase');
    if (r.modus === 'phase') expect(r.vorschlaege.length).toBeGreaterThanOrEqual(20);
  });

  it('technikannahme: ohne Angabe zur Ausstattung keine Methode mit Internet, KI oder Einzelgeräten', () => {
    const byId = new Map(D.bausteine.map((b) => [b.kennung, b]));
    for (const r of plans45) {
      for (const id of blocksOf(r)) {
        const b = byId.get(id)!;
        expect(b.internet || b.technik === 't-einzeln' || Boolean(b.ki), `${id} in ${sequenceOf(r)}`).toBe(false);
      }
    }
  });
});

describe('Randfälle der Zuordnung', () => {
  const durationOf = (r: MatchResult) =>
    r.modus === 'ablauf' ? (r.pruefung?.berechnet as { dauerMin?: number } | undefined)?.dauerMin : undefined;

  it('text ohne rahmenangabe: Einzelphase mit Vorschlägen, kein Absturz', () => {
    const r = M.zuordnen({ text: 'Fotosynthese' });
    expect(r.modus).toBe('phase');
    if (r.modus === 'phase') expect(r.vorschlaege.length).toBeGreaterThan(0);
  });

  it('genannte methode, die der rahmen ausschliesst: nicht verankert, mit Grund', () => {
    const r = M.zuordnen({ text: 'Deutsch Klasse 9: Erörterung als Gruppenpuzzle, 90 Minuten, 3 Schüler' });
    expect(r.modus).toBe('ablauf');
    if (r.modus === 'ablauf') {
      expect(blocksOf(r)).not.toContain('gruppenpuzzle');
      const miss = (r.nichtVerankert || []).find((n) => n.baustein === 'gruppenpuzzle');
      expect(miss?.grund).toBeTruthy();
      expect(r.pruefung?.gueltig).toBe(true);
    }
  });

  it('zwei genannte methoden: beide im Ablauf oder die zweite mit Grund abgelehnt', () => {
    const r = M.zuordnen({ text: 'Politik Klasse 10: Tempolimit mit Fishbowl und Pro-Contra-Debatte, 90 Minuten, 24 Schüler' });
    expect(r.modus).toBe('ablauf');
    if (r.modus === 'ablauf') {
      const used = blocksOf(r);
      for (const id of ['fishbowl', 'pro-contra-debatte']) {
        const refused = (r.nichtVerankert || []).some((n) => n.baustein === id && n.grund);
        expect(used.includes(id) || refused, id).toBe(true);
      }
      expect(used.some((id) => id === 'fishbowl' || id === 'pro-contra-debatte')).toBe(true);
      expect(r.pruefung?.gueltig).toBe(true);
    }
  });

  it('sehr kleines budget: Ablauf bleibt gültig', () => {
    const r = M.zuordnen({ text: 'Mathematik Klasse 8: Prozentrechnung', modus: 'ablauf', zeitMin: 20 });
    expect(r.modus).toBe('ablauf');
    if (r.modus === 'ablauf') expect(r.pruefung?.gueltig).toBe(true);
  });

  it('variante: negativ oder nicht ganzzahlig wird abgelehnt, gültige Werte ändern den Vorschlag', () => {
    expect(() => M.zuordnen({ text: szenarioText('Chemie', 'Säuren und Basen', 45), variante: -1 })).toThrow(/variante/);
    expect(() => M.zuordnen({ text: szenarioText('Chemie', 'Säuren und Basen', 45), variante: 1.5 })).toThrow(/variante/);
    const seqs = new Set([0, 1, 2, 3].map((v) => sequenceOf(M.zuordnen({ text: szenarioText('Chemie', 'Säuren und Basen', 45), variante: v }))));
    expect(seqs.size).toBeGreaterThanOrEqual(2);
  });
});

describe('Stundenart aus dem Text', () => {
  const chainOf = (text: string) => {
    const r = M.zuordnen({ text });
    return r.modus === 'ablauf' ? r.kette?.id : r.modus;
  };

  it('„üben“ in einer ganzen Stunde ergibt einen Ablauf, mit Phasenwort eine Einzelphase', () => {
    expect(chainOf('Klasse 2 Deutsch, Lesen üben mit Silben, 45 min, 22 Kinder')).toBe('prozedur');
    expect(chainOf('Englisch Klasse 7: Dialoge beim Einkaufen üben, 45 Minuten')).toBe('prozedur');
    expect(M.zuordnen({ text: 'Englisch Klasse 7: Dialoge üben in der Sicherungsphase, 45 Minuten' }).modus).toBe('phase');
  });

  it('das Handlungsverb wählt die Kette, wenn keine Zielart genannt ist', () => {
    expect(chainOf('Politik Klasse 7: Regeln in der Klasse demokratisch aushandeln, 45 Minuten')).toBe('urteilsbildung');
    expect(chainOf('Jura Uni Seminar: Fallbearbeitung Kaufrecht, 90 Minuten, 30 Studierende')).toBe('problemloesen');
    expect(chainOf('Fachinformatiker Lernfeld 3: Netzwerk planen, 90 Minuten')).toBe('projektlernen');
    // Identifying with a key is a procedure to practise, not an inquiry cycle.
    expect(chainOf('Biologie Klasse 5 Bäume bestimmen auf dem Schulhof, 45 Minuten')).toBe('prozedur');
    expect(chainOf('Geschichte Klasse 10 Weimarer Republik, 90 Minuten')).toBe('konzeptaufbau');
    expect(chainOf('Deutsch Klasse 7: bestimmte Artikel wiederholen, 45 Minuten')).toBe('prozedur');
    expect(chainOf('Einführungsphase Mathe: Ableitungen üben, 90 Minuten')).toBe('prozedur');
  });

  it('eine geratene Kette, die der Rahmen nicht füllen kann, weicht dem Konzeptaufbau', () => {
    const r = M.zuordnen({ text: 'Geschichte Klasse 9 Weimarer Republik diskutieren, 45 Minuten, 2 Schüler' });
    expect(r.modus).toBe('ablauf');
    if (r.modus === 'ablauf') {
      expect(r.pruefung?.gueltig).toBe(true);
      expect((r.annahmen || []).some((x) => x.includes('nicht vollständig planbar'))).toBe(true);
    }
  });

  it('verneinte Verben wählen keine Kette', () => {
    expect(chainOf('Ethik Klasse 9 Freundschaft, 45 Minuten, bitte nicht diskutieren')).not.toBe('urteilsbildung');
  });
});

describe('Lernort, Verneinung und Abwechslung', () => {
  const byId = new Map(D.bausteine.map((b) => [b.kennung, b]));
  const practical = (id: string) => {
    const b = byId.get(id)!;
    return (b.aufgabe || []).includes('psychomotorik') || (b.repraesentation || []).includes('enaktiv') || (b.fachbereich || []).some((f) => f === 'sport' || f === 'beruf-praxis');
  };

  it('Raum aus dem Aufruf: draußen oder Labor bevorzugt Praxis- und Erkundungsmethoden', () => {
    const plain = M.zuordnen({ text: 'Biologie Klasse 7 Pflanzen, 45 Minuten' });
    const out = M.zuordnen({ text: 'Biologie Klasse 7 Pflanzen, 45 Minuten', raum: 'draussen' });
    expect(out.modus).toBe('ablauf');
    if (out.modus === 'ablauf' && plain.modus === 'ablauf') {
      expect(out.pruefung?.gueltig).toBe(true);
      expect(sequenceOf(out)).not.toBe(sequenceOf(plain));
    }
  });

  it('Hörsaal: keine Methode, für die alle aufstehen und umhergehen', () => {
    const r = M.zuordnen({ text: 'Hochschule Statistik Hypothesentests, 90 Minuten, 120 Studierende', raum: 'hoersaal' });
    expect(r.modus).toBe('ablauf');
    for (const id of blocksOf(r)) expect(byId.get(id)!.aufgabe || [], id).not.toContain('psychomotorik');
  });

  it('Labor in Chemie: die Hauptphasen sind überwiegend praktisch', () => {
    const r = M.zuordnen({ text: 'Chemie Klasse 8: Brenner sicher bedienen im Labor, 45 Minuten' });
    expect(r.modus).toBe('ablauf');
    expect(blocksOf(r).filter(practical).length).toBeGreaterThanOrEqual(2);
  });

  it('verneinte Methoden: „kein Lehrervortrag“ schließt Vortragsmethoden aus, „ohne Referate“ Referate', () => {
    const vortrag = blocksOf(M.zuordnen({ text: 'Bio Klasse 9 Immunsystem, 45 Minuten, bitte kein Lehrervortrag' }));
    expect(vortrag.filter((id) => /vortrag|vorlesung/.test(id))).toEqual([]);
    const referat = blocksOf(M.zuordnen({ text: 'Geschichte Klasse 11 Kalter Krieg, 45 Minuten, ohne Referate' }));
    expect(referat.filter((id) => /referat/.test(id))).toEqual([]);
  });

  it('verneinte Methoden: nur benannte Methodenarten, keine Teilwörter und keine Mengenangaben', () => {
    expect(blocksOf(M.zuordnen({ text: 'Geschichte Klasse 9 Weimarer Republik, 45 Minuten, bitte ein Pecha Kucha statt Lehrervortrag' }))).toContain('pecha-kucha');
    expect(blocksOf(M.zuordnen({ text: 'Chemie Klasse 8, 45 Minuten, kein Schülerexperiment, lieber ein Demonstrationsexperiment' }))).toContain('demonstrationsexperiment');
    expect([...negatedMethods('ethik klasse 9, nicht zu lange diskussion, kein problem, ohne losung, keine spiele')]).toEqual([]);
  });

  it('Sport im Klassenraum: Theoriestunde ohne Bewegungskette', () => {
    const r = M.zuordnen({ text: 'Sport Klasse 9 Theorie: Doping im Klassenraum, 45 Minuten' });
    expect(r.modus === 'ablauf' ? r.kette?.id : r.modus).not.toBe('fertigkeit-bewegung');
  });

  it('Einstiege wechseln: mehrere Einstiegsmethoden, keine eröffnet mehr als die Hälfte der Themen-Szenarien', () => {
    // 90 minutes leave room for several openers; in 45 minutes the catalogue has few short diagnostic openers (data gap).
    const first = THEMEN.map(([f, t]) => M.zuordnen({ text: szenarioText(f, t, 90) })).map((r) => (r.modus === 'ablauf' ? r.schritte?.[0]?.baustein : ''));
    const counts = new Map<string, number>();
    first.forEach((x) => counts.set(x || '', (counts.get(x || '') || 0) + 1));
    expect(counts.size).toBeGreaterThanOrEqual(3);
    expect(Math.max(...counts.values()) / first.length).toBeLessThanOrEqual(0.5);
  });
});

describe('Mehrfachwünsche und Ausweichen', () => {
  it('Prüfung am Anfang: „zu Beginn ein Test, dann …“ stellt die Prüfung an den Anfang', () => {
    for (const text of ['Mathe Klasse 7, zu Beginn ein kurzer Test, dann Prozentrechnung, 45 Minuten', 'Französisch Klasse 7, Vokabeltest und danach neue Lektion einführen, 45 Minuten']) {
      const r = M.zuordnen({ text });
      expect(r.modus, text).toBe('ablauf');
      if (r.modus === 'ablauf') {
        const first = D.bausteine.find((b) => b.kennung === r.schritte?.[0]?.baustein)!;
        expect(first.lernfunktion[0], text).toBe('diagnose');
        expect(r.pruefung?.gueltig, text).toBe(true);
      }
    }
  });

  it('Prüfung bleibt am Ende: „am Ende ein Test, danach …“, „erst am Ende“, Sport nach dem Aufwärmen', () => {
    const lastCheck = (text: string) => {
      const r = M.zuordnen({ text });
      if (r.modus !== 'ablauf') return false;
      const first = D.bausteine.find((b) => b.kennung === r.schritte?.[0]?.baustein)!;
      return first.lernfunktion[0] !== 'diagnose';
    };
    expect(lastCheck('Mathe Klasse 7 Prozentrechnung, am Ende ein Test, danach Hausaufgaben, 45 Minuten')).toBe(true);
    expect(lastCheck('Mathe Klasse 7 Prozentrechnung, erst am Ende ein kurzer Test, 45 Minuten')).toBe(true);
    expect(lastCheck('Englisch Klasse 7 Vokabeln, Vokabeltest dann am Ende, 45 Minuten')).toBe(true);
    expect(lastCheck('Sport Klasse 9, zuerst Aufwärmen, dann Cooper-Test, 45 Minuten')).toBe(true);
  });

  it('genannte Methode ohne Zeit im geschätzten Ablauf: anderer Ablauf, in dem sie Platz hat, mit Annahme', () => {
    const r = M.zuordnen({ text: 'Kaufleute im Einzelhandel: Reklamationsgespräch führen, 45 Minuten, Rollenspiel' });
    expect(r.modus).toBe('ablauf');
    if (r.modus === 'ablauf') {
      expect(blocksOf(r)).toContain('rollenspiel');
      expect(r.pruefung?.gueltig).toBe(true);
      expect(r.pruefung?.dauerMin).toBeLessThanOrEqual(45);
      expect((r.annahmen || []).some((x) => x.includes('passte zeitlich nicht'))).toBe(true);
    }
  });

  it('einengende Vorgabe: gültiger Ablauf ohne offene Phasen; eine gelockerte Vorgabe wird genannt', () => {
    // With the short openers (S9) this request no longer needs relaxing; any relaxation must still be named.
    const r = M.zuordnen({ text: 'Vertretungsstunde Klasse 8 fachfremd, 45 Minuten, ohne Vorbereitung, egal welches Thema' });
    expect(r.modus).toBe('ablauf');
    if (r.modus === 'ablauf') {
      expect(r.pruefung?.gueltig).toBe(true);
      expect(r.offen || []).toEqual([]);
      for (const x of (r.annahmen || []).filter((y) => y.includes('hält sie nicht ein'))) expect(x).toMatch(/Vorgabe „.+“/);
    }
  });

  it('verneint genannte Methode wird nicht eingeplant: „keine Gruppenarbeit“', () => {
    const r = M.zuordnen({ text: 'Geschichte Klasse 10 Weimarer Republik, 60 Minuten, keine Gruppenarbeit' });
    expect(blocksOf(r)).not.toContain('gruppenarbeit-klassisch');
  });
});

describe('Sport- und Praxismethoden bleiben in ihrem Fach (S1–S9)', () => {
  const sportOnly = ['aufwaermen', 'cool-down-auswertung', 'spielform-zielspiel', 'sportmotorischer-test', 'dauer-intervallmethode', 'praxisauftrag-arbeitsplatz'];
  it.each([
    'Klimaerwärmung in Erdkunde Klasse 9, 45 Minuten',
    'Treibhauseffekt und Erwärmung der Erde, Physik Klasse 8, 45 Minuten',
    'Stundenausklang in Deutsch Klasse 7, Gedichtanalyse, 45 Minuten',
    'Leistungsmessung in Mathe Klasse 8, 45 Minuten',
    'Spielform im Englischunterricht Klasse 6, 45 Minuten',
    'Gruppenarbeitsauftrag Geschichte Klasse 8, 45 Minuten',
    'Arbeitsauftrag zum Bruchrechnen, Klasse 6, 45 Minuten',
    'Konditionstraining im Fach Biologie, 45 Minuten'
  ])('%s: keine Hallen- oder Werkstattmethode', (text) => {
    const r = M.zuordnen({ text });
    for (const id of blocksOf(r)) expect(sportOnly, id).not.toContain(id);
  });

  // Tor D2 dropped the subject entries of laufdiktat and sportmotorischer-test; the fixture puts them back to keep the
  // mechanism tested.
  const MX = createMatcher(mitEintraegen(D), createValidator(mitEintraegen(D)));

  it('genannte Methode mit Hauptnamen bleibt trotz „ungeeignet im Fach“ im Ablauf, mit Hinweis', () => {
    const r = MX.zuordnen({ text: 'Mathe Klasse 5 Laufdiktat zu Bruchrechnen, 45 Minuten' });
    expect((r.verankert || []).some((v) => v.baustein === 'laufdiktat')).toBe(true);
    expect((r.hinweise || []).join(' ')).toMatch(/Laufdiktat.*passt weniger zum Fachbereich „Mathematik/);
    expect((r.regelmeldungen || []).some((m) => m.regel === 'genannter-wunsch-bleibt' && m.baustein === 'laufdiktat')).toBe(true);
  });

  it('Hinweis „unüblich“ nur, wenn die genannte Methode wirklich im Ablauf steht', () => {
    const r = M.zuordnen({ text: 'Differenzielles Lernen in Mathematik, Bruchrechnung Klasse 8, 45 Minuten' });
    const placed = (r.modus === 'ablauf' ? r.verankert || [] : []).some((v) => v.baustein === 'differenzielles-lernen');
    const wunsch = (x: typeof r) => (x.regelmeldungen || []).some((m) => m.regel === 'genannter-wunsch-bleibt' && m.baustein === 'differenzielles-lernen');
    expect(placed || !wunsch(r)).toBe(true);
    const p = M.zuordnen({ text: 'Differenzielles Lernen in Mathematik, Einstieg' });
    expect((p.hinweise || []).some((h) => /im Ablauf/.test(h))).toBe(false);
    if (p.modus === 'phase' && !p.vorschlaege.slice(0, 6).some((v) => v.baustein === 'differenzielles-lernen')) expect(wunsch(p)).toBe(false);
  });

  it('genannter Hauptname im unpassenden Fach umgeht weder Raum- noch Diagnoseregel', () => {
    // Room-only method (gym), named in a classroom maths lesson: no wish without a room or movement goal.
    const r = M.zuordnen({ text: 'Differenzielles Lernen in Mathematik, Bruchrechnung Klasse 8, 45 Minuten' });
    expect(blocksOf(r)).not.toContain('differenzielles-lernen');
    // Not a wish at all, so it is no wish that merely lacked time.
    expect((r.modus === 'ablauf' ? r.nichtVerankert || [] : []).map((n) => n.baustein)).not.toContain('differenzielles-lernen');
  });

  it('Synonym mit Alltagsbedeutung im unpassenden Fach: keine Methode, aber mit Grund unter nichtVerankert', () => {
    const r = MX.zuordnen({ text: 'Leistungsmessung in Mathe Klasse 8, 45 Minuten' });
    expect(blocksOf(r)).not.toContain('sportmotorischer-test');
    expect(blocksOf(M.zuordnen({ text: 'Leistungsmessung in Mathe Klasse 8, 45 Minuten' }))).not.toContain('sportmotorischer-test');
    expect(r.nichtVerankert).toContainEqual({ baustein: 'sportmotorischer-test', grund: 'im Fachbereich Mathematik und Informatik als ungeeignet markiert' });
  });

  it('Ausdauertraining mit Leistungskontrolle: Aufwärmen, Belastung, sportmotorischer Test, Cool-down', () => {
    const r = M.zuordnen({ text: 'Ich will ein Szenario unterstellen für den Sportunterricht 45 minuten - ausdauertraining mit anschließender leistungskontrolle' });
    expect(r.modus).toBe('ablauf');
    if (r.modus === 'ablauf') {
      expect(r.kette?.id).toBe('kondition-training');
      expect(r.pruefung?.gueltig).toBe(true);
      expect(blocksOf(r)).toEqual(expect.arrayContaining(['aufwaermen', 'dauer-intervallmethode', 'sportmotorischer-test', 'cool-down-auswertung']));
    }
  });

  it('Konditionstraining ohne Fach wird als Sportstunde geplant', () => {
    const r = M.zuordnen({ zieltyp: 'kondition-training', bildungsstufe: 'sek1' });
    expect(r.kriterien.fachbereich).toBe('sport');
    expect(r.modus === 'ablauf' && r.pruefung?.gueltig).toBe(true);
    // FMT 2.0: the assumed subject area is named; the room follows from it.
    expect(r.pflichtangaben?.angenommen).toContainEqual(expect.objectContaining({ feld: 'fachbereich', wert: 'sport' }));
    expect(r.pflichtangaben?.angenommen).toContainEqual(expect.objectContaining({ feld: 'raum', wert: 'bewegungsraum' }));
    expect(r.pflichtangaben?.fehlt).toContain('fach-und-thema');
    const z = M.zuordnen({ zielart: 'kondition', bildungsstufe: 'sek1' });
    expect(z.pflichtangaben?.angenommen).toContainEqual(expect.objectContaining({ feld: 'fachbereich', wert: 'sport' }));
    const genannt = M.zuordnen({ zielart: 'kondition', fachbereich: 'sport', bildungsstufe: 'sek1' });
    expect(genannt.pflichtangaben?.angenommen.map((x) => x.feld)).not.toContain('fachbereich');
  });
});

describe('Prüfung am Stundenanfang und Lesen praktischer Fächer', () => {
  it('„Vokabeltest und danach neue Lektion“: der genannte Test steht am Anfang und ist gültig', () => {
    const r = M.zuordnen({ text: 'Französisch Klasse 7, Vokabeltest und danach neue Lektion einführen, 45 Minuten' });
    expect(r.modus).toBe('ablauf');
    if (r.modus === 'ablauf') {
      expect(r.pruefung?.gueltig).toBe(true);
      expect(r.schritte[0].baustein).toBe('vokabeltest-kurzkontrolle');
      expect(r.arrangement?.kontext?.vorhanden).toEqual(['erstwissen-ungesichert']);
    }
  });

  it.each([
    ['Darstellendes Spiel Klasse 10: Improvisation und Szenenarbeit, 90 Minuten', 'bewegung'],
    ['Chemie Anfangsunterricht Klasse 7: Sicherheitsregeln im Labor und Brenner anzünden, 45 Minuten', 'bewegung'],
    ['Seniorenkurs: Smartphone Grundlagen, WhatsApp nutzen, 90 Minuten, 8 Teilnehmende', 'bewegung'],
    ['Biologie Klasse 5 Bäume bestimmen auf dem Schulhof, draußen, 45 Minuten', 'prozeduren']
  ])('%s → Zielart %s', (text, zielart) => {
    expect(M.lesen(text).kriterien.zielart).toBe(zielart);
  });

  it('„Tablets nutzen für Recherche“ ist keine Bewegungs- oder Praxisstunde', () => {
    expect(M.lesen('Informatik Klasse 9, 45 Minuten, Tablets nutzen für Recherche').kriterien.zielart).toBeUndefined();
  });
});

describe('Keine Fehlgriffe durch Alltagswörter (Review)', () => {
  it.each([
    ['Wiederholungsstunde zur Vorbereitung auf die Klassenarbeit, Mathe Klasse 8, 90 Minuten', 'klassenarbeit-summativ'],
    ['Deutsch Klasse 5: Schüler sollen ihre Geschichten vorlesen, 45 Minuten', 'vorlesen-lesung']
  ])('%s: ohne %s', (text, id) => {
    expect(blocksOf(M.zuordnen({ text }))).not.toContain(id);
  });

  it.each([
    'Deutsch Klasse 11: Schillers Schauspiel Die Räuber analysieren, 90 Minuten',
    'Mathe Klasse 6: mit dem Tablet Grundlagen der Bruchrechnung üben, 45 Minuten',
    'Geschichte Klasse 9: Handy Grundlagen der Quellenkritik, 45 Minuten',
    'Englisch: Lehrkraft muss improvisieren, Vokabeln wiederholen, 45 Minuten'
  ])('%s: keine Bewegungs- oder Praxisstunde', (text) => {
    expect(M.lesen(text).kriterien.zielart).not.toBe('bewegung');
  });

  it('ein mitgegebener Zustand „vorhanden“ erreicht den Kontext des Ablaufs', () => {
    const r = M.zuordnen({ text: 'Mathe Klasse 8 Brüche, 45 Minuten', vorhanden: ['erstwissen-ungesichert'] });
    expect(r.modus === 'ablauf' && r.arrangement?.kontext?.vorhanden).toEqual(['erstwissen-ungesichert']);
  });
});

describe('Sport: Tanz, Training und Spiel an der richtigen Stelle (Runde 4)', () => {
  it('Tanz im Sport darf die Vorführung mit Rückmeldung nutzen', () => {
    const r = M.zuordnen({ text: 'Sport 7: HipHop-Tanz eine kurze Choreo einstudieren, 45 Minuten' });
    expect(blocksOf(r)).toContain('vorfuehrung-rueckmeldung');
  });

  // Tor D2 (T8) added sport to the subject areas of vorfuehrung-rueckmeldung: in a technique lesson such as volleyball
  // it is now a sport method. Swimming strokes and running at a steady pace still do without it.
  it.each([
    'Sport Klasse 7, Schwimmen Kraulbeine, 45 Minuten',
    'Sport Klasse 10: Distanz laufen und Tempo halten, 45 Minuten'
  ])('%s: keine Vorführung aus den ästhetischen Fächern', (text) => {
    expect(blocksOf(M.zuordnen({ text }))).not.toContain('vorfuehrung-rueckmeldung');
  });

  it('Volleyball übt die Technik, statt Ausdauer zu trainieren', () => {
    const r = M.zuordnen({ text: 'Sport Klasse 9 Volleyball: oberes Zuspiel, 45 Minuten' });
    expect(blocksOf(r)).not.toContain('dauer-intervallmethode');
  });

  it('Fitness mit Theorie und Praxis: Spielform statt Sitzkreis, 90 Minuten gefüllt', () => {
    const r = M.zuordnen({ text: 'Sport Oberstufe Fitness und Krafttraining, 90 Minuten, Theorie und Praxis' });
    expect(blocksOf(r)).not.toContain('fishbowl');
    expect(r.modus === 'ablauf' && r.pruefung?.dauerMin).toBeGreaterThanOrEqual(81);
  });
});

describe('Hinweise ohne Evidenzbehauptung, Sicherheit per Regel (Einsatzprofil Stufe 1)', () => {
  it('Stufenwarnung nennt keine Evidenz, wo keine hinterlegt ist', () => {
    // Fixture: a stage entry without a reason as before Tor D2 (erfindungsaufgabe); since the gate every entry has one.
    const DX = mitEintraegen(D);
    const r = createMatcher(DX, createValidator(DX)).zuordnen({ modus: 'phase', lernfunktion: 'verstehen', bildungsstufe: 'primar' });
    const texte = r.modus === 'phase' ? r.vorschlaege.flatMap((v) => v.warnungen || []) : [];
    expect(texte.join(' ')).toMatch(/Setzung der Redaktion/);
    expect(texte.join(' ')).not.toMatch(/spricht die Evidenz dagegen/);
    const echt = M.zuordnen({ modus: 'phase', lernfunktion: 'verstehen', bildungsstufe: 'primar' });
    expect((echt.modus === 'phase' ? echt.vorschlaege.flatMap((v) => v.warnungen || []) : []).join(' ')).not.toMatch(/spricht die Evidenz dagegen/);
  });

  it('praktische Arbeit im Fachraum bekommt den Sicherheitshinweis, eine Deutschstunde nicht', () => {
    const chemie = M.zuordnen({ text: 'Chemie Klasse 8: Schülerexperiment zu Säuren und Laugen, 90 Minuten' });
    const s = (chemie.regelmeldungen || []).filter((m) => m.regel === 'sicherheitshinweis');
    expect(s.length).toBeGreaterThan(0);
    expect(chemie.hinweise || []).toContain(`${s[0].text} (${s[0].quelle})`);
    expect(s[0].text).toMatch(/Sicherheit und die Aufsicht/);
    const deutsch = M.zuordnen({ text: 'Deutsch Klasse 8 Gedichte, 45 Minuten' });
    expect((deutsch.regelmeldungen || []).some((m) => m.regel === 'sicherheitshinweis')).toBe(false);
    expect((deutsch.hinweise || []).some((h) => /Sicherheit/.test(h))).toBe(false);
  });
});

describe('Raumbedarf und Schriftbedarf (Einsatzprofil Stufe 2)', () => {
  const byId = new Map(D.bausteine.map((b) => [b.kennung, b]));

  it('ohne genannten Raum schließt der Raumbedarf nichts aus', () => {
    const r = M.zuordnen({ modus: 'phase', lernfunktion: 'orientierung' });
    expect(r.modus === 'phase' && r.zaehler.nachRahmen).toBe(r.modus === 'phase' && r.zaehler.nachFunktion);
  });

  it('lernort bleibt als Alias für raum gültig', () => {
    const a = M.zuordnen({ text: 'Biologie Klasse 7 Pflanzen, 45 Minuten', lernort: 'draussen' });
    const b = M.zuordnen({ text: 'Biologie Klasse 7 Pflanzen, 45 Minuten', raum: 'draussen' });
    expect(alleBausteine(a)).toEqual(alleBausteine(b));
    expect(a.kriterien.raum).toBe('draussen');
  });

  it('Lernende, die nicht lesen können: keine Methode mit Schriftbedarf', () => {
    const r = M.zuordnen({ text: 'Klasse 1, Kinder können noch nicht lesen, Thema Jahreszeiten, 45 Minuten' });
    expect(r.kriterien.ohneSchrift).toEqual(['lesen', 'schreiben']);
    for (const id of alleBausteine(r)) expect(byId.get(id)!.schriftbedarf || [], id).toEqual([]);
  });
});
