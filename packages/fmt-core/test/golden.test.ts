import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator } from '../src/index.js';
import type { MatchResult } from '../src/types.js';
import { LESEFAELLE, NENNUNGEN, THEMEN, szenarioText } from './golden-szenarien.js';

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
