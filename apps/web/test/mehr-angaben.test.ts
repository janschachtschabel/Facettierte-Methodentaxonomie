import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMatcher, createValidator, type CatalogBundle, type FmtData } from '@fmt/core';
import { MEHR_ANGABEN_CODEFELDER, mehrAngabenAusKontext, mehrAngabenInAnfrage, mehrAngabenLesen, ohneText } from '../src/planner/mehrAngaben.js';
import { entwurfAngabenAus, entwurfAngabenLesen } from '../src/planner/scenarioStorage.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const DATA = { ...BUNDLE, VERSION: BUNDLE.version } as unknown as FmtData;
const matcher = createMatcher(DATA, createValidator(DATA));
const felder = matcher.felder();
const werte = (feld: string) => (felder.find((f) => f.feld === feld)?.werte || []).map((w) => w.code);

describe('Mehr Angaben (Schritt 1): jede Angabe erreicht den Kern', () => {
  it('jedes Feld ist ein Feld von matcher.felder(), jedes Codefeld hat Werte aus dem Kern', () => {
    const namen = new Set(felder.map((f) => f.feld));
    const alle = mehrAngabenInAnfrage({
      bildungsstufe: 'sek1',
      vorwissen: 'gering',
      zeitMin: 45,
      sprachniveau: 'b1',
      komplexitaet: 'hoch',
      nachweis: 'muendlich',
      einheit: 'Lernfeld 3',
      bewertet: false,
      planungsprofil: 'berufsschule',
      lehrende: 2,
      fachausstattungArt: 'labor'
    });
    for (const k of Object.keys(alle)) expect(namen.has(k), k).toBe(true);
    for (const k of MEHR_ANGABEN_CODEFELDER) expect(werte(k).length, k).toBeGreaterThan(0);
    expect(alle).toEqual({
      bildungsstufe: 'sek1',
      vorwissen: 'gering',
      zeitMin: 45,
      sprachniveau: 'b1',
      komplexitaet: 'hoch',
      nachweis: 'muendlich',
      einheit: 'Lernfeld 3',
      bewertet: false,
      planungsprofil: 'berufsschule',
      lehrende: 2,
      fachausstattungArt: 'labor'
    });
  });

  it('Leeres wird nicht gesendet; bewertet bleibt offen, solange nichts gewählt ist', () => {
    expect(mehrAngabenInAnfrage({})).toEqual({});
    expect(mehrAngabenInAnfrage({ einheit: '  ', lehrende: 0, zeitMin: 0, bildungsstufe: '' })).toEqual({});
    expect(mehrAngabenInAnfrage({ einheit: ' Reihe Ökologie ' })).toEqual({ einheit: 'Reihe Ökologie' });
  });

  it('die Angaben gehen an die Zuordnung: Vorwissen, Stufe, Planungsprofil und bewertet stehen in den Kriterien', () => {
    const r = matcher.zuordnen({ text: 'Biologie, Fotosynthese, 45 Minuten', ...mehrAngabenInAnfrage({ bildungsstufe: 'sek2', vorwissen: 'hoch', planungsprofil: 'erwachsenenbildung', bewertet: true, lehrende: 2 }) });
    const k = r.kriterien as Record<string, unknown>;
    expect(k).toMatchObject({ bildungsstufe: 'sek2', vorwissen: 'hoch', bewertet: true, lehrende: 2 });
    expect(r.planungsprofil).toBe('erwachsenenbildung');
  });

  it('Lesen gespeicherter Angaben: nur gültige Werte, unbekannte Codes fallen weg', () => {
    const erlaubt = (feld: string) => werte(feld);
    const m = mehrAngabenLesen(
      { bildungsstufe: 'sek1', vorwissen: 'riesig', zeitMin: '45', sprachniveau: 'b2', bewertet: 'ja', einheit: 5, lehrende: 2, planungsprofil: 'schule', fachausstattungArt: 'kueche' },
      erlaubt
    );
    expect(m).toEqual({ bildungsstufe: 'sek1', sprachniveau: 'b2', lehrende: 2, planungsprofil: 'schule', fachausstattungArt: 'kueche' });
    expect(mehrAngabenLesen(null, erlaubt)).toBeUndefined();
    expect(mehrAngabenLesen([], erlaubt)).toBeUndefined();
    expect(mehrAngabenLesen({ bewertet: false, zeitMin: 90 }, erlaubt)).toEqual({ bewertet: false, zeitMin: 90 });
  });

  it('ohneText: die strukturierten Felder neben dem Text, ohne Leeres', () => {
    expect(ohneText({ text: 'x', zielart: 'verstehen', gruppe: 20, raum: undefined })).toEqual({ zielart: 'verstehen', gruppe: 20 });
  });
});

