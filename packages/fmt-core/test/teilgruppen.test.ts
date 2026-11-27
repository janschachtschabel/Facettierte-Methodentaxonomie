import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import type { Baustein, MatchRequest, TeilgruppenRegelsatz } from '../src/types.js';
import { erstelleRegeln } from '../src/regeln.js';
import { baueSituation } from '../src/situation.js';
import {
  bereinigeProfil,
  entscheideTeilgruppe,
  erfuelltRichtung,
  istGleichwertig,
  type TeilgruppenProfil
} from '../src/teilgruppen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
// Stable rows of the table (vorwissen-gering, sprachstand, blocked sensorische); the other rows are under review.
const T = D.teilgruppen;

/** Synthetic method: only the fields the subgroup decision and the equivalence check read. */
function baustein(teil: Partial<Baustein> = {}): Baustein {
  return {
    kennung: 'test-methode',
    name: 'Testmethode',
    anleitung: ['geleitet'],
    adaptivitaet: ['uniform'],
    rolle: [],
    aufgabe: ['konzepte'],
    lernfunktion: ['erarbeitung'],
    vorbedingung: [],
    nachbedingung: ['konzept-gesichert'],
    feedback: ['fb-lehrkraft'],
    sequenz: [],
    dauerMin: 20,
    gruppeMin: 1,
    gruppeMax: 40,
    vorbereitungMin: 10,
    technik: 't-keine',
    internet: false,
    raumbedarf: [],
    schriftbedarf: [],
    steuerung: { organisation: 'lernende' },
    ...teil
  } as unknown as Baustein;
}

const gruppe = (selectedValues: Record<string, string>, extra: Partial<TeilgruppenProfil> = {}): TeilgruppenProfil => ({
  id: 'g',
  label: 'Teilgruppe',
  selectedValues,
  ...extra
});

