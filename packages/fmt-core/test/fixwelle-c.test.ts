import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import {
  adaptScenario,
  createMatcher,
  createValidator,
  detectLearnerGroupsFromText,
  entscheideTeilgruppe,
  QUICK_LEARNER_GROUP_PROFILES,
  schnellprofilGruppe,
  scoreDifferentiationMatrix,
  teilgruppenAntworten,
  teilgruppenProfil,
  type AdaptScenarioResult,
  type MethodAdjustmentGroup,
  type MethodAdjustmentPhase
} from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));
const R = { teilgruppen: D.teilgruppen, regeln: D.regeln, schemes: D.schemes };
const T = D.teilgruppen;
const block = (kennung: string) => {
  const b = D.bausteine.find((x) => x.kennung === kennung);
  if (!b) throw new Error(`Baustein ${kennung} fehlt`);
  return b;
};
const phasen = (...ids: string[]): MethodAdjustmentPhase[] =>
  ids.map((k, i) => ({ key: `s${i}`, label: block(k).name, block: block(k), durationMin: 20 }));
const preset = (id: string) => QUICK_LEARNER_GROUP_PROFILES.find((p) => p.id === id)!;

function adaptiere(text: string, lerngruppenText: string): AdaptScenarioResult {
  const r = M.zuordnen({ text });
  if (r.modus !== 'ablauf' || !r.arrangement) throw new Error(`kein Ablauf für ${text}`);
  return adaptScenario(D, { arrangement: r.arrangement, lerngruppenText });
}
const impulse = (res: AdaptScenarioResult, groupId: string) =>
  res.phasenAnpassungen.flatMap((p) => p.teilgruppenImpulse.filter((t) => t.groupId === groupId).map((t) => ({ ...t, phase: p })));

const KEINE = new Set(['method', 'dersel', 'diesel', 'vorsch', 'belegt', 'grenze', 'dafuer', 'gleich']);
const stems = (s: string) =>
  new Set(
    s
      .toLowerCase()
      .split(/[^a-zäöüß]+/)
      .filter((w) => w.length >= 6)
      .map((w) => w.slice(0, 6))
      .filter((w) => !KEINE.has(w))
  );
const teilmenge = (a: Set<string>, b: Set<string>) => a.size > 0 && [...a].every((w) => b.has(w));

const N07 = ['Mathematik Klasse 8, lineare Funktionen, 90 Minuten, Erfindungsaufgabe mit kontrastierenden Fällen', '6 Lernende mit geringem Vorwissen'] as const;
const N08 = ['Biologie Klasse 7, Fotosynthese, 45 Minuten', '4 Lernende DaZ Niveau A2'] as const;
const N10 = ['Geschichte Klasse 9, Weimarer Republik, 90 Minuten, Lehrervortrag', '5 Leistungsstarke'] as const;

