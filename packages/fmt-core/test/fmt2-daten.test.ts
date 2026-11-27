import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { endwerte, leseEntscheidung, uebernehme, WISSENSARTEN } from '../scripts/uebernehme-durchsicht.js';
import { deute, formatiereTeilgruppen, wendeAn, type Op } from '../scripts/uebernehme-eignung.js';
import { erstelleRegeln } from '../src/regeln.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const D = loadFmtData(path.resolve(HERE, '..', '..', '..', 'data'));
/** Old room fields before Durchsicht 1 (lernort, raum), kept as a test fixture for plausibility checks. */
const ALT = JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', 'vor-durchsicht-1.json'), 'utf8')) as Record<
  string,
  { lernort: string[]; raum?: string; aufgabe: string[]; fachbereichUngeeignet?: string[] }
>;
const werte = (scheme: string) => new Set((D.schemes.find((s) => s.id === scheme)?.werte || []).map((w) => w.id));
const roh = (b: unknown) => b as Record<string, unknown>;

describe('FMT 2.0: Daten nach Durchsicht 1', () => {
  it('keine Methode trägt mehr lernort oder das Freitextfeld raum', () => {
    const mit = D.bausteine.filter((b) => 'lernort' in roh(b) || 'raum' in roh(b)).map((b) => b.kennung);
    expect(mit).toEqual([]);
    // The room texts survive as raumhinweis.
    const hinweise = Object.entries(ALT).filter(([, a]) => a.raum).map(([k]) => k);
    expect(hinweise.length).toBeGreaterThan(100);
    for (const k of hinweise) expect(D.bausteine.find((b) => b.kennung === k)!.raumhinweis, k).toBe(ALT[k].raum);
    expect(werte('lernort').size).toBe(0);
  });

  it('raumbedarf, schriftbedarf und fachausstattungArt nutzen nur Werte der Vokabulare', () => {
    const raum = werte('raumbedarf');
    const schrift = werte('schriftbedarf');
    const art = werte('fachausstattungart');
    for (const b of D.bausteine) {
      for (const x of b.raumbedarf || []) expect(raum.has(x), `${b.kennung}: ${x}`).toBe(true);
      for (const x of b.schriftbedarf || []) expect(schrift.has(x), `${b.kennung}: ${x}`).toBe(true);
      if (b.fachausstattungArt) expect(art.has(b.fachausstattungArt), b.kennung).toBe(true);
      if (b.termineMin != null) expect(Number.isInteger(b.termineMin) && b.termineMin >= 2, b.kennung).toBe(true);
      for (const k of ['raumbedarf', 'schriftbedarf', 'fachbereichUngeeignet'] as const)
        expect(roh(b)[k] === undefined || (roh(b)[k] as unknown[]).length > 0, `${b.kennung}: leere Liste ${k}`).toBe(true);
    }
    expect(D.bausteine.filter((b) => b.raumbedarf?.length).length).toBeGreaterThan(100);
    expect(D.bausteine.filter((b) => b.schriftbedarf?.length).length).toBeGreaterThan(100);
  });

  it('fachausstattungArt steht nur bei Methoden mit raumbedarf fachausstattung', () => {
    const ohne = D.bausteine.filter((b) => b.fachausstattungArt && !(b.raumbedarf || []).includes('fachausstattung'));
    expect(ohne.map((b) => b.kennung)).toEqual([]);
  });

  it('jede Methode trägt mindestens eine Wissensart in D1', () => {
    const ohne = D.bausteine.filter((b) => !(b.aufgabe || []).some((x) => WISSENSARTEN.includes(x))).map((b) => b.kennung);
    // ki-chat is a contrast entry without a reliable learning state; Tor D1 left its knowledge type empty on purpose.
    const BEWUSST_LEER = ['ki-chat'];
    expect(ohne).toEqual(BEWUSST_LEER);
    // The other values of D1 (AFB, structure, authenticity) stay untouched.
    for (const b of D.bausteine) {
      const rest = (x: string[]) => x.filter((y) => !WISSENSARTEN.includes(y));
      expect(rest(b.aufgabe || []), b.kennung).toEqual(rest(ALT[b.kennung].aufgabe));
    }
  });

  it('wer schreibt, braucht in keinem Fall einen Raum ohne Schreibplatz als einzigen bisherigen Lernort', () => {
    // Plausibility: a method that has learners write was not made only for rooms without a writing place.
    const ohneSchreibplatz = new Set(['bewegungsraum', 'draussen']);
    const auffaellig = D.bausteine
      .filter((b) => (b.schriftbedarf || []).includes('schreibt'))
      .filter((b) => {
        const lernort = ALT[b.kennung]?.lernort || [];
        return lernort.length > 0 && lernort.every((x) => ohneSchreibplatz.has(x));
      })
      .map((b) => b.kennung);
    // Known offenders after the gate would be listed here with a reason; there are none.
    const BEKANNT: string[] = [];
    expect(auffaellig).toEqual(BEKANNT);
  });
});

