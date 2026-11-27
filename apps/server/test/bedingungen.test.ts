import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { loadFmtData } from '../../../packages/fmt-core/src/load-data.js';
import { buildApp } from '../src/app.js';
import { SZ } from '../../../scripts/szenariotest/szenarien.mts';
import { SOLL, SOLL_PRUEFSTAND, sollFuer, type Soll } from '../../../scripts/szenariotest/soll.mts';
import {
  BEDINGUNGEN,
  KEINE_METHODE_SATZ,
  PAKET,
  PRUEFER,
  katalogAus,
  pruefeAlle,
  zaehle,
  type Bedingung,
  type Eintrag,
  type Katalog,
  type Matrix
} from '../../../scripts/szenariotest/bedingungen.mts';

/**
 * Conditions B1–B14 of spec E12 (docs/superpowers/specs/2026-11-27-fmt21-ergaenzung.md), Task P0.1.
 * Part 1: each check on a hand-made answer that passes and one that fails.
 * Part 2: the same functions over the 56 scenarios (scripts/szenariotest/szenarien.mts), requests as run.mts sends them.
 * FREIGEGEBEN lists the conditions that must hold in all 56: each package task adds its conditions, none is ever removed.
 * The others are reported with their counts and do not fail.
 */
const FREIGEGEBEN: Bedingung[] = [];

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
type Json = Record<string, any>;

// ---------- Part 1: hand-made answers ----------

const methode = (kennung: string, felder: Json = {}) =>
  ({ kennung, name: felder.name ?? kennung, reichweite: 'r1', dauerMin: 5, dauerMax: 15, gruppeMin: 1, gruppeMax: 35, fachbereich: ['uebergreifend'], ...felder }) as any;
const KATALOG: Katalog = katalogAus({
  bausteine: [
    methode('impuls', { name: 'Stummer Impuls' }),
    methode('versuch', { name: 'Schülerversuch in Gruppen', reichweite: 'r2', dauerMin: 20, dauerMax: 45, gruppeMax: 30, fachbereich: ['nawi-technik'] }),
    methode('quiz', { name: 'Abrufquiz', schriftbedarf: ['schreibt'] }),
    methode('rahmen-methode', { name: 'Jenaplan', reichweite: 'r3', dauerMin: 90, dauerMax: 450 }),
    methode('sportspiel', { name: 'Spielform', reichweite: 'r2', dauerMin: 10, dauerMax: 30, fachbereich: ['sport'] })
  ],
  ketten: [
    {
      id: 'kette',
      label: 'Testkette',
      schritte: [
        { id: 's1', label: 'Einstieg', rolle: 'rand', zeitanteil: 20 },
        { id: 's2', label: 'Erarbeitung', rolle: 'haupt', zeitanteil: 60 },
        { id: 's3', label: 'Sicherung', rolle: 'sicherung', zeitanteil: 20 }
      ]
    }
  ] as any,
  schemes: [
    { id: 'raumtyp', werte: [{ id: 'fachraum-nawi', label: 'Fachraum Naturwissenschaften' }, { id: 'klassenraum', label: 'Klassen- oder Seminarraum' }] },
    { id: 'lernzustand', werte: [{ id: 'konzept-gesichert', label: 'Konzept gesichert' }] }
  ] as any
});

