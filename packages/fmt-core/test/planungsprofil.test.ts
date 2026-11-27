import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { waehlePlanungsprofil } from '../src/planungsprofil.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const P = D.planungsprofile.profile;
const quelle = JSON.parse(
  fs.readFileSync('/mnt/project-files/fmt2/quellen/fmt2-vorschlag/fmt2-regelsatz.json', 'utf8')
).planungsprofile;

const wahl = (a: Parameters<typeof waehlePlanungsprofil>[1]) => {
  const r = waehlePlanungsprofil(P, a);
  return [r.profil.id, r.angenommen] as const;
};

describe('Planungsprofile: Daten', () => {
  it('fünf Profile und sieben Kernfelder', () => {
    expect(P.map((p) => p.id)).toEqual(['schule', 'berufsschule', 'betrieb', 'hochschule', 'erwachsenenbildung']);
    expect(D.planungsprofile.kernfelder.map((k) => k.id)).toEqual([
      'rahmendaten', 'lernvoraussetzungen', 'ziele', 'einordnung', 'verlauf', 'lernerfolg', 'reflexion'
    ]);
  });
  it('jedes Profil nennt alle Begriffe wörtlich aus dem Regelsatz', () => {
    P.forEach((p, i) => {
      const q = quelle.bereiche[i];
      for (const k of ['bildungsstufe', 'einheit', 'groessereEinheit', 'dokument', 'lehrende', 'lernende', 'status'] as const) {
        expect(p[k], `${p.id}.${k}`).toEqual(q[k]);
      }
      expect(p.module.map((m) => m.id)).toEqual(q.module);
      p.module.forEach((m) => expect(m.name.length).toBeGreaterThan(2));
    });
  });
  it('Kernfelder stimmen mit dem Regelsatz überein', () => {
    expect(D.planungsprofile.kernfelder).toEqual(quelle.kernfelder);
  });
  it('das Vokabular führt das Schema planungsprofil mit den fünf Kennungen', () => {
    const s = D.schemes.find((x) => x.id === 'planungsprofil')!;
    expect((s.werte || []).map((w) => w.id)).toEqual(P.map((p) => p.id));
  });
});

describe('Planungsprofil wählen', () => {
  it('ausdrückliches planungsprofil gewinnt', () => {
    expect(wahl({ planungsprofil: 'hochschule', bildungsstufe: 'sek1' })).toEqual(['hochschule', false]);
  });
  it('unbekanntes planungsprofil wird übergangen', () => {
    expect(wahl({ planungsprofil: 'xyz', bildungsstufe: 'hochschule' })).toEqual(['hochschule', false]);
    expect(wahl({ planungsprofil: 'xyz' })).toEqual(['schule', true]);
  });
  it.each(['primar', 'sek1', 'sek2'])('%s ergibt schule', (b) => {
    expect(wahl({ bildungsstufe: b })).toEqual(['schule', false]);
  });
  it('hochschule und erwachsenenbildung', () => {
    expect(wahl({ bildungsstufe: 'hochschule' })).toEqual(['hochschule', false]);
    expect(wahl({ bildungsstufe: 'erwachsenenbildung' })).toEqual(['erwachsenenbildung', false]);
  });
  it('berufsbildung ohne Betriebswörter ergibt berufsschule', () => {
    expect(wahl({ bildungsstufe: 'berufsbildung' })).toEqual(['berufsschule', false]);
    expect(wahl({ bildungsstufe: 'berufsbildung', text: 'Lernfeld 3, Werkstatt' })).toEqual(['berufsschule', false]);
    expect(wahl({ bildungsstufe: 'berufsbildung', text: 'Betriebswirtschaft' })).toEqual(['berufsschule', false]);
  });
  it.each(['Betrieb', 'Unterweisung', 'Ausbilder', 'Ausbilderin', 'Lehrwerkstatt', 'am Arbeitsplatz'])(
    'berufsbildung mit „%s“ ergibt betrieb',
    (w) => {
      expect(wahl({ bildungsstufe: 'berufsbildung', text: `Übung im ${w.toLowerCase()} heute` })).toEqual(['betrieb', false]);
    }
  );
  it('ohne Bildungsstufe: schule, angenommen', () => {
    expect(wahl({})).toEqual(['schule', true]);
    expect(wahl({ text: 'Betrieb' })).toEqual(['schule', true]);
  });
  it('Testfälle n13 bis n16', () => {
    const berufsbildung = (text: string) => wahl({ bildungsstufe: 'berufsbildung', text })[0];
    expect(berufsbildung('Berufsschule, Lernfeld 3 Kfz-Mechatronik, Bremsanlage prüfen, Werkstatt, 180 Minuten')).toBe('berufsschule');
    expect(berufsbildung('Betrieb, Auszubildende im 1. Lehrjahr, Unterweisung Bohren an der Ständerbohrmaschine, 15 Minuten')).toBe('betrieb');
    expect(wahl({ bildungsstufe: 'hochschule', text: 'Hochschule, Seminar Statistik' })[0]).toBe('hochschule');
    expect(wahl({ bildungsstufe: 'erwachsenenbildung', text: 'Volkshochschule, Kochkurs' })[0]).toBe('erwachsenenbildung');
  });
});