describe('uebernehme-durchsicht.ts', () => {
  const zeile = (extra: Record<string, string>) => ({
    kennung: 'x', raumbedarf_vorschlag: 'schreibplatz|wandflaeche', fachausstattungArt: '', schriftbedarf_vorschlag: 'schreibt',
    termineMin_vorschlag: '2', wissensart_alt: 'konzepte', wissensart_vorschlag: '', fach_ungeeignet_vorschlag: 'sport|sprachen',
    entscheidung: '', ...extra
  });

  it('die Entscheidung überschreibt den Vorschlag, leerer Wert heißt leere Liste', () => {
    const d = endwerte(zeile({ entscheidung: 'raumbedarf=schreibplatz; termineMin=; fach_ungeeignet=' }));
    expect(d).toEqual({ raumbedarf: ['schreibplatz'], schriftbedarf: ['schreibt'], wissensart: ['konzepte'], fachUngeeignet: [] });
    expect(endwerte(zeile({ wissensart_vorschlag: 'fakten' })).wissensart).toEqual(['fakten']);
    expect(endwerte(zeile({ wissensart_vorschlag: 'fakten', entscheidung: 'wissensart=fakten|prozeduren' })).wissensart).toEqual(['fakten', 'prozeduren']);
    expect(() => leseEntscheidung('lernort=x')).toThrow(/unbekanntes Feld/);
  });

  it('hält die Reihenfolge der Schlüssel, lässt leere Felder weg und ist wiederholbar', () => {
    const alt = {
      kennung: 'x', fachbereich: ['sprachen'], fachbereichUngeeignet: ['sport'], lernort: ['klassenraum'],
      aufgabe: ['afb2', 'konzepte'], material: ['Tafel'], raum: 'Stuhlkreis', gruppeMin: 2
    };
    const d = endwerte(zeile({ entscheidung: 'fach_ungeeignet=' }));
    const neu = uebernehme(alt, d);
    expect(Object.keys(neu)).toEqual(['kennung', 'fachbereich', 'raumbedarf', 'schriftbedarf', 'termineMin', 'aufgabe', 'material', 'raumhinweis', 'gruppeMin']);
    expect(neu.aufgabe).toEqual(['konzepte', 'afb2']);
    expect(neu.raumhinweis).toBe('Stuhlkreis');
    expect(uebernehme(neu, d)).toEqual(neu);
    expect(JSON.stringify(uebernehme(neu, d))).toBe(JSON.stringify(neu));
  });
});

