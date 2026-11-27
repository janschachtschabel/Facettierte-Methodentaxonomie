import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import type { Arrangement, Baustein } from '../src/types.js';
import { createValidator } from '../src/validate.js';
import { createSearch } from '../src/suche.js';
import { baueSituation } from '../src/situation.js';
import { scoreDifferentiationMatrix } from '../src/differentiationMatrix.js';
import { teilgruppenProfil } from '../src/methodAdjustments.js';
import {
  GLEICHWERTIG_GEPRUEFT,
  OHNE_GLEICHWERTIGKEITSPRUEFUNG,
  alternativenFuerTeilgruppe,
  ausschlussInSituation,
  kettenSchritt,
  pruefeAlternativen
} from '../src/alternativen.js';
import * as core from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const BY = new Map(D.bausteine.map((b) => [b.kennung, b] as const));
const b = (k: string) => BY.get(k)!;
const REGELWERK = { teilgruppen: D.teilgruppen, regeln: D.regeln, schemes: D.schemes };

describe('Kandidatenfilter nach Situation (Bedarf, Bindung, Eintragsart)', () => {
  it('wird aus @fmt/core exportiert', () => {
    expect(typeof core.ausschlussInSituation).toBe('function');
    expect(typeof core.pruefeAlternativen).toBe('function');
    expect(typeof core.alternativenFuerTeilgruppe).toBe('function');
    expect(core.OHNE_GLEICHWERTIGKEITSPRUEFUNG).toBe('ohne Gleichwertigkeitsprüfung');
  });

  it('schließt eine Methode aus, die liest, wenn die Gruppe nicht lesen kann', () => {
    const anfrage = { ohneSchrift: ['lesen'] };
    const s = baueSituation(anfrage, D);
    expect(ausschlussInSituation(b('kooperatives-skript'), { anfrage, situation: s, data: D })?.merkmal).toBe('schriftbedarf');
    expect(ausschlussInSituation(b('vortrag-prompts'), { anfrage, situation: s, data: D })).toBeNull();
  });

  it('schließt nach genanntem Raum aus, nie nach einem angenommenen', () => {
    const genannt = { raum: 'draussen' };
    const ohne = {};
    const k = b('einzelarbeit-uebung');
    expect(k.raumbedarf).toContain('schreibplatz');
    expect(ausschlussInSituation(k, { anfrage: genannt, situation: baueSituation(genannt, D), data: D })?.merkmal).toBe('raumbedarf');
    expect(ausschlussInSituation(k, { anfrage: ohne, situation: baueSituation(ohne, D), data: D })).toBeNull();
  });

  it('schließt nach Terminen aus (termineMin)', () => {
    const anfrage = { termine: 1 };
    const s = baueSituation(anfrage, D);
    expect(ausschlussInSituation(b('microlearning-spaced'), { anfrage, situation: s, data: D })?.merkmal).toBe('termineMin');
  });

  it('achtet die Wissensart-Bindung des Kettenschritts', () => {
    const k2 = kettenSchritt(D, 'konzeptaufbau', 'k2')!;
    expect(k2.wissensart).toContain('konzepte');
    const fremd = D.bausteine.find((x) => (x.aufgabe || []).includes('psychomotorik') && !(x.aufgabe || []).includes('konzepte'))!;
    expect(ausschlussInSituation(fremd, { schritt: k2, data: D })?.merkmal).toBe('wissensart');
    // An edge step does not bind.
    expect(ausschlussInSituation(fremd, { schritt: kettenSchritt(D, 'konzeptaufbau', 'k1')!, data: D })).toBeNull();
  });

  it('eine Hilfe ist nie ein Kandidat', () => {
    const hilfe: Baustein = { ...b('vortrag-prompts'), kennung: 'x-hilfe', eintragsart: 'hilfe' };
    expect(ausschlussInSituation(hilfe, { data: D })?.merkmal).toBe('eintragsart');
  });
});

