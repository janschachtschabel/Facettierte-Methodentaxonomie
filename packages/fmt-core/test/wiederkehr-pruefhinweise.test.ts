import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator, phasesForAdjustment, wiederkehrZeile } from '../src/index.js';
import type { WiederkehrNode } from '../src/types.js';
import { REIHE5 } from './qualitaet/faelle-reihe5.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));
const fall = (id: string) => {
  const f = REIHE5.find((x) => x.id === id)!;
  return M.zuordnen({ text: f.text, ...f.anfrage });
};
const wiederkehrKnoten = (r: ReturnType<typeof M.zuordnen>) =>
  r.modus === 'ablauf' && r.arrangement?.ablauf.typ === 'Sequenz'
    ? (r.arrangement.ablauf.teile.find((n) => n.typ === 'Wiederkehr') as WiederkehrNode | undefined)
    : undefined;

describe('Wiederkehr-Zeile des Verlaufsplans (Task Q1, U2)', () => {
  it('in Folgestunden: eigene Bezeichnung, 0 Minuten in der Stunde, die Minuten außerhalb in dauerAusserhalbMin', () => {
    const node: WiederkehrNode = { typ: 'Wiederkehr', baustein: 'abrufquiz', dauerMin: 5, anzahl: 3, abstand: 'P2D', ausserhalbBudget: true };
    expect(wiederkehrZeile(node)).toEqual({
      phaseLabel: 'Wiederkehr in Folgestunden (3× à 5 min)',
      durationMin: 0,
      dauerAusserhalbMin: 15,
      wiederkehr: true
    });
  });

  it('innerhalb des Budgets (Pläne über 180 min): Bezeichnung und Minuten wie bisher', () => {
    const node: WiederkehrNode = { typ: 'Wiederkehr', baustein: 'abrufquiz', dauerMin: 5, anzahl: 3, abstand: 'P2D' };
    expect(wiederkehrZeile(node)).toEqual({ phaseLabel: 'Wiederkehr (3× à 5 min)', durationMin: 15, wiederkehr: true });
  });

  it('ohne eigene Dauer gilt die Mindestdauer der Methode, ohne Anzahl ein Durchgang', () => {
    const node = { typ: 'Wiederkehr', baustein: 'abrufquiz', abstand: 'P2D' } as WiederkehrNode;
    const b = D.bausteine.find((x) => x.kennung === 'abrufquiz')!;
    expect(wiederkehrZeile(node, b)).toEqual({ phaseLabel: `Wiederkehr (1× à ${b.dauerMin} min)`, durationMin: b.dauerMin, wiederkehr: true });
  });

  it('die Phasen der Anpassung (adaptScenario) nehmen dieselbe Zeile', () => {
    const r = fall('gs1-deutsch-anlaute-ohneschrift');
    const w = wiederkehrKnoten(r)!;
    expect(w.ausserhalbBudget).toBe(true);
    const phasen = r.modus === 'ablauf' ? phasesForAdjustment(D, r.arrangement!) : [];
    expect(phasen.map((p) => p.label)).toContain(wiederkehrZeile(w).phaseLabel);
  });

  it('ein Plan über 180 Minuten plant die Wiederkehr in der Zeit (kein ausserhalbBudget)', () => {
    const r = M.zuordnen({ text: 'Fotosynthese', fachbereich: 'nawi-technik', bildungsstufe: 'sek1', zeitMin: 240, gruppe: 24, raum: 'klassenraum', zielart: 'konzepte' });
    const w = wiederkehrKnoten(r);
    expect(w).toBeTruthy();
    expect(w!.ausserhalbBudget).toBeUndefined();
    expect(wiederkehrZeile(w!).phaseLabel).toMatch(/^Wiederkehr \(3× à \d+ min\)$/);
  });
});

describe('Prüfmeldungen in den Hinweisen (Task Q1, U7)', () => {
  it('hs-bwl-fallstudie-online: der erste Hinweis sagt, dass der Ablauf unvollständig ist, nennt den Schritt und den Grund', () => {
    const r = fall('hs-bwl-fallstudie-online');
    expect(r.modus === 'ablauf' && r.pruefung?.gueltig).toBe(false);
    expect(r.hinweise?.[0]).toMatch(/^Der Ablauf ist unvollständig\. Der Schritt „Lösungsversuche“ ist offen: .*höchstens 35 Personen/);
    // The R-04 message itself is replaced by the sentence on the open step.
    expect(r.hinweise?.some((h) => h.includes('nicht abgedeckt'))).toBe(false);
  });

  it('die Prüfmeldung R-04 nennt den Lernzustand mit seiner Bezeichnung, nicht mit dem Code', () => {
    const r = fall('hs-bwl-fallstudie-online');
    const meldungen = r.modus === 'ablauf' ? r.pruefung!.meldungen : [];
    expect(meldungen.find((m) => m.regel === 'R-04')?.meldung).toBe('Funktion „Lösungsversuche“ ist nicht abgedeckt (Zielzustand Eigene Lösungsversuche liegen vor).');
    expect(JSON.stringify(r)).not.toContain('loesungsversuche');
  });

  it('hs-vorlesung-statistik-250: R-08 steht in den Hinweisen mit Regel und Phase', () => {
    const r = fall('hs-vorlesung-statistik-250');
    expect(r.hinweise).toContainEqual(expect.stringMatching(/^Mehr als 20 Minuten am Stück im passiven Modus\. \(Prüfregel R-08, Phase „.+“: .+\)$/));
  });

  it('eine Passungswarnung (R-06) steht nur einmal in den Hinweisen: als Regelmeldung', () => {
    const r = fall('integrationskurs-a2-arzt');
    expect(r.modus === 'ablauf' && r.pruefung!.meldungen.some((m) => m.regel === 'R-06')).toBe(true);
    expect(r.hinweise?.filter((h) => h.includes('das Sprachniveau ist aber niedrig'))).toHaveLength(1);
  });

  it('ein gültiger Plan ohne Prüfmeldung bekommt keinen neuen Hinweis', () => {
    const r = fall('gs2-sport-werfen');
    expect(r.modus === 'ablauf' && r.pruefung!.meldungen).toEqual([]);
    expect(r.hinweise?.some((h) => /Prüfregel|unvollständig|ist offen/.test(h))).toBe(false);
  });
});