describe('EntwurfAngaben: bewertet und ein gewähltes Planungsprofil bleiben beim Speichern', () => {
  it('liest bewertet und planungsprofilGewaehlt aus der Antwort und aus der Datei', () => {
    const r = matcher.zuordnen({ text: 'Biologie Klasse 7, Fotosynthese, 45 Minuten', bewertet: true, planungsprofil: 'schule' });
    const a = entwurfAngabenAus(r);
    expect(a.bewertet).toBe(true);
    expect(a.planungsprofilGewaehlt).toBe(true);
    const b = entwurfAngabenAus(matcher.zuordnen({ text: 'Biologie Klasse 7, Fotosynthese, 45 Minuten' }));
    expect(b.bewertet).toBeUndefined();
    expect(b.planungsprofilGewaehlt).toBe(false);
    expect(entwurfAngabenLesen({ bewertet: false, planungsprofilGewaehlt: true })).toMatchObject({ bewertet: false, planungsprofilGewaehlt: true });
    expect(entwurfAngabenLesen({ bewertet: 'ja' })!.bewertet).toBeUndefined();
  });

  it('gewaehlt: nur Felder, die die Anfrage ausdrücklich setzt, nicht was der Text sagt', () => {
    const text = 'Biologie Klasse 7, Fotosynthese, 45 Minuten, Einheit Lernfeld 3, wird benotet';
    expect(entwurfAngabenAus(matcher.zuordnen({ text })).gewaehlt).toEqual([]);
    expect(entwurfAngabenAus(matcher.zuordnen({ text, einheit: 'Reihe X', nachweis: 'produkt' })).gewaehlt).toEqual(['einheit', 'nachweis']);
    expect(entwurfAngabenLesen({ gewaehlt: ['bewertet', 'raum'] })!.gewaehlt).toEqual(['bewertet']);
    // The fields of "Mehr Angaben" that the fit rules read count as well (R02: clearing them leaves the rule situation).
    expect(entwurfAngabenAus(matcher.zuordnen({ text, sprachniveau: 'a1', vorwissen: 'hoch' })).gewaehlt).toEqual(['vorwissen', 'sprachniveau']);
    expect(entwurfAngabenLesen({ gewaehlt: ['komplexitaet', 'bildungsstufe'] })!.gewaehlt).toEqual(['komplexitaet', 'bildungsstufe']);
  });
});

describe('Mehr Angaben aus dem Kontext eines alten Szenarios (Schlussreview, Minor 3)', () => {
  const erlaubt = (feld: (typeof MEHR_ANGABEN_CODEFELDER)[number]) => werte(feld);
  it('liest Stufe (auch das alte Feld stufe), Vorwissen, Sprachniveau, Komplexität und Zeitbudget; Unbekanntes entfällt', () => {
    expect(mehrAngabenAusKontext({ bildungsstufe: 'sek1', vorwissen: 'gering', sprachniveau: 'b1', komplexitaet: 'hoch', zeitbudgetMin: 90 }, erlaubt)).toEqual({
      bildungsstufe: 'sek1',
      vorwissen: 'gering',
      sprachniveau: 'b1',
      komplexitaet: 'hoch',
      zeitMin: 90
    });
    expect(mehrAngabenAusKontext({ stufe: 'primar', vorwissen: 'quatsch', zeitbudgetMin: -5 }, erlaubt)).toEqual({ bildungsstufe: 'primar' });
    expect(mehrAngabenAusKontext(undefined, erlaubt)).toEqual({});
  });
});