describe('Alternativen für Teilgruppen', () => {
  const matrix = scoreDifferentiationMatrix({ personaId: 'languageAndCulture' });

  it('mit geplanter Methode, Profil und Regeln: nur gleichwertige, als geprüft markiert', () => {
    const geplant = b('lehrervortrag');
    const profil = teilgruppenProfil({ id: 'daz', label: 'DaZ', personaId: 'languageAndCulture' }, D.teilgruppen);
    const r = alternativenFuerTeilgruppe(matrix, geplant, D.bausteine, D, {
      limit: 50,
      kontext: { anfrage: { ohneSchrift: ['lesen'] }, profil, regelwerk: REGELWERK }
    });
    expect(r.gleichwertigGeprueft).toBe(true);
    expect(r.alternativen.every((a) => a.gleichwertigGeprueft && a.pruefung === GLEICHWERTIG_GEPRUEFT)).toBe(true);
    // Every result passes the core equivalence check and reads no text.
    for (const a of r.alternativen) {
      const s = baueSituation({ ohneSchrift: ['lesen'] }, D);
      expect(ausschlussInSituation(b(a.kennung), { anfrage: { ohneSchrift: ['lesen'] }, situation: s, data: D })).toBeNull();
      expect(b(a.kennung).schriftbedarf || []).not.toContain('liest');
    }
    expect(r.alternativen.map((a) => a.kennung)).not.toContain('kooperatives-skript');
    expect(r.ausgeschlossen.some((x) => x.kennung === 'kooperatives-skript')).toBe(true);
  });

  it('ohne Profil oder Regeln: Rückfall auf Bedarf und Bindung, markiert „ohne Gleichwertigkeitsprüfung“', () => {
    const geplant = b('lehrervortrag');
    const r = alternativenFuerTeilgruppe(matrix, geplant, D.bausteine, D, { limit: 50, kontext: { anfrage: { ohneSchrift: ['lesen'] } } });
    expect(r.gleichwertigGeprueft).toBe(false);
    expect(r.hinweis).toMatch(/ohne Gleichwertigkeitsprüfung/i);
    expect(r.alternativen.length).toBeGreaterThan(0);
    expect(r.alternativen.every((a) => !a.gleichwertigGeprueft && a.pruefung === OHNE_GLEICHWERTIGKEITSPRUEFUNG)).toBe(true);
    expect(r.alternativen.map((a) => a.kennung)).not.toContain('kooperatives-skript');
    expect(r.alternativen.map((a) => a.kennung)).toContain('vortrag-prompts');
  });

  it('gibt die alten Felder unverändert weiter und hält das Limit', () => {
    const r = alternativenFuerTeilgruppe(matrix, b('gruppenpuzzle'), D.bausteine, D, { limit: 3 });
    expect(r.alternativen.length).toBeLessThanOrEqual(3);
    for (const a of r.alternativen) {
      expect(a).toEqual(expect.objectContaining({ kennung: expect.any(String), name: expect.any(String), reichweite: expect.any(String), grund: expect.any(String) }));
    }
  });

  it('pruefeAlternativen ohne geplante Methode: nicht geprüft', () => {
    const r = pruefeAlternativen([{ kennung: 'vortrag-prompts' }], undefined, BY, D, {});
    expect(r.gleichwertigGeprueft).toBe(false);
    expect(r.alternativen[0].pruefung).toBe(OHNE_GLEICHWERTIGKEITSPRUEFUNG);
  });
});

describe('search.ersatz mit Situation und Bindung', () => {
  const V = createValidator(D);
  const S = createSearch(D, V);
  const reg = new Map(D.beispiele.filter((a) => a['@id']).map((a) => [a['@id']!, a] as [string, Arrangement]));
  const dichte = D.beispiele.find((a) => (a['@id'] || '').includes('dichte-reihe'))!;

  it('bleibt ohne Situation rückwärtsverträglich', () => {
    expect(S.ersatz(dichte, '/ablauf/haupt/teile/1', reg).map((x) => x.baustein)).toContain('vortrag-prompts');
  });

  it('achtet die Wissensart des Kettenschritts (k2: konzepte)', () => {
    const k = S.ersatz(dichte, '/ablauf/haupt/teile/1', reg).map((x) => x.baustein);
    const schritt = kettenSchritt(D, 'konzeptaufbau', 'k2')!;
    for (const id of k) expect(ausschlussInSituation(b(id), { schritt, data: D }), id).toBeNull();
  });

  it('nimmt die Situation an (ohneSchrift, raum, termine)', () => {
    const ohne = S.ersatz(dichte, '/ablauf/haupt/teile/1', reg).map((x) => x.baustein);
    const mit = S.ersatz(dichte, '/ablauf/haupt/teile/1', reg, { ohneSchrift: ['lesen', 'schreiben'], termine: 1 }).map((x) => x.baustein);
    expect(mit.length).toBeLessThan(ohne.length);
    for (const id of mit) {
      expect(b(id).schriftbedarf || [], id).toEqual([]);
      expect((b(id).termineMin ?? 0) <= 1, id).toBe(true);
    }
  });

  it('ersatzPruefung nennt den Bedarf der Kandidaten und die ausgeschlossenen Methoden mit Merkmal und Grund', () => {
    const lage = { ohneSchrift: ['lesen', 'schreiben'], termine: 1 };
    const r = S.ersatzPruefung(dichte, '/ablauf/haupt/teile/1', reg, lage);
    expect(r.kandidaten).toEqual(S.ersatz(dichte, '/ablauf/haupt/teile/1', reg, lage));
    const vp = r.kandidaten.find((k) => k.baustein === 'vortrag-prompts')!;
    expect(vp.raumbedarf).toEqual(b('vortrag-prompts').raumbedarf || []);
    expect(vp.schriftbedarf).toEqual([]);
    expect(r.ausgeschlossen.find((a) => a.baustein === 'kooperatives-skript')?.merkmal).toBe('schriftbedarf');
    expect(r.ausgeschlossen.some((a) => a.merkmal === 'wissensart')).toBe(true);
    // Helps are never candidates and are not listed.
    expect(r.ausgeschlossen.every((a) => b(a.baustein).eintragsart !== 'hilfe')).toBe(true);
  });
});

describe('search.suche: ohneSchrift und termine', () => {
  const S = createSearch(D, createValidator(D));
  it('ohneSchrift lässt Methoden weg, die lesen oder schreiben verlangen', () => {
    const ids = S.suche({ ohneSchrift: ['lesen'] }).map((x) => x.kennung);
    expect(ids).not.toContain('kooperatives-skript');
    expect(ids).toContain('vortrag-prompts');
    expect(S.suche({ ohneSchrift: 'schreiben' }).every((x) => !(x.schriftbedarf || []).includes('schreibt'))).toBe(true);
    expect(S.suche({ ohneSchrift: true }).every((x) => !(x.schriftbedarf || []).length)).toBe(true);
  });
  it('termine lässt Methoden weg, die mehr Termine brauchen', () => {
    const ids = S.suche({ termine: 1 }).map((x) => x.kennung);
    expect(ids).not.toContain('microlearning-spaced');
    expect(S.suche({ termine: 2 }).map((x) => x.kennung)).toContain('microlearning-spaced');
  });
});