const zeile = (i: number, phaseLabel: string, durationMin: number, methodId: string | null, extra: Json = {}) => ({
  key: `step-${i}`,
  phaseLabel,
  durationMin,
  methodId,
  methodName: methodId ? KATALOG.bausteine.get(methodId)?.name : undefined,
  ...extra
});
function basis(): Eintrag {
  const rows = [zeile(0, 'Einstieg', 10, 'impuls'), zeile(1, 'Erarbeitung', 25, 'versuch'), zeile(2, 'Sicherung', 10, 'quiz')];
  const plan: Json = {
    thema: 'Verbrennung von Metallen',
    erkannteKriterien: { modus: 'ablauf', zeitMin: 45, gruppe: 24, raum: 'fachraum-nawi', bildungsstufe: 'sek1', fachbereich: 'nawi-technik' },
    pruefung: { gueltig: true, dauerMin: 45, meldungen: [] },
    hinweise: [],
    annahmen: [],
    regelmeldungen: [{ regel: 'sicherheitshinweis', text: 'Im Fachraum Naturwissenschaften wird mit „Schülerversuch in Gruppen“ gearbeitet. Kläre vorher Sicherheit und Aufsicht.' }],
    pflichtangaben: { fehlt: [], angenommen: [] },
    lerngruppenUndMatrix: [],
    zusatzphasen: [],
    teilgruppenMethoden: [],
    verankert: [],
    thematischeTabelle: rows,
    entwurf: { kernfelder: [{ id: 'lernvoraussetzungen', titel: 'Lernvoraussetzungen', inhalt: '- **Teilgruppen:** keine angegeben' }] },
    maschinenlesbar: {
      arrangement: {
        zieltyp: 'kette',
        ablauf: {
          typ: 'Sequenz',
          teile: [
            { typ: 'Einsatz', baustein: 'impuls', dauerMin: 10, kettenschritt: 's1' },
            { typ: 'Einsatz', baustein: 'versuch', dauerMin: 25, kettenschritt: 's2' },
            { typ: 'Einsatz', baustein: 'quiz', dauerMin: 10, kettenschritt: 's3' }
          ]
        }
      }
    }
  };
  return {
    id: 'test',
    anfrage: { text: 'Verbrennung von Metallen', fach: 'Chemie', zeitMin: 45, gruppe: 24, raum: 'fachraum-nawi', bildungsstufe: 'sek1' },
    plan: { status: 200, json: plan },
    match: { status: 200, json: { modus: 'ablauf', schritte: [{ baustein: 'impuls' }, { baustein: 'versuch' }, { baustein: 'quiz' }], erkannt: [], offen: [] } }
  };
}
const SOLL_BASIS: Soll = {
  nr: 0,
  id: 'test',
  zeitMin: { wert: 45, status: 'genannt' },
  gruppe: { wert: 24, status: 'genannt' },
  raumtyp: { wert: 'fachraum-nawi', status: 'genannt' },
  klassenstufe: 8,
  bildungsstufe: { wert: 'sek1', status: 'genannt' },
  fachbereich: { wert: 'nawi-technik', status: 'genannt' },
  anlass: null,
  kernhandlung: { wortlaut: 'Schülerversuch', methoden: ['versuch'], status: 'genannt' },
  ohneSchrift: null,
  zielSchrift: false,
  teilgruppen: [],
  gefahrRaum: true,
  erwarteterModus: 'ablauf'
};
const plan = (e: Eintrag) => e.plan.json;
const rows = (e: Eintrag) => plan(e).thematischeTabelle as Json[];
const teile = (e: Eintrag) => plan(e).maschinenlesbar.arrangement.ablauf.teile as Json[];
const pruefe = (b: Bedingung, e: Eintrag, soll: Partial<Soll> = {}) => PRUEFER[b](e, { ...SOLL_BASIS, ...soll }, KATALOG);
const erfuellt = (b: Bedingung, e: Eintrag, soll: Partial<Soll> = {}) => expect(pruefe(b, e, soll).status, pruefe(b, e, soll).detail).toBe('erfuellt');
const verletzt = (b: Bedingung, e: Eintrag, soll: Partial<Soll> = {}) => expect(pruefe(b, e, soll).status).toBe('verletzt');