describe('FMT 2.0: Daten nach Durchsicht 2 (Tor D2)', () => {
  const R = erstelleRegeln(D.regeln);
  const vorwissen = werte('vorwissen');

  it('keine Methode trägt mehr geeignetBeiVorwissen', () => {
    expect(D.bausteine.filter((b) => 'geeignetBeiVorwissen' in roh(b)).map((b) => b.kennung)).toEqual([]);
  });

  it('jeder Eintrag in fachbereichUngeeignet und ungeeignetBeiVorwissen hat einen eignungsgrund', () => {
    const grundOk = (g: unknown) => {
      const x = g as { text?: string; grundlage?: string } | undefined;
      return !!x && typeof x.text === 'string' && x.text.length > 10 && ['E', 'S', 'A'].includes(String(x.grundlage));
    };
    const ohne: string[] = [];
    for (const b of D.bausteine) {
      if (b.fachbereichUngeeignet?.length && !grundOk(b.eignungsgrund?.fachbereich)) ohne.push(`${b.kennung}: fachbereich`);
      if (b.ungeeignetBeiVorwissen?.length && !grundOk(b.eignungsgrund?.vorwissen)) ohne.push(`${b.kennung}: vorwissen`);
      for (const v of b.ungeeignetBeiVorwissen || []) expect(vorwissen.has(v), `${b.kennung}: ${v}`).toBe(true);
      // A reason without its entry would explain nothing.
      if (b.eignungsgrund?.fachbereich) expect(b.fachbereichUngeeignet?.length, b.kennung).toBeGreaterThan(0);
      if (b.eignungsgrund?.vorwissen) expect(b.ungeeignetBeiVorwissen?.length, b.kennung).toBeGreaterThan(0);
      if (b.eignungsgrund?.stufe) expect(b.ungeeignetBeiStufe?.length, b.kennung).toBeGreaterThan(0);
    }
    expect(ohne).toEqual([]);
    expect(D.bausteine.filter((b) => b.ungeeignetBeiVorwissen?.length).map((b) => b.kennung).sort()).toEqual(['fehleranalyse', 'forschendes-lernen', 'loesungsbeispiele']);
  });

  it('jede eintragsart hilfe hat keine Nachbedingung', () => {
    const hilfen = D.bausteine.filter((b) => b.eintragsart === 'hilfe');
    for (const b of hilfen) expect(b.nachbedingung || [], b.kennung).toEqual([]);
    for (const b of D.bausteine) if (b.eintragsart) expect(['methode', 'hilfe'], b.kennung).toContain(b.eintragsart);
    // Tor D2, part 5: only scaffolding-hilfen becomes a Hilfe.
    expect(hilfen.map((b) => b.kennung)).toEqual(['scaffolding-hilfen']);
  });

  it('die eingebaute Regel evidenz-geltung deckt die 18 entfallenen Stufen-Einträge', () => {
    expect(D.regeln.find((r) => r.id === 'evidenz-geltung')?.art).toBe('eingebaut');
    const GEDECKT = ['blended-learning', 'feynman-methode', 'ki-lernbegleiter-adaptiv', 'ki-prompt-werkstatt', 'ki-simulationsdialog',
      'ki-textfeedback', 'kooperatives-skript', 'microteaching', 'one-minute-paper', 'peer-instruction', 'planspiel',
      'quellenkritik-faktencheck', 'simulation-globale', 'sq3r-lesemethode', 'szenario-technik', 'text-exzerpieren',
      'vorlesung-klassisch', 'wiki-kollaboration'];
    expect(GEDECKT.length).toBe(18);
    for (const k of GEDECKT) {
      const b = D.bausteine.find((x) => x.kennung === k)!;
      expect(b.ungeeignetBeiStufe, k).toBeUndefined();
      expect(R.warnungen(b, { bildungsstufe: 'primar' }).map((m) => m.regel), k).toContain('evidenz-geltung');
    }
  });

  it('die Regel problemloesen-vor-instruktion-primar deckt die vier entfallenen Stufen-Einträge', () => {
    for (const k of ['erfindungsaufgabe', 'forschendes-lernen', 'problemorientiertes-lernen', 'productive-failure']) {
      const b = D.bausteine.find((x) => x.kennung === k)!;
      expect(b.ungeeignetBeiStufe, k).toBeUndefined();
      expect(R.warnungen(b, { bildungsstufe: 'primar' }).map((m) => m.regel), k).toContain('problemloesen-vor-instruktion-primar');
    }
  });

  it('übernimmt die übrigen Werte der Spalte final', () => {
    const b = (k: string) => D.bausteine.find((x) => x.kennung === k)!;
    expect(b('freispiel-primar').evidenz![0].geltung).toBe('Elementar- und früher Primarbereich');
    expect(b('supervision-gruppe').ungeeignetBeiStufe).toEqual(['primar']);
    expect(b('supervision-gruppe').eignungsgrund?.stufe).toEqual({ text: 'Die Methode reflektiert berufliche Praxisphasen.', grundlage: 'S' });
    expect(b('loesungsbeispiele').eignungsgrund?.vorwissen).toEqual({
      text: 'Der Vorteil ausgearbeiteter Lösungsbeispiele kehrt sich mit wachsendem Vorwissen um (Expertise-Reversal).',
      grundlage: 'E',
      quelle: 'Kalyuga et al. 2003; Tetzlaff et al. 2025'
    });
    expect(b('flipped').nachbedingung).toEqual(['konzept-gesichert']);
    expect(b('freinet-druckerei').adaptivitaet).toEqual(['udl', 'diff-inhalt']);
    expect(b('makerspace-tueftelwerkstatt')).toMatchObject({ raumbedarf: ['fachausstattung'], fachausstattungArt: 'werkstatt' });
    expect(b('world-cafe').raumbedarf).toEqual(['stellflaeche']);
    expect(b('vier-stufen-methode').fachbereich).toContain('nawi-technik');
    expect(b('vorfuehrung-rueckmeldung').fachbereich).toContain('sport');
    expect(D.bausteine.filter((x) => x.fachbereichUngeeignet?.length).map((x) => x.kennung).sort()).toEqual(['bestimmungsuebung', 'diktat-klassisch']);
  });

  it('Teilgruppen: kultureller-hintergrund-neu fällt unter sonst, sehen-hoeren hat die Grundlage Recht', () => {
    const m = (id: string) => D.teilgruppen!.merkmale.find((x) => x.id === id)!;
    expect(m('sprachstand').auspraegungen).not.toContain('kultureller-hintergrund-neu');
    expect(D.teilgruppen!.merkmale.some((x) => x.auspraegungen.includes('kultureller-hintergrund-neu'))).toBe(false);
    expect(D.teilgruppen!.neutral || []).not.toContain('kultureller-hintergrund-neu');
    expect(m('sehen-hoeren').grundlage).toBe('Recht');
    expect(m('motivation-interesse')).toMatchObject({ grundlage: 'E', quelle: 'Patall et al. 2008 (Wirkung auf die Leistung ungeklärt)' });
  });
});

