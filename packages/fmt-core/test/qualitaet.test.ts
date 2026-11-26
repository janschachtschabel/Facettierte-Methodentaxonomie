import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator, extractSubjectAndTopic } from '../src/index.js';
import { QUALITAETSFAELLE } from './qualitaet/faelle.js';
import { REIHE2 } from './qualitaet/faelle-reihe2.js';
import { pruefeFall, variabilitaet } from './qualitaet/pruefen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));
const ergebnisse = QUALITAETSFAELLE.map((f) => pruefeFall(f, M, D));

describe('Qualitätstest: realistische Anfragen fachdidaktisch geprüft', () => {
  it.each(ergebnisse.map((e) => [e.fall.id, e] as const))('%s', (_id, e) => {
    const offen = e.befunde.filter((b) => !b.ok && !b.bekannt).map((b) => `${b.pruefung}: ${b.detail}`);
    expect(offen, `${e.fall.text}\n→ ${e.ablauf.join(' > ')}`).toEqual([]);
  });

  it('variabilitaet: verschiedene Anfragen ergeben verschiedene Abläufe', () => {
    const v = variabilitaet(ergebnisse.filter((e) => e.ergebnis.modus === 'ablauf').map((e) => e.ablauf));
    expect(v.haeufigsterAnteil).toBeLessThanOrEqual(0.15);
    const sport = variabilitaet(ergebnisse.filter((e) => e.fall.id.startsWith('sport-')).map((e) => e.ablauf));
    expect(sport.verschieden).toBeGreaterThanOrEqual(6);
  });

  it('einstieg-sport: nicht jeder Sportablauf beginnt mit derselben Methode', () => {
    const starts = new Set(ergebnisse.filter((e) => e.fall.id.startsWith('sport-')).map((e) => e.ablauf[0]));
    expect(starts.size).toBeGreaterThanOrEqual(3);
  });
});

describe('Qualitätstest: Thema aus der Anfrage', () => {
  it.each([
    ['Ich will ein Szenario unterstellen für den Sportunterricht 45 minuten - ausdauertraining mit anschließender leistungskontrolle', 'Sport', 'ausdauertraining'],
    ['Physik Klasse 9 Ohmsches Gesetz, 45 Minuten, Lernzielkontrolle am Ende', 'Physik', 'Ohmsches Gesetz'],
    ['Sport Klasse 8 Weitsprung mit Leistungsmessung am Ende, Doppelstunde', 'Sport', 'Weitsprung'],
    ['Geschichte: Ablauf der Französischen Revolution, 45 Minuten', 'Geschichte', 'Ablauf der Französischen Revolution'],
    ['Musikunterricht Klasse 5: Rhythmus klatschen, 45 Minuten', 'Musik', 'Rhythmus klatschen']
  ])('%s', (text, fach, thema) => {
    expect(extractSubjectAndTopic(text)).toEqual({ fach, thema });
  });
});

describe('Testreihe 2 (nur Bericht)', () => {
  it('alle Anfragen laufen ohne Fehler durch', () => {
    for (const f of REIHE2) expect(() => pruefeFall(f, M, D), f.id).not.toThrow();
  });
});