describe('Bedingungsprüfer B1–B14 an Hand gebauter Antworten', () => {
  it('Pakete: jede Bedingung gehört genau einem Paket an', () => {
    expect(Object.values(PAKET).flat().sort()).toEqual([...BEDINGUNGEN].sort());
  });

  it('B1: Summe = Zeitvorgabe = pruefung.dauerMin; Wiederkehr in Folgestunden mit 0 Minuten', () => {
    const e = basis();
    rows(e).push(zeile(3, 'Wiederkehr in Folgestunden (3× à 5 min)', 0, 'quiz', { wiederkehr: true, dauerAusserhalbMin: 15 }));
    teile(e).push({ typ: 'Wiederkehr', baustein: 'quiz', dauerMin: 5, anzahl: 3, ausserhalbBudget: true });
    erfuellt('B1', e);
    const falsch = basis();
    rows(falsch).push(zeile(3, 'Wiederkehr (3× à 5 min)', 15, 'quiz', { wiederkehr: true, dauerAusserhalbMin: 15 }));
    verletzt('B1', falsch);
    const angenommen = basis();
    plan(angenommen).pflichtangaben.angenommen.push({ feld: 'zeit', wert: 45, grund: 'Keine Zeitangabe: eine Stunde von 45 Minuten angenommen.' });
    erfuellt('B1', angenommen, { zeitMin: null });
    expect(pruefe('B1', basis(), { zeitMin: null }).status).toBe('verletzt');
  });

  it('B2: ohne Schrift keine Methode mit Schriftbedarf', () => {
    const ohne = { ohneSchrift: { werte: ['lesen', 'schreiben'] as Array<'lesen' | 'schreiben'>, status: 'abgeleitet' as const } };
    verletzt('B2', basis(), ohne);
    const e = basis();
    rows(e)[2] = zeile(2, 'Sicherung', 10, 'impuls');
    teile(e)[2].baustein = 'impuls';
    erfuellt('B2', e, ohne);
    expect(pruefe('B2', basis()).status).toBe('entfaellt');
  });

  it('B3: die Kernhandlung besetzt den Hauptschritt und ist die längste Zeile', () => {
    erfuellt('B3', basis());
    const e = basis();
    rows(e)[1] = zeile(1, 'Erarbeitung', 25, 'impuls');
    verletzt('B3', e);
    const kurz = basis();
    rows(kurz)[0].durationMin = 30;
    verletzt('B3', kurz);
    const frei = basis();
    rows(frei)[1] = zeile(1, 'Schülerversuch: Eisenwolle verbrennen', 25, null);
    erfuellt('B3', frei, { kernhandlung: { wortlaut: 'Schülerversuch', methoden: 'frei', status: 'genannt' } });
  });

  it('B4: keine Methode der Reichweite r3/r4 als Phase', () => {
    erfuellt('B4', basis());
    const e = basis();
    plan(e).zusatzphasen = [{ kennung: 'rahmen-methode', name: 'Jenaplan' }];
    verletzt('B4', e);
  });

  it('B5: jede Phase zwischen Mindest- und Höchstdauer, Wiederkehr je Wiederholung', () => {
    erfuellt('B5', basis());
    const e = basis();
    rows(e)[1].durationMin = 15;
    verletzt('B5', e);
    const w = basis();
    rows(w).push(zeile(3, 'Wiederkehr in Folgestunden (3× à 2 min)', 0, 'quiz', { wiederkehr: true, dauerAusserhalbMin: 6 }));
    teile(w).push({ typ: 'Wiederkehr', baustein: 'quiz', dauerMin: 2, anzahl: 3, ausserhalbBudget: true });
    verletzt('B5', w);
  });

  it('B6: ungültiger Plan nennt die Lücke unter den Hinweisen, jede Prüfmeldung steht in Worten da', () => {
    erfuellt('B6', basis());
    const e = basis();
    plan(e).pruefung = { gueltig: false, dauerMin: 45, meldungen: [{ regel: 'R-04', schwere: 'Fehler', meldung: 'Funktion „Lösungsversuche“ ist nicht abgedeckt.' }] };
    verletzt('B6', e);
    plan(e).hinweise = ['Der Ablauf ist unvollständig. Der Schritt „Lösungsversuche“ ist offen.'];
    erfuellt('B6', e);
    const warn = basis();
    plan(warn).pruefung.meldungen = [{ regel: 'R-08', schwere: 'Warnung', meldung: 'Mehr als 20 Minuten am Stück im passiven Modus.' }];
    verletzt('B6', warn);
  });

  it('B7: ohne genannte Teilgruppe keine Gruppe, keine Zusatzphase; mit genannten genau diese', () => {
    erfuellt('B7', basis());
    const e = basis();
    plan(e).lerngruppenUndMatrix = [{ id: 'basis', label: 'Basisunterstützung & Sprachsensibel' }];
    verletzt('B7', e);
    const benannt = { teilgruppen: [{ id: 'daz', merkmal: 'DaZ', regelGreift: true }] };
    verletzt('B7', basis(), benannt);
    const g = basis();
    plan(g).lerngruppenUndMatrix = [{ id: 'daz', label: 'DaZ' }];
    erfuellt('B7', g, benannt);
  });

  it('B8: Sicherheitshinweis nur im Raum mit Gefahr, mit Raum und Kernhandlung', () => {
    erfuellt('B8', basis());
    verletzt('B8', basis(), { gefahrRaum: false });
    const ohne = basis();
    plan(ohne).regelmeldungen = [];
    verletzt('B8', ohne);
    const andere = basis();
    plan(andere).regelmeldungen[0].text = 'Im Fachraum Naturwissenschaften wird praktisch gearbeitet (z. B. Stummer Impuls).';
    verletzt('B8', andere);
  });

  it('B9: nicht genannte Werte stehen mit Grund unter den Annahmen', () => {
    erfuellt('B9', basis());
    const e = basis();
    plan(e).erkannteKriterien.ansatz = ['kooperativ'];
    (e.match!.json.erkannt as Json[]).push({ feld: 'ansatz', wert: ['kooperativ'], beleg: 'semantisch: Kooperatives Lernen' });
    verletzt('B9', e);
    plan(e).pflichtangaben.angenommen.push({ feld: 'ansatz', wert: ['kooperativ'], grund: 'Ansatz aus dem Text vermutet.' });
    erfuellt('B9', e);
    const abgeleitet = basis();
    verletzt('B9', abgeleitet, { raumtyp: { wert: 'fachraum-nawi', status: 'abgeleitet' } });
  });

  it('B10: keine „Phase N“, keine Codes, Thema wörtlich', () => {
    erfuellt('B10', basis());
    const phase = basis();
    rows(phase)[0].phaseLabel = 'Phase 2';
    verletzt('B10', phase);
    const code = basis();
    plan(code).hinweise = ['Mehr als 20 Minuten am Stück passiv. (Prüfregel R-08)'];
    verletzt('B10', code);
    const vokabel = basis();
    plan(vokabel).hinweise = ['Ziel konzept-gesichert wird erreicht.'];
    verletzt('B10', vokabel);
    const schritt = basis();
    rows(schritt)[1].learnerAction = 'Arbeiten in s2 weiter.';
    verletzt('B10', schritt);
    const thema = basis();
    plan(thema).thema = 'Verbrennung';
    verletzt('B10', thema);
  });

  it('B11: /match antwortet im selben Modus mit denselben Methoden', () => {
    erfuellt('B11', basis());
    const e = basis();
    e.match!.json.modus = 'phase';
    verletzt('B11', e);
    const reihenfolge = basis();
    reihenfolge.match!.json.schritte = [{ baustein: 'versuch' }, { baustein: 'impuls' }, { baustein: 'quiz' }];
    verletzt('B11', reihenfolge);
  });

  it('B12: keine Methode zweimal, Gruppengröße im Rahmen jeder Methode', () => {
    erfuellt('B12', basis());
    const doppelt = basis();
    rows(doppelt)[2] = zeile(2, 'Sicherung', 10, 'impuls');
    teile(doppelt)[2].baustein = 'impuls';
    verletzt('B12', doppelt);
    verletzt('B12', basis(), { gruppe: { wert: 40, status: 'genannt' } });
    const wiederkehr = basis();
    rows(wiederkehr).push(zeile(3, 'Wiederkehr in Folgestunden (3× à 5 min)', 0, 'quiz', { wiederkehr: true, dauerAusserhalbMin: 15 }));
    teile(wiederkehr).push({ typ: 'Wiederkehr', baustein: 'quiz', dauerMin: 5, anzahl: 3, ausserhalbBudget: true });
    erfuellt('B12', wiederkehr);
  });

  it('B13: genannte Teilgruppe mit greifender Regel bekommt Hilfe oder Tausch', () => {
    const tg = { teilgruppen: [{ id: 'daz', merkmal: 'DaZ', regelGreift: true }] };
    const e = basis();
    e.adapt = { status: 200, json: { phasenAnpassungen: [{ teilgruppenImpulse: [{ groupId: 'daz', antwort: 'passt' }] }] } };
    verletzt('B13', e, tg);
    e.adapt.json.phasenAnpassungen[0].teilgruppenImpulse[0].antwort = 'hilfe';
    erfuellt('B13', e, tg);
    plan(e).lerngruppenUndMatrix = [{ id: 'daz' }];
    verletzt('B13', e, tg);
    plan(e).teilgruppenMethoden = [{ groupId: 'daz', antwort: 'hilfe' }];
    erfuellt('B13', e, tg);
  });

  it('B14: Lücke mit Satz, Rückfall unter den Hinweisen, keine fachfremde Methode', () => {
    erfuellt('B14', basis());
    const fremd = basis();
    rows(fremd)[1] = zeile(1, 'Erarbeitung', 25, 'sportspiel');
    teile(fremd)[1].baustein = 'sportspiel';
    verletzt('B14', fremd);
    plan(fremd).verankert = [{ baustein: 'sportspiel' }];
    erfuellt('B14', fremd);
    const luecke = basis();
    rows(luecke)[1] = zeile(1, 'Erarbeitung', 25, null);
    verletzt('B14', luecke);
    rows(luecke)[1].methodProcedure = KEINE_METHODE_SATZ;
    erfuellt('B14', luecke);
    const rueck = basis();
    plan(rueck).rueckfall = [{ schritt: 'Erarbeitung', name: 'Aufgaben bearbeiten' }];
    verletzt('B14', rueck);
    plan(rueck).hinweise = ['Für „Erarbeitung“ passt keine Methode; die Grundform „Aufgaben bearbeiten“ springt ein.'];
    erfuellt('B14', rueck);
  });
});