describe('Teilgruppen: Antwort je Teilgruppe', () => {
  const b = baustein();

  it('geringes Vorwissen und eine nur offene, uniforme Methode: Tausch mit Beleg Tetzlaff', () => {
    const offen = baustein({ anleitung: ['offen'], adaptivitaet: ['uniform'] });
    const e = entscheideTeilgruppe(offen, gruppe({ vorwissen: 'vorwissen-gering' }), T);
    expect(e).toMatchObject({ antwort: 'tausch', merkmal: 'vorwissen-gering', richtung: 'mehr-anleitung', grundlage: 'E', gesperrt: [] });
    expect(e.quelle).toContain('Tetzlaff');
    expect(e.grund).toContain('Tetzlaff');
    expect(e.grund).toContain('Vorwissen');
  });

  it('geringes Vorwissen und eine angeleitete Methode: passt oder Hilfe, kein Tausch', () => {
    for (const anleitung of [['geleitet'], ['explizit'], ['explizit', 'offen']]) {
      const e = entscheideTeilgruppe(baustein({ anleitung }), gruppe({ vorwissen: 'vorwissen-gering' }), T);
      expect(['passt', 'hilfe'], anleitung.join('+')).toContain(e.antwort);
    }
    expect(entscheideTeilgruppe(baustein({ anleitung: ['geleitet'] }), gruppe({ vorwissen: 'vorwissen-gering' }), T).antwort).toBe('passt');
  });

  it('geringes Vorwissen und eine offene Methode mit diff-prozess: Hilfe, weil die Methode sich anpassen lässt', () => {
    const offen = baustein({ anleitung: ['offen'], adaptivitaet: ['diff-prozess'] });
    const e = entscheideTeilgruppe(offen, gruppe({ vorwissen: 'vorwissen-gering' }), T);
    expect(e).toMatchObject({ antwort: 'hilfe', merkmal: 'vorwissen-gering', richtung: 'mehr-anleitung' });
    expect(e.grund).toContain('Die Methode lässt sich anpassen');
  });

  it('DaZ (sprachkompetenz-gering): Hilfe, nie Tausch', () => {
    const methoden = [
      baustein({ anleitung: ['offen'], adaptivitaet: ['uniform'], schriftbedarf: ['liest', 'schreibt'] }),
      baustein({ anleitung: ['explizit'], adaptivitaet: ['uniform'] }),
      baustein({ anleitung: ['geleitet'], adaptivitaet: ['diff-prozess'] })
    ];
    for (const m of methoden) {
      const e = entscheideTeilgruppe(m, gruppe({ sprachkompetenz: 'sprachkompetenz-gering' }), T);
      expect(e).toMatchObject({ antwort: 'hilfe', merkmal: 'sprachstand' });
      expect(e.richtung).toBeUndefined();
    }
  });

  it('nur sensorische-visuell: passt, gesperrt enthält sensorische', () => {
    const e = entscheideTeilgruppe(b, { id: 'g', label: 'visuelle Lerntypen', selectedValues: { sensorische: 'sensorische-visuell' } }, T);
    expect(e).toMatchObject({ antwort: 'passt', gesperrt: ['sensorische'] });
  });

  it('kann nicht lesen und Methode mit schriftbedarf liest: Tausch, Grundlage formal', () => {
    const liest = baustein({ schriftbedarf: ['liest'] });
    const e = entscheideTeilgruppe(liest, gruppe({}, { ohneSchrift: ['lesen'] }), T);
    expect(e).toMatchObject({ antwort: 'tausch', grundlage: 'formal', richtung: 'ohne-lesen' });
    expect(e.grund).toContain('Lesen');
    // Formal comes first, even when the method lets itself be adapted.
    expect(entscheideTeilgruppe(baustein({ schriftbedarf: ['liest'], adaptivitaet: ['diff-prozess'] }), gruppe({}, { ohneSchrift: ['lesen'] }), T).antwort).toBe('tausch');
    expect(entscheideTeilgruppe(baustein({ schriftbedarf: ['schreibt'] }), gruppe({}, { ohneSchrift: ['lesen'] }), T).antwort).toBe('passt');
  });

  it('kann sich nicht bewegen und Methode mit Stellfläche: Tausch, Grundlage formal', () => {
    const stell = baustein({ raumbedarf: ['stellflaeche'] });
    expect(entscheideTeilgruppe(stell, gruppe({}, { ohneBewegung: true }), T)).toMatchObject({ antwort: 'tausch', grundlage: 'formal', richtung: 'ohne-bewegung' });
    expect(entscheideTeilgruppe(baustein({ raumbedarf: ['schreibplatz'] }), gruppe({}, { ohneBewegung: true }), T).antwort).toBe('passt');
  });

  it('der Weg vom Merkmal zur Regel ist die Richtung der Zeile; unbekannte Ausprägungen fallen unter sonst', () => {
    const synth: TeilgruppenRegelsatz = {
      merkmale: [
        { id: 'zeile-tausch', auspraegungen: ['x-a'], antwort: 'tausch', richtung: 'explizit-mit-strategie', wohin: 'explizit', grundlage: 'A' },
        { id: 'zeile-bewegung', auspraegungen: ['x-b'], antwort: 'tausch', richtung: 'ohne-bewegung', wohin: 'ohne Fläche', grundlage: 'formal' },
        { id: 'zeile-hilfe', auspraegungen: ['x-c'], antwort: 'hilfe', wohin: 'Stütze', grundlage: 'S' }
      ],
      sonst: { antwort: 'hilfe', grundlage: 'U', wohin: 'Hilfe' },
      gesperrt: ['y'],
      gesperrtText: 'nicht belegt',
      abbau: {},
      neutral: ['z-mittel']
    };
    const geleitet = baustein({ anleitung: ['geleitet'] });
    expect(entscheideTeilgruppe(geleitet, gruppe({ x: 'x-a' }), synth)).toMatchObject({ antwort: 'tausch', merkmal: 'zeile-tausch', richtung: 'explizit-mit-strategie' });
    expect(entscheideTeilgruppe(baustein({ anleitung: ['explizit'] }), gruppe({ x: 'x-a' }), synth).antwort).toBe('passt');
    // A swap row with a formal direction comes from the matrix value (foerderbedarf-koerperlich-deutlich in the real table).
    expect(entscheideTeilgruppe(baustein({ raumbedarf: ['bewegungsflaeche'] }), gruppe({ x: 'x-b' }), synth)).toMatchObject({ antwort: 'tausch', grundlage: 'formal', merkmal: 'zeile-bewegung' });
    expect(entscheideTeilgruppe(geleitet, gruppe({ x: 'x-c' }), synth)).toMatchObject({ antwort: 'hilfe', merkmal: 'zeile-hilfe', grundlage: 'S' });
    expect(entscheideTeilgruppe(geleitet, gruppe({ z: 'z-unbekannt' }), synth)).toMatchObject({ antwort: 'hilfe', merkmal: 'sonst', grundlage: 'U' });
    expect(entscheideTeilgruppe(geleitet, gruppe({ y: 'y-1' }), synth)).toMatchObject({ antwort: 'passt', gesperrt: ['y'] });
    const sonst = entscheideTeilgruppe(geleitet, gruppe({ z: 'z-unbekannt' }), synth).grund;
    expect(sonst).toContain('Grundlage ungeklärt');
    expect(sonst.endsWith('.')).toBe(true);
    // Neutral values mean no need: ignored like not selected.
    expect(entscheideTeilgruppe(geleitet, gruppe({ z: 'z-mittel' }), synth).antwort).toBe('passt');
    expect(entscheideTeilgruppe(geleitet, gruppe({ z: 'z-mittel', x: 'x-c' }), synth)).toMatchObject({ antwort: 'hilfe', merkmal: 'zeile-hilfe' });
  });

  it('neutrale Ausprägungen der Tabelle: passt statt Hilfe', () => {
    const neutral = gruppe({ vorwissen: 'vorwissen-mittel', 'foerderbedarf-sehen': 'foerderbedarf-sehen-keine' });
    expect(entscheideTeilgruppe(baustein({ anleitung: ['offen'] }), neutral, T).antwort).toBe('passt');
    // High levels without a row of their own mean no need either.
    expect(entscheideTeilgruppe(baustein(), gruppe({ metakognitive: 'metakognitive-stark' }), T).antwort).toBe('passt');
  });

  it('fehlendes B3 gilt als uniform: Tausch bleibt Tausch', () => {
    const offen = baustein({ anleitung: ['offen'], adaptivitaet: [] });
    expect(entscheideTeilgruppe(offen, gruppe({ vorwissen: 'vorwissen-gering' }), T).antwort).toBe('tausch');
  });

  it('bereinigeProfil entfernt gesperrte Kategorien und übernimmt formale Zeilen als Angabe', () => {
    const { profil, gesperrt } = bereinigeProfil(
      gruppe({ sensorische: 'sensorische-visuell', 'foerderbedarf-koerperlich': 'foerderbedarf-koerperlich-deutlich' }),
      T
    );
    expect(gesperrt).toEqual(['sensorische']);
    expect(profil.selectedValues).toEqual({ 'foerderbedarf-koerperlich': 'foerderbedarf-koerperlich-deutlich' });
    expect(profil.ohneBewegung).toBe(true);
  });

  it('erfuelltRichtung liest Anleitungsgrad, Schrift- und Raumbedarf', () => {
    expect(erfuelltRichtung(baustein({ anleitung: ['offen'] }), 'mehr-anleitung')).toBe(false);
    expect(erfuelltRichtung(baustein({ anleitung: ['geleitet'] }), 'mehr-anleitung')).toBe(true);
    expect(erfuelltRichtung(baustein({ anleitung: ['explizit'] }), 'weniger-anleitung')).toBe(false);
    expect(erfuelltRichtung(baustein({ anleitung: ['explizit', 'offen'] }), 'weniger-anleitung')).toBe(true);
    expect(erfuelltRichtung(baustein({ anleitung: ['geleitet'] }), 'explizit-mit-strategie')).toBe(false);
    expect(erfuelltRichtung(baustein({ schriftbedarf: ['schreibt'] }), 'ohne-lesen')).toBe(true);
    expect(erfuelltRichtung(baustein({ schriftbedarf: ['schreibt'] }), 'ohne-schreiben')).toBe(false);
    expect(erfuelltRichtung(baustein({ raumbedarf: ['stellflaeche'] }), 'ohne-bewegung')).toBe(false);
    expect(erfuelltRichtung(baustein({ raumbedarf: ['wandflaeche'] }), 'ohne-bewegung')).toBe(true);
  });
});