describe('Fix wave Paket C, 1a: nur genannte Werte entscheiden', () => {
  it('jedes Schnellprofil nennt seine Kernwerte; sie stehen in seinen Werten', () => {
    for (const p of QUICK_LEARNER_GROUP_PROFILES) {
      expect(p.kern.length, p.id).toBeGreaterThan(0);
      for (const w of p.kern) expect(Object.values(p.selectedValues), `${p.id}: ${w}`).toContain(w);
    }
    expect(preset('vorwissen-gering').kern).toEqual(['vorwissen-gering', 'leistungsniveau-gering']);
    expect([...preset('vertiefung').kern].sort()).toEqual(['leistungsniveau-hoch', 'vorwissen-hoch']);
    expect(preset('daz').kern).toContain('sprachkompetenz-gering');
  });

  it('die im Text erkannte Gruppe nennt die Kernwerte ihres Musters', () => {
    const g = detectLearnerGroupsFromText('6 Lernende mit geringem Vorwissen').groups[0];
    expect(g.id).toBe('vorwissen-gering');
    expect(g.genannt).toEqual(['vorwissen-gering', 'leistungsniveau-gering']);
    // The extra values stay for the order of the matrix.
    expect(g.selectedValues?.lernstrategien).toBe('lernstrategien-kaum');
  });

  it('ein Zusatzwert des Profils (lernstrategien-kaum) löst keine U-Zeile aus', () => {
    const g = schnellprofilGruppe(preset('vorwissen-gering'));
    // Guided method: the low prior knowledge row is not set off, the extra value must not give a help.
    const e = entscheideTeilgruppe(block('rosenshine-daily-review'), teilgruppenProfil(g, T), T);
    expect(e.antwort).toBe('passt');
    // Without the core list every value counts (explicit selectedValues): the U row answers.
    const explizit = entscheideTeilgruppe(block('rosenshine-daily-review'), teilgruppenProfil({ ...g, genannt: undefined }, T), T);
    expect(explizit).toMatchObject({ antwort: 'hilfe', merkmal: 'selbstregulation-gering' });
  });

  it('Werte einer Persona ordnen nur und lösen keine Zeile aus', () => {
    const g: MethodAdjustmentGroup = { id: 'p', label: 'Persona', personaId: 'highPerforming' };
    const e = entscheideTeilgruppe(block('lehrervortrag'), teilgruppenProfil(g, T), T);
    expect(e.antwort).toBe('passt');
  });

  it('n07 und n10: Phasen ohne Auslöser passen, statt eine U-Hilfe aus einem Zusatzwert zu bekommen', () => {
    for (const [text, gruppe, id] of [[...N07, 'vorwissen-gering'], [...N10, 'vertiefung']] as const) {
      const tg = impulse(adaptiere(text, gruppe), id);
      expect(tg.some((t) => t.antwort === 'tausch')).toBe(true);
      for (const t of tg) {
        expect(t.beleg.merkmal ?? '', t.phase.phaseLabel).not.toBe('selbstregulation-gering');
        expect(t.beleg.merkmal ?? '', t.phase.phaseLabel).not.toBe('sonst');
      }
    }
  });
});

describe('Fix wave Paket C, 1b–1e: Hilfen aus der entscheidenden Zeile', () => {
  it('1b: die Matrix-Hilfen kommen nur aus den Werten der Zeile', () => {
    const g: MethodAdjustmentGroup = {
      id: 'x',
      label: 'X',
      selectedValues: { sprachkompetenz: 'sprachkompetenz-gering', strukturierung: 'strukturierung-offen', methoden: 'methoden-spielerisch' }
    };
    const nurZeile = scoreDifferentiationMatrix({ selectedValues: { sprachkompetenz: 'sprachkompetenz-gering' }, limit: 50, gesperrt: T.gesperrt });
    const erlaubt = new Set(nurZeile.topRecommendations.filter((m) => m.relevanz === 'kern').map((m) => m.id));
    const a = teilgruppenAntworten(D.bausteine, phasen('kooperatives-skript'), [g], {}, R)[0];
    expect(a).toMatchObject({ antwort: 'hilfe', merkmal: 'sprachstand' });
    for (const h of a.hilfen.filter((x) => !x.id.startsWith('teilgruppe:'))) expect(erlaubt.has(h.id), h.name).toBe(true);
  });

  it('1c: die erste Hilfe ist das „wohin“ der E-Zeile, mit Quelle', () => {
    const [text, gruppe] = N08;
    const zeile = T.merkmale.find((m) => m.id === 'sprachstand')!;
    const hilfe = impulse(adaptiere(text, gruppe), 'daz').filter((t) => t.antwort === 'hilfe');
    expect(hilfe.length).toBeGreaterThan(0);
    for (const t of hilfe) {
      expect(t.hilfen[0]).toMatchObject({ name: zeile.wohin, quelle: zeile.quelle, grundlage: 'E' });
      expect(t.hilfen[0].abbau).toBeTruthy();
    }
  });

  it('1c: Sätze einer U-Zeile werden nie zum Hilfetext', () => {
    const g: MethodAdjustmentGroup = { id: 'u', label: 'U', selectedValues: { lernstrategien: 'lernstrategien-kaum' } };
    const a = teilgruppenAntworten(D.bausteine, phasen('kooperatives-skript', 'rosenshine-daily-review'), [g], {}, R);
    expect(a.every((x) => x.merkmal === 'selbstregulation-gering')).toBe(true);
    const sonst: MethodAdjustmentGroup = { id: 's', label: 'S', selectedValues: { strukturierung: 'strukturierung-stark' } };
    a.push(...teilgruppenAntworten(D.bausteine, phasen('kooperatives-skript'), [sonst], {}, R));
    for (const x of a) {
      for (const h of x.hilfen) {
        expect(h.name).not.toMatch(/keine belegte Grenze|Vorschlag/);
        expect(h.id.startsWith('teilgruppe:')).toBe(false);
      }
    }
  });

  it('1d: keine zwei Hilfen, deren Wortstämme in einer anderen enthalten sind', () => {
    for (const [text, gruppe, id] of [[...N07, 'vorwissen-gering'], [...N08, 'daz'], [...N10, 'vertiefung']] as const) {
      for (const t of impulse(adaptiere(text, gruppe), id)) {
        const s = t.hilfen.map((h) => stems(h.name));
        for (let i = 0; i < s.length; i++)
          for (let j = 0; j < s.length; j++) if (i !== j) expect(teilmenge(s[i], s[j]), `${t.hilfen[i].name} ⊆ ${t.hilfen[j].name}`).toBe(false);
      }
    }
  });

  it('1e: DaZ ist kein Förderbedarf; n08 zeigt keine Assistiven Technologien', () => {
    expect(Object.values(preset('daz').selectedValues)).not.toContain('foerderbedarf-sprache-erheblich');
    const g = detectLearnerGroupsFromText('4 Lernende DaZ Niveau A2').groups.find((x) => x.id === 'daz')!;
    expect(Object.values(g.selectedValues || {})).not.toContain('foerderbedarf-sprache-erheblich');
    const [text, gruppe] = N08;
    for (const t of impulse(adaptiere(text, gruppe), 'daz')) {
      for (const h of t.hilfen) expect(h.name).not.toMatch(/Assistive Technologien|Intensive Einzelförderung/);
    }
  });
});