// ---------- Part 2: the 56 scenarios ----------

describe('Bedingungen B1–B14 über die 56 Szenarien', () => {
  let app: FastifyInstance;
  let matrix: Matrix;

  beforeAll(async () => {
    app = await buildApp({
      distDataDir: path.join(ROOT, 'dist-data'),
      config: {
        port: 0,
        host: '127.0.0.1',
        corsOrigin: '*',
        llmBaseUrl: '',
        llmModel: '',
        llmApiKey: '',
        llmAllowByok: false,
        llmRateLimitPerMin: 100000,
        llmTimeoutMs: 5000,
        llmCacheMax: 100,
        llmCacheTtlMs: 60000
      }
    });
    const post = async (url: string, payload: Json) => {
      const r = await app.inject({ method: 'POST', url, payload });
      return { status: r.statusCode, json: r.json() as Json };
    };
    const ohne = (o: Json, keys: string[]) => Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k)));
    // Same requests as scripts/szenariotest/run.mts.
    const eintraege: Eintrag[] = [];
    for (const s of SZ) {
      const p = s.p as Json;
      const planAntwort = await post('/api/v1/plan', { ...p, umfang: 'voll' });
      let matchAnfrage = ohne(p, ['gruppen', 'umfang']);
      let match = await post('/api/v1/match', matchAnfrage);
      let matchNote = '';
      if (match.status === 400) {
        matchNote = 'erster Versuch 400';
        matchAnfrage = ohne(matchAnfrage, ['fach', 'lernziele', 'didaktischerAnsatz', 'einheit', 'bewertet']);
        match = await post('/api/v1/match', matchAnfrage);
      }
      const e: Eintrag = { id: s.id, anfrage: p, plan: planAntwort, match, matchNote };
      const arr = planAntwort.json?.maschinenlesbar?.arrangement;
      if (p.gruppen && arr) e.adapt = await post('/api/v1/adapt', { arrangement: arr, gruppen: p.gruppen, fach: p.fach, bildungsstufe: p.bildungsstufe, zeitMin: p.zeitMin, raum: p.raum, gruppe: p.gruppe });
      eintraege.push(e);
    }
    matrix = pruefeAlle(eintraege, sollFuer, katalogAus(loadFmtData(path.join(ROOT, 'data'))));
  });
  afterAll(async () => {
    await app.close();
  });

  it('der Maßstab soll.mts deckt die 56 Szenarien in derselben Reihenfolge ab und ist als ungeprüft markiert, bis der Torprüfer ihn freigibt', () => {
    expect(SOLL.map((s) => s.id)).toEqual(SZ.map((s) => s.id));
    expect(SOLL.map((s) => s.nr)).toEqual(SZ.map((_, i) => i + 1));
    expect(SOLL_PRUEFSTAND).toBe('ungeprüft');
  });

  it('jede Bedingung liefert für jedes Szenario ein Ergebnis mit Befund', () => {
    expect(Object.keys(matrix)).toHaveLength(56);
    for (const [id, zeile] of Object.entries(matrix))
      for (const b of BEDINGUNGEN) {
        expect(['erfuellt', 'verletzt', 'entfaellt'], `${id} ${b}`).toContain(zeile[b].status);
        if (zeile[b].status === 'verletzt') expect(zeile[b].detail.length, `${id} ${b}`).toBeGreaterThan(0);
      }
  });

  it('freigegebene Bedingungen gelten in allen 56 Szenarien; die übrigen werden gezählt', () => {
    const zahlen = zaehle(matrix);
    console.info(`Bedingungen (erfüllt/verletzt/entfällt): ${BEDINGUNGEN.map((b) => `${b} ${zahlen[b].erfuellt}/${zahlen[b].verletzt}/${zahlen[b].entfaellt}`).join(' · ')}`);
    for (const b of FREIGEGEBEN) {
      const verletzt = Object.entries(matrix).filter(([, z]) => z[b].status === 'verletzt').map(([id, z]) => `${id}: ${z[b].detail}`);
      expect(verletzt, b).toEqual([]);
    }
  });
});
