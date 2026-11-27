import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator, extractSubjectAndTopic } from '../src/index.js';
import { QUALITAETSFAELLE } from './qualitaet/faelle.js';
import { REIHE2 } from './qualitaet/faelle-reihe2.js';
import { REIHE4 } from './qualitaet/faelle-reihe4.js';
import { REIHE5 } from './qualitaet/faelle-reihe5.js';
import { SZ } from '../../../scripts/szenariotest/szenarien.mts';
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
  // The topic stays literal (FMT 2.1 E3): a subject word at the start without a separator stays in the topic.
  it.each([
    ['Ich will ein Szenario unterstellen für den Sportunterricht 45 minuten - ausdauertraining mit anschließender leistungskontrolle', 'Sport', 'ausdauertraining'],
    ['Physik Klasse 9 Ohmsches Gesetz, 45 Minuten, Lernzielkontrolle am Ende', 'Physik', 'Physik Ohmsches Gesetz'],
    ['Sport Klasse 8 Weitsprung mit Leistungsmessung am Ende, Doppelstunde', 'Sport', 'Sport Weitsprung'],
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

describe('Testreihe 4 (FMT 2.0, n01 bis n20)', () => {
  const reihe4 = REIHE4.map((f) => pruefeFall(f, M, D));
  it('enthält die 20 Fälle n01 bis n20', () => {
    expect(REIHE4.map((f) => f.id)).toEqual(Array.from({ length: 20 }, (_, i) => `n${String(i + 1).padStart(2, '0')}`));
  });
  it.each(reihe4.map((e) => [e.fall.id, e] as const))('%s: jede offene Prüfung ist als bekannt markiert', (_id, e) => {
    const offen = e.befunde.filter((b) => !b.ok && !b.bekannt).map((b) => `${b.pruefung}: ${b.detail}`);
    expect(offen, `${e.fall.text}\n→ ${e.ablauf.join(' > ')}`).toEqual([]);
  });
  it('bekannt steht nur an einer Prüfung, die nicht besteht (nach Paket D, D7)', () => {
    // A marker on a check that passes would hide a later regression; after Paket D only real reasons remain.
    const veraltet = reihe4.flatMap((e) =>
      Object.keys(e.fall.bekannt || {})
        .filter((p) => !e.befunde.some((b) => b.pruefung === p && !b.ok))
        .map((p) => `${e.fall.id}: ${p}`)
    );
    expect(veraltet).toEqual([]);
  });
});

describe('Testreihe 5 (Szenariotest 2026-11-27, 56 Szenarien)', () => {
  const reihe5 = REIHE5.map((f) => pruefeFall(f, M, D));
  it('enthält die 56 Szenarien von szenarien.mts: Kennung, Text und Felder wörtlich (fach als fachbereich)', () => {
    expect(REIHE5.map((f) => f.id)).toEqual(SZ.map((s) => s.id));
    for (const s of SZ) {
      const f = REIHE5.find((x) => x.id === s.id)!;
      const { text, fach, gruppen: _gruppen, ...felder } = s.p as Record<string, unknown>;
      expect(f.text, s.id).toBe(text);
      // Only the request fields of the scenario; modus is the one addition a task asks for (Q3: plan, not phase).
      const { modus: _modus, fachbereich, ...anfrage } = f.anfrage || {};
      expect(anfrage, s.id).toEqual(felder);
      expect(fachbereich !== undefined, s.id).toBe(fach !== undefined);
    }
  });
  it.each(reihe5.map((e) => [e.fall.id, e] as const))('%s: jede offene Prüfung ist als bekannt markiert', (_id, e) => {
    const offen = e.befunde.filter((b) => !b.ok && !b.bekannt).map((b) => `${b.pruefung}: ${b.detail}`);
    expect(offen, `${e.fall.text}\n→ ${e.ablauf.join(' > ')}`).toEqual([]);
  });
  it('bekannt steht nur an einer Prüfung, die nicht besteht', () => {
    // Each later task removes its own marker ("wartet auf Q…"); a marker on a passing check would hide a later regression.
    const veraltet = reihe5.flatMap((e) =>
      Object.keys(e.fall.bekannt || {})
        .filter((p) => !e.befunde.some((b) => b.pruefung === p && !b.ok))
        .map((p) => `${e.fall.id}: ${p}`)
    );
    expect(veraltet).toEqual([]);
  });
});