describe('Teilgruppen: Gleichwertigkeit eines Ersatzes', () => {
  const regeln = erstelleRegeln(D.regeln);
  const geplant = baustein({ kennung: 'geplant', name: 'Geplant', anleitung: ['offen'], steuerung: { organisation: 'lernende' } });
  const ersatz = baustein({ kennung: 'ersatz', name: 'Ersatz', anleitung: ['explizit'], adaptivitaet: ['diff-prozess'] });
  const kontext = (anfrage: MatchRequest = { raum: 'klassenraum', zeitMin: 45 }, extra: Record<string, unknown> = {}) => ({
    schritt: { ziel: 'konzept-gesichert', rolle: 'haupt' as const, wissensart: ['konzepte'] },
    anfrage,
    situation: baueSituation(anfrage, D),
    dauerMin: 20,
    profil: gruppe({ vorwissen: 'vorwissen-gering' }),
    data: D,
    regeln,
    ...extra
  });

  it('ein passender Ersatz ist gleichwertig', () => {
    expect(istGleichwertig(ersatz, geplant, kontext())).toEqual({ ok: true, gruende: [] });
  });

  it('Ersatz mit anderem Lernstand ist nicht gleichwertig', () => {
    const anders = baustein({ ...ersatz, nachbedingung: ['vorwissen-aktiviert'] });
    const g = istGleichwertig(anders, geplant, kontext());
    expect(g.ok).toBe(false);
    expect(g.gruende.join(' ')).toMatch(/Lernstand/);
    // Same learning state, other knowledge type.
    const andereArt = baustein({ ...ersatz, aufgabe: ['psychomotorik'] });
    expect(istGleichwertig(andereArt, geplant, kontext()).gruende.join(' ')).toMatch(/Wissensart/);
    // A state implied by the delivered one counts (Hülle): konzept-gesichert implies erstwissen-ungesichert.
    const ohneSchritt = kontext(undefined, { schritt: undefined });
    const g2 = istGleichwertig(ersatz, baustein({ ...geplant, nachbedingung: ['erstwissen-ungesichert'] }), ohneSchritt);
    expect(g2.ok).toBe(true);
  });

  it('Ersatz, der im Raum der Stunde nicht geht, ist nicht gleichwertig', () => {
    const stell = baustein({ ...ersatz, raumbedarf: ['stellflaeche'] });
    const g = istGleichwertig(stell, geplant, kontext({ raum: 'hoersaal', zeitMin: 45 }));
    expect(g.ok).toBe(false);
    expect(g.gruende.join(' ')).toMatch(/Bedarf/);
    expect(istGleichwertig(baustein({ ...ersatz, dauerMin: 30 }), geplant, kontext()).ok).toBe(false);
    expect(istGleichwertig(baustein({ ...ersatz, internet: true }), geplant, kontext()).gruende.join(' ')).toMatch(/Internet/);
  });

  it('Ersatz mit neuer Warnung für die Teilgruppe oder formalem Ausschluss ist nicht gleichwertig', () => {
    // The planned method is guided: an only open candidate gets a warning the planned one does not get.
    const geleitet = baustein({ ...geplant, anleitung: ['geleitet'] });
    const offen = baustein({ ...ersatz, anleitung: ['offen'] });
    const g0 = istGleichwertig(offen, geleitet, kontext());
    expect(g0.ok).toBe(false);
    expect(g0.gruende.join(' ')).toMatch(/Teilgruppe: neue Warnung/);
    const liest = baustein({ ...ersatz, schriftbedarf: ['liest'] });
    const g = istGleichwertig(liest, geplant, kontext(undefined, { profil: gruppe({}, { ohneSchrift: ['lesen'] }) }));
    expect(g.ok).toBe(false);
    expect(g.gruende.join(' ')).toMatch(/Lesen/);
  });

  it('eine Warnung, die auch die geplante Methode bekommt, ist keine neue Warnung', () => {
    // geplant is only open, like the candidate: both get the warning for low prior knowledge.
    const offen = baustein({ ...ersatz, anleitung: ['offen'] });
    expect(istGleichwertig(offen, geplant, kontext())).toEqual({ ok: true, gruende: [] });
  });

  it('die eingebaute Regel evidenz-geltung zählt als neue Warnung', () => {
    // Primary school; the candidate's evidence names secondary school only, the planned method has none.
    const anfrage: MatchRequest = { raum: 'klassenraum', zeitMin: 45, bildungsstufe: 'primar' };
    const sek = baustein({ ...ersatz, evidenz: [{ grad: 'A', befund: 'wirkt', geltung: 'Sekundarstufe I' }] } as Partial<Baustein>);
    const g = istGleichwertig(sek, geplant, kontext(anfrage));
    expect(g.ok).toBe(false);
    expect(g.gruende.join(' ')).toMatch(/Teilgruppe: neue Warnung – Die Belege für Ersatz/);
    // The planned method with the same scope gets the warning as well: no new warning.
    const geplantSek = baustein({ ...geplant, evidenz: [{ grad: 'A', befund: 'wirkt', geltung: 'Sekundarstufe I' }] } as Partial<Baustein>);
    expect(istGleichwertig(sek, geplantSek, kontext(anfrage)).ok).toBe(true);
  });

  it('mit der Tabelle im Kontext zählen formale Zeilen auch bei unbereinigtem Profil', () => {
    const stell = baustein({ ...ersatz, raumbedarf: ['stellflaeche'] });
    const profil = gruppe({ 'foerderbedarf-koerperlich': 'foerderbedarf-koerperlich-deutlich' });
    expect(istGleichwertig(stell, geplant, kontext(undefined, { profil })).ok).toBe(true);
    const g = istGleichwertig(stell, geplant, kontext(undefined, { profil, t: T }));
    expect(g.ok).toBe(false);
    expect(g.gruende.join(' ')).toMatch(/bewegen/);
  });

  it('zwei lehrkraftgebundene Methoden sind nicht nebeneinander führbar; mit zwei Lehrenden schon', () => {
    const lk = baustein({ ...geplant, steuerung: { organisation: 'lehrkraft', lernweg: 'lehrkraft' } } as Partial<Baustein>);
    const lkErsatz = baustein({ ...ersatz, rolle: ['instrukteur'] });
    const g = istGleichwertig(lkErsatz, lk, kontext());
    expect(g.ok).toBe(false);
    expect(g.gruende.join(' ')).toMatch(/Lehrkraft/);
    expect(istGleichwertig(lkErsatz, lk, kontext(undefined, { lehrende: 2 })).ok).toBe(true);
    expect(istGleichwertig(lkErsatz, geplant, kontext()).ok).toBe(true);
  });

  it('nur organisiert von der Lehrkraft bindet sie nicht; erst ein von ihr geführter Lernweg oder die Rolle instrukteur', () => {
    const organisiert = { organisation: 'lehrkraft', lernweg: 'geteilt' };
    const a = baustein({ ...geplant, steuerung: organisiert } as Partial<Baustein>);
    const b = baustein({ ...ersatz, steuerung: organisiert } as Partial<Baustein>);
    expect(istGleichwertig(b, a, kontext()).ok).toBe(true);
    const gefuehrt = baustein({ ...ersatz, steuerung: { organisation: 'lehrkraft', lernweg: 'lehrkraft' } } as Partial<Baustein>);
    const instrukteur = baustein({ ...geplant, rolle: ['instrukteur'] });
    expect(istGleichwertig(gefuehrt, instrukteur, kontext()).gruende.join(' ')).toMatch(/Nebeneinander/);
  });

  it('ein angenommener Raum schließt keinen Ersatz aus; ein genannter schon', () => {
    const stell = baustein({ ...ersatz, raumbedarf: ['stellflaeche'] });
    // No room named: the room is assumed (Klassenraum) and only orders, even for a need it lacks.
    expect(istGleichwertig(stell, geplant, kontext({ zeitMin: 45 })).ok).toBe(true);
    const bewegt = baustein({ ...ersatz, raumbedarf: ['bewegungsflaeche'] });
    expect(istGleichwertig(bewegt, geplant, kontext({ zeitMin: 45 })).ok).toBe(true);
    const g = istGleichwertig(stell, geplant, kontext({ raum: 'hoersaal', zeitMin: 45 }));
    expect(g.ok).toBe(false);
    expect(g.gruende.join(' ')).toMatch(/Bedarf/);
  });
});