describe('uebernehme-eignung.ts', () => {
  const z = (teil: string, kennung: string, feld: string, final: string, wert_alt = '') => ({ eintrag: `T${teil}-${kennung}`, teil, kennung, feld, wert_alt, final });

  it('streichen und entfällt löschen das Feld', () => {
    expect(deute(z('3', 'x', 'ungeeignetBeiStufe', 'streichen', 'primar'))).toEqual({ ops: [{ typ: 'feld', feld: 'ungeeignetBeiStufe' }] });
    expect(deute(z('2', 'x', 'geeignetBeiVorwissen', 'entfällt (Regel deckt)', 'mittel|hoch'))).toEqual({ ops: [{ typ: 'feld', feld: 'geeignetBeiVorwissen' }] });
  });

  it('ein Eintrag mit Begründung setzt Liste und eignungsgrund, auch mit Klammern im Text', () => {
    const d = deute(z('2', 'x', 'geeignetBeiVorwissen', 'ungeeignetBeiVorwissen=hoch; eignungsgrund.vorwissen: E – Kehrt sich um (Expertise-Reversal) (Quelle: Kalyuga et al. 2003; Tetzlaff et al. 2025)', 'gering|mittel'));
    expect(d).toEqual({
      ops: [
        { typ: 'feld', feld: 'ungeeignetBeiVorwissen', wert: ['hoch'] },
        { typ: 'feld', feld: 'geeignetBeiVorwissen' },
        { typ: 'grund', art: 'vorwissen', grund: { text: 'Kehrt sich um (Expertise-Reversal).', grundlage: 'E', quelle: 'Kalyuga et al. 2003; Tetzlaff et al. 2025' } }
      ]
    });
    const s = deute(z('3', 'x', 'ungeeignetBeiStufe', 'ungeeignetBeiStufe=primar; eignungsgrund.stufe: S – Reflektiert Praxis; sek1 streichen', 'primar|sek1'));
    expect(s).toEqual({ ops: [{ typ: 'feld', feld: 'ungeeignetBeiStufe', wert: ['primar'] }, { typ: 'grund', art: 'stufe', grund: { text: 'Reflektiert Praxis.', grundlage: 'S' } }] });
    // A field that does not belong to the reason is not guessed.
    expect(deute(z('3', 'x', 'ungeeignetBeiStufe', 'fachbereichUngeeignet=sport; eignungsgrund.stufe: S – Text'))).toHaveProperty('offen');
  });

  it('liest Feldwerte, Ergänzungen, Hilfe und Teilgruppen; Unbekanntes bleibt offen', () => {
    expect(deute(z('6', 'x', 'adaptivitaet (B3)', 'adaptivitaet=udl|diff-inhalt'))).toEqual({ ops: [{ typ: 'feld', feld: 'adaptivitaet', wert: ['udl', 'diff-inhalt'] }] });
    expect(deute(z('8', 'x', 'fachbereich', 'fachbereich + sport'))).toEqual({ ops: [{ typ: 'dazu', feld: 'fachbereich', wert: 'sport' }] });
    expect(deute(z('8', 'x', 'evidenz[0].geltung', 'geltung=Elementarbereich'))).toEqual({ ops: [{ typ: 'geltung', index: 0, wert: 'Elementarbereich' }] });
    expect(deute(z('8', 'x', 'raumbedarf; fachausstattungArt', 'raumbedarf=fachausstattung; fachausstattungArt=werkstatt'))).toEqual({
      ops: [{ typ: 'feld', feld: 'raumbedarf', wert: ['fachausstattung'] }, { typ: 'feld', feld: 'fachausstattungArt', wert: 'werkstatt' }]
    });
    expect(deute(z('5', 'x', 'eintragsart; nachbedingung', 'eintragsart=hilfe; nachbedingung entfällt (eine Hilfe trägt keine Phase)'))).toEqual({
      ops: [{ typ: 'feld', feld: 'eintragsart', wert: 'hilfe' }, { typ: 'feld', feld: 'nachbedingung', wert: [] }]
    });
    expect(deute(z('5', 'x', 'eintragsart; nachbedingung', 'eintragsart bleibt methode; nachbedingung=konzept-gesichert'))).toEqual({ ops: [{ typ: 'feld', feld: 'nachbedingung', wert: ['konzept-gesichert'] }] });
    expect(deute(z('5', 'x', 'eintragsart; nachbedingung', 'eintragsart bleibt methode; nachbedingung bleibt leer (Kontrast-Baustein); keine Hilfe'))).toEqual({ ops: [] });
    expect(deute(z('8', 'x', 'raumbedarf', 'raumbedarf bleibt leer'))).toEqual({ ops: [] });
    expect(deute(z('7', 'sprachstand', 'teilgruppen.json merkmale', 'Ausprägung kultureller-hintergrund-neu aus der Zeile nehmen (fällt unter sonst: Hilfe, U); Rest bleibt'))).toEqual({
      ops: [{ typ: 'tg-ohne', merkmal: 'sprachstand', wert: 'kultureller-hintergrund-neu' }]
    });
    expect(deute(z('7', 'sehen-hoeren', 'teilgruppen.json merkmale', 'grundlage=Recht'))).toEqual({ ops: [{ typ: 'tg-feld', merkmal: 'sehen-hoeren', feld: 'grundlage', wert: 'Recht' }] });
    expect(deute(z('7', 'm', 'teilgruppen.json merkmale', 'quelle ergänzen um „(ungeklärt)“; grundlage bleibt E'))).toEqual({ ops: [{ typ: 'tg-anhang', merkmal: 'm', feld: 'quelle', wert: '(ungeklärt)' }] });
    expect(deute(z('1', 'r', 'regeln.json wenn.methode', 'wenn.methode um x ergänzen'))).toEqual({ regel: true });
    expect(deute(z('8', 'x', 'raumbedarf', 'raumbedarf vielleicht stellflaeche'))).toHaveProperty('offen');
  });

  it('wendet an, hält die Reihenfolge der Schlüssel und ist wiederholbar', () => {
    const alt = { kennung: 'x', name: 'X', fachbereich: ['aesthetik'], fachbereichUngeeignet: ['sport'], dauerMax: 5, geeignetBeiVorwissen: ['mittel'], problem: 'p', evidenz: [{ geltung: 'a' }] };
    const ops = [
      { typ: 'feld', feld: 'fachbereichUngeeignet' },
      { typ: 'feld', feld: 'ungeeignetBeiVorwissen', wert: ['gering'] },
      { typ: 'feld', feld: 'geeignetBeiVorwissen' },
      { typ: 'grund', art: 'vorwissen', grund: { text: 'T.', grundlage: 'E' } },
      { typ: 'dazu', feld: 'fachbereich', wert: 'sport' },
      { typ: 'feld', feld: 'raumbedarf', wert: ['stellflaeche'] },
      { typ: 'feld', feld: 'eintragsart', wert: 'hilfe' },
      { typ: 'geltung', index: 0, wert: 'b' }
    ] as Op[];
    const neu = wendeAn(alt, ops);
    expect(Object.keys(neu)).toEqual(['kennung', 'name', 'eintragsart', 'fachbereich', 'raumbedarf', 'dauerMax', 'ungeeignetBeiVorwissen', 'eignungsgrund', 'problem', 'evidenz']);
    expect(neu.fachbereich).toEqual(['aesthetik', 'sport']);
    expect(neu.evidenz).toEqual([{ geltung: 'b' }]);
    expect(JSON.stringify(wendeAn(neu, ops))).toBe(JSON.stringify(neu));
    expect(wendeAn(alt, [{ typ: 'feld', feld: 'eintragsart', wert: 'methode' }]).eintragsart).toBe('methode');
  });

  it('schreibt teilgruppen.json im bisherigen Format', () => {
    const p = path.resolve(HERE, '..', '..', '..', 'data', 'teilgruppen.json');
    const text = fs.readFileSync(p, 'utf8');
    expect(formatiereTeilgruppen(JSON.parse(text))).toBe(text);
  });
});