describe('Fix wave C, 2: die Gleichwertigkeit liest Raum und Zeit der Anfrage', () => {
  const gruppe: MethodAdjustmentGroup = { id: 'vg', label: 'Geringes Vorwissen', selectedValues: { vorwissen: 'vorwissen-gering' } };
  const ohneAnfrage = teilgruppenAntworten(D.bausteine, phasen('erfindungsaufgabe'), [gruppe], { lehrende: 2 }, R)[0];
  const ziel = ohneAnfrage.alternativen[0].kennung;
  // The same catalogue, but the first replacement needs space to move.
  const mitFlaeche = { ...D, bausteine: D.bausteine.map((b) => (b.kennung === ziel ? { ...b, raumbedarf: [...(b.raumbedarf || []), 'bewegungsflaeche'] } : b)) };
  const anpassen = (anfrage?: Record<string, unknown>) =>
    adaptScenario(mitFlaeche, {
      phasen: [{ key: 's0', phaseLabel: 'Erfindung', baustein: 'erfindungsaufgabe', durationMin: 20 }],
      gruppen: [{ id: 'regel', label: 'Regelgruppe', personaId: 'average' }, gruppe],
      lehrende: 2,
      ...(anfrage ? { anfrage } : {})
    }).phasenAnpassungen[0].teilgruppenImpulse.find((t) => t.groupId === 'vg')!;

  it('ohne genannten Raum bleibt der Ersatz mit Bewegungsfläche möglich', () => {
    expect(ohneAnfrage.antwort).toBe('tausch');
    expect(anpassen().alternativeMethoden.map((a) => a.kennung)).toContain(ziel);
  });

  it('ein genannter Klassenraum schließt den Ersatz aus, der Bewegungsfläche braucht', () => {
    const t = anpassen({ raum: 'klassenraum' });
    expect(t.alternativeMethoden.map((a) => a.kennung)).not.toContain(ziel);
  });
});
