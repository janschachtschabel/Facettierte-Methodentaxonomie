import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { createSearch, createValidator, type CatalogBundle, type FmtData } from '@fmt/core';
import { SystematikPage, GRUNDLAGE_TEXT } from '../src/pages/SystematikPage.js';
import { grundlageKlartext } from '../src/planner/regelmeldung.js';
import { MethodDetailPage } from '../src/pages/MethodDetailPage.js';
import { ApiMcpPage } from '../src/pages/ApiMcpPage.js';
import { CatalogPage } from '../src/pages/CatalogPage.js';
import { RAUM_EIGENSCHAFT_KLARTEXT } from '../src/planner/rahmen.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const DATA = { ...BUNDLE, VERSION: BUNDLE.version } as unknown as FmtData;
const labels = new Map<string, string>();
for (const s of BUNDLE.schemes) for (const w of s.werte || (s.gruppen || []).flatMap((g) => g.werte)) labels.set(`${s.id}:${w.id}`, w.label);

const validator = createValidator(DATA);
const CATALOG = {
  bundle: BUNDLE,
  loading: false,
  error: null,
  blocksById: new Map(BUNDLE.bausteine.map((b) => [b.kennung, b])),
  search: createSearch(DATA, validator),
  comparePair: [null, null],
  setComparePair: () => {},
  queueBlockForPlanner: () => {},
  labelOf: (scheme: string, code: string) => labels.get(`${scheme}:${code}`) || code,
  valuesOf: (scheme: string) => {
    const s = BUNDLE.schemes.find((x) => x.id === scheme);
    return s ? s.werte || (s.gruppen || []).flatMap((g) => g.werte) : [];
  }
};
vi.mock('../src/data/CatalogContext.js', () => ({ useCatalog: () => CATALOG }));

afterEach(() => cleanup());

const sectionOf = (heading: string) => screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement;

describe('W-Raster in der Oberfläche', () => {
  it('Systematik zeigt das W-Raster mit neun W-Feldern, fünf Arten, Raumtypen und Zielarten', () => {
    render(
      <MemoryRouter>
        <SystematikPage />
      </MemoryRouter>
    );
    const sec = sectionOf('Das W-Raster: neun Fragen, fünf Arten von Aussagen');
    const raster = within(sec).getByRole('table', { name: 'W-Raster' });
    const zeilen = within(raster).getAllByRole('row').slice(1);
    expect(zeilen.length).toBe(9);
    for (const w of BUNDLE.wfelder!) expect(within(raster).getByText(w.frage)).toBeTruthy();
    for (const a of BUNDLE.arten!) expect(within(raster).getByRole('columnheader', { name: a.name })).toBeTruthy();
    for (const feld of ['raumbedarf', 'schriftbedarf', 'termineMin', 'fachbereichUngeeignet']) expect(within(raster).getByText(feld)).toBeTruthy();

    const raeume = within(sec).getByRole('table', { name: 'Raumtypen' });
    expect(within(raeume).getAllByRole('row').slice(1).length).toBe(12);
    expect(within(raeume).getByText('Hörsaal')).toBeTruthy();

    const ziele = within(sec).getByRole('table', { name: 'Zielarten' });
    expect(within(ziele).getAllByRole('row').slice(1).length).toBe(9);
    expect(within(ziele).getByText(/Urteilsbildung/)).toBeTruthy();
    expect(within(ziele).getAllByText(/Kontrovers diskutieren und abwägen/).length).toBeGreaterThan(0);

    expect(screen.getByRole('heading', { name: 'Die 12 Lernzustände als Schnittstelle' })).toBeTruthy();
    expect(screen.queryAllByText(/11 Lernzustände/).map((e) => e.textContent)).toEqual([]);
    expect(screen.queryAllByText(/Ergänzende Merkmale/).map((e) => e.textContent)).toEqual([]);
    expect(screen.queryAllByText(/Bedingungsraum/).map((e) => e.textContent)).toEqual([]);
    // Room types are never called "Lernort" (a method name may still contain the word).
    expect(sec.textContent).not.toMatch(/Lernort/);
  });

  it('Systematik zeigt die Kette vollständige Handlung mit ihrer Grundlage (Paket D, D5)', () => {
    render(
      <MemoryRouter>
        <SystematikPage />
      </MemoryRouter>
    );
    const tabelle = screen.getByRole('table', { name: 'Funktionsketten' });
    expect(within(tabelle).getAllByRole('row').slice(1).length).toBe(BUNDLE.ketten.length);
    const zeile = within(tabelle).getByText('Berufliche Handlung (vollständige Handlung)').closest('tr') as HTMLElement;
    expect(within(zeile).getByText(/Auftrag analysieren, informieren/)).toBeTruthy();
    expect(zeile.textContent).toContain('Grundlage: ungeklärt (U)');
    expect(zeile.textContent).toContain('KMK 2021: Lernsituationen im Lernfeld; Lernwirksamkeit der Phasenfolge kaum geprüft');
    const ziele = screen.getByRole('table', { name: 'Zielarten' });
    expect(within(ziele).getAllByText('Berufliche Handlung (vollständige Handlung)').length).toBe(1);
  });

  it('Systematik zeigt die Passungsregeln aus den Daten neben den 13 Kompositionsregeln (Task B4)', () => {
    render(
      <MemoryRouter>
        <SystematikPage />
      </MemoryRouter>
    );
    const sec = sectionOf('Passungsregeln');
    const tabelle = within(sec).getByRole('table', { name: 'Passungsregeln' });
    expect(within(tabelle).getAllByRole('row').slice(1).length).toBe(BUNDLE.regeln!.length);
    expect(within(tabelle).getByText('Schrift bei niedrigem Sprachniveau')).toBeTruthy();
    expect(within(tabelle).getAllByText(/Höfler et al\. 2024/).length).toBeGreaterThan(0);
    // An example placeholder in parentheses is left out; no "(z. B. die Methode)".
    expect(within(tabelle).getByText('Im Ablauf wird praktisch gearbeitet. Kläre vorher Sicherheit und Aufsicht.')).toBeTruthy();
    expect(tabelle.textContent).not.toMatch(/z\. B\. die Methode/);
    const wirkung = within(sec).getByRole('table', { name: 'Welche Wirkung hat welche Art' });
    for (const w of ['schließt aus', 'warnt', 'ordnet', 'weist hin']) expect(within(wirkung).getByRole('rowheader', { name: w })).toBeTruthy();
    expect(within(wirkung).getByText('Eignung')).toBeTruthy();
    // The section stands next to the composition rules.
    const kompo = sectionOf('Die 13 Kompositionsregeln (R-00 bis R-12)');
    expect(kompo.nextElementSibling).toBe(sec);
    expect(sec.textContent).not.toMatch(/Bedingungsraum|Anforderung/);
  });

  it('Grundlage „U“ heißt „ungeklärt“ (Spec §6), nicht „Umsetzung“', () => {
    expect(grundlageKlartext({ grundlage: 'U' })).toBe('ungeklärt');
    expect(GRUNDLAGE_TEXT.U).toBe('ungeklärt (U)');
  });

  it('Methodendetail zeigt „Was die Methode braucht“ nach W-Feld mit dem Hinweis zum Raum', () => {
    const b = BUNDLE.bausteine.find((x) => x.raumhinweis && (x.raumbedarf || []).length)!;
    render(
      <MemoryRouter initialEntries={[`/methoden/${b.kennung}`]}>
        <Routes>
          <Route path="/methoden/:kennung" element={<MethodDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    const sec = sectionOf('Was die Methode braucht');
    expect(within(sec).getByText('Lernumgebung')).toBeTruthy();
    expect(within(sec).getByText('Zeit')).toBeTruthy();
    expect(within(sec).getByText(RAUM_EIGENSCHAFT_KLARTEXT[b.raumbedarf![0]], { exact: false })).toBeTruthy();
    expect(within(sec).getByText(b.raumhinweis!, { exact: false })).toBeTruthy();

    cleanup();
    const t = BUNDLE.bausteine.find((x) => x.termineMin)!;
    render(
      <MemoryRouter initialEntries={[`/methoden/${t.kennung}`]}>
        <Routes>
          <Route path="/methoden/:kennung" element={<MethodDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(within(sectionOf('Was die Methode braucht')).getByText(`mindestens ${t.termineMin} Termine`, { exact: false })).toBeTruthy();
  });

  it('Methodendetail zeigt einen Eintrag ohne OEH-Kategorie und kennzeichnet den Status entwurf als Ersterfassung (D7)', () => {
    const b = BUNDLE.bausteine.find((x) => !x.kategorie && x.status === 'entwurf')!;
    expect(b).toBeDefined();
    render(
      <MemoryRouter initialEntries={[`/methoden/${b.kennung}`]}>
        <Routes>
          <Route path="/methoden/:kennung" element={<MethodDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toContain(b.name);
    expect(screen.getAllByText('Ersterfassung').length).toBeGreaterThan(0);
    expect(screen.queryByText('OpenEduHub-Kategorien:')).toBeNull();
  });

  it('Katalog schaltet zwischen Methoden und Hilfen um; eine Hilfe kommt nicht als Phase in den Baukasten (Task C4)', () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    const anzahl = () => Number((screen.getByTestId('trefferzahl').textContent || '').match(/\d+/)![0]);
    const hilfen = BUNDLE.bausteine.filter((b) => b.eintragsart === 'hilfe');
    expect(hilfen.length).toBeGreaterThan(0);
    const umschalter = screen.getByRole('group', { name: 'Methoden / Hilfen' });
    expect(anzahl()).toBe(BUNDLE.bausteine.length);
    fireEvent.click(within(umschalter).getByRole('button', { name: /^Hilfen/ }));
    expect(anzahl()).toBe(hilfen.length);
    expect(screen.getByText(hilfen[0].name)).toBeTruthy();
    // A help has no button "+ Baukasten": it is assigned to the phases in step 3.
    expect(screen.queryAllByRole('button', { name: '+ Baukasten' })).toEqual([]);
    fireEvent.click(within(umschalter).getByRole('button', { name: /^Methoden \(/ }));
    expect(anzahl()).toBe(BUNDLE.bausteine.length - hilfen.length);
    expect(screen.queryByText(hilfen[0].name)).toBeNull();

    cleanup();
    render(
      <MemoryRouter initialEntries={[`/methoden/${hilfen[0].kennung}`]}>
        <Routes>
          <Route path="/methoden/:kennung" element={<MethodDetailPage />} />
        </Routes>
      </MemoryRouter>
    );
    expect(screen.getByText('Hilfe', { selector: '.status-badge' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /In Szenario-Baukasten übernehmen/ })).toBeNull();
    expect(screen.getByText(/ordnest du sie in Schritt 3 den Phasen zu/)).toBeTruthy();
  }, 60_000);

  it('Katalog filtert nach Raum und „ohne Lesen und Schreiben“', () => {
    render(
      <MemoryRouter>
        <CatalogPage />
      </MemoryRouter>
    );
    // The table view renders faster than 300 cards with diagrams.
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    const anzahl = () => Number((screen.getByTestId('trefferzahl').textContent || '').match(/\d+/)![0]);
    const alle = anzahl();
    expect(alle).toBe(BUNDLE.bausteine.length);

    // Independent expectation: the lecture hall offers a writing place and a wall (vocab raumtyp), so only methods
    // whose room needs are among these stay; a warm-up (Bewegungsfläche) goes, a lecture (no room need) stays.
    fireEvent.change(screen.getByLabelText('Raum'), { target: { value: 'hoersaal' } });
    const hoersaalBietet = new Set(['schreibplatz', 'wandflaeche']);
    const imHoersaal = BUNDLE.bausteine.filter((b) => (b.raumbedarf || []).every((x) => hoersaalBietet.has(x))).length;
    expect(imHoersaal).toBeGreaterThan(0);
    expect(imHoersaal).toBeLessThan(alle);
    expect(anzahl()).toBe(imHoersaal);
    expect(screen.queryByText('Aufwärmen / Aufwärmspiel')).toBeNull();
    expect(screen.getByText('Lehrervortrag (klassisch)')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Raum'), { target: { value: '' } });
    fireEvent.click(screen.getByLabelText('ohne Lesen und Schreiben'));
    // A learning journal (schreibt) goes; the warm-up (no reading or writing) is back.
    expect(anzahl()).toBeGreaterThan(0);
    expect(anzahl()).toBeLessThan(alle);
    expect(screen.queryByText('Lerntagebuch mit Leitfragen (Prompts)')).toBeNull();
    expect(screen.getByText('Aufwärmen / Aufwärmspiel')).toBeTruthy();
    }, 60_000);
});


describe('Lesarten und Evidenzbezug in der Oberfläche (Paket D, D4)', () => {
  const zeigeMethode = (kennung: string) =>
    render(
      <MemoryRouter initialEntries={[`/methoden/${kennung}`]}>
        <Routes>
          <Route path="/methoden/:kennung" element={<MethodDetailPage />} />
        </Routes>
      </MemoryRouter>
    );

  it('Methodendetail nennt den Bezug jeder Evidenzaussage mit den drei Wendungen', () => {
    const mit = (bezug: string) => BUNDLE.bausteine.find((b) => b.evidenz.some((e) => e.evidenzBezug === bezug))!;
    zeigeMethode(mit('methode').kennung);
    expect(within(sectionOf('Q4 Evidenzlage (stets unter Bedingungen)')).getAllByText(/gilt der Methode/).length).toBeGreaterThan(0);
    cleanup();
    zeigeMethode(mit('prinzip').kennung);
    expect(within(sectionOf('Q4 Evidenzlage (stets unter Bedingungen)')).getAllByText(/gilt dem Wirkprinzip/).length).toBeGreaterThan(0);
    cleanup();
    // No method carries programm yet (Tor D3); the phrase is shown once a finding does.
    const b = mit('methode');
    const geaendert = { ...b, evidenz: b.evidenz.map((e) => ({ ...e, evidenzBezug: 'programm' as const })) };
    const vorher = CATALOG.blocksById.get(b.kennung)!;
    CATALOG.blocksById.set(b.kennung, geaendert);
    const idx = BUNDLE.bausteine.indexOf(vorher);
    BUNDLE.bausteine[idx] = geaendert;
    try {
      zeigeMethode(b.kennung);
      expect(within(sectionOf('Q4 Evidenzlage (stets unter Bedingungen)')).getAllByText(/gilt ganzen Programmen, nicht der einzelnen Phase/).length).toBeGreaterThan(0);
    } finally {
      CATALOG.blocksById.set(b.kennung, vorher);
      BUNDLE.bausteine[idx] = vorher;
    }
  });

  it('Methoden des Fachbereichs Ästhetik werden mit dem Eigenwert begründet, ohne Transferversprechen', () => {
    const satz = 'Begründet mit dem Eigenwert; ein Transfer auf andere Leistungen ist nicht belegt (Sala & Gobet 2020).';
    const aesth = BUNDLE.bausteine.find((b) => (b.fachbereich || []).includes('aesthetik'))!;
    zeigeMethode(aesth.kennung);
    expect(within(sectionOf('Q4 Evidenzlage (stets unter Bedingungen)')).getByText(satz)).toBeTruthy();
    cleanup();
    const andere = BUNDLE.bausteine.find((b) => !(b.fachbereich || []).includes('aesthetik'))!;
    zeigeMethode(andere.kennung);
    expect(screen.queryByText(satz)).toBeNull();
  });

  it('Systematik zeigt die Tabelle der Lesarten: zwölf Lernstände, vier Lesarten, Strich als Label', () => {
    render(
      <MemoryRouter>
        <SystematikPage />
      </MemoryRouter>
    );
    const tabelle = screen.getByRole('table', { name: 'Lesarten der Lernstände' });
    const zeilen = within(tabelle).getAllByRole('row').slice(1);
    expect(zeilen.length).toBe(12);
    for (const k of ['Wissen und Konzepte', 'Bewegung und Fertigkeit', 'Urteilen und Werten', 'Gestalten und Produzieren'])
      expect(within(tabelle).getByRole('columnheader', { name: k })).toBeTruthy();
    const zeile = within(tabelle).getByRole('rowheader', { name: /prozedur-gelaeufig/ }).closest('tr') as HTMLElement;
    expect(zeile.textContent).toContain('Feinform gelingt');
    expect(zeile.textContent).toContain('Technik geläufig');
    expect(within(tabelle).getAllByText('Ausgangslage sichtbar').length).toBe(4);
  });
});

describe('Systematik nach FMT 2.0 (Paket D, D7)', () => {
  const zeige = () =>
    render(
      <MemoryRouter>
        <SystematikPage />
      </MemoryRouter>
    );

  it('Tabelle „Tausch oder Hilfe“: jede Zeile aus teilgruppen.json mit Antwort, Grundlage und Quelle, dazu sonst und gesperrt', () => {
    zeige();
    const tabelle = screen.getByRole('table', { name: 'Tausch oder Hilfe' });
    const zeilen = within(tabelle).getAllByRole('row').slice(1);
    expect(zeilen.length).toBe(BUNDLE.teilgruppen.merkmale.length + 1);
    for (const m of BUNDLE.teilgruppen.merkmale) {
      const z = within(tabelle).getByRole('rowheader', { name: new RegExp(m.id) }).closest('tr') as HTMLElement;
      expect(z.textContent).toContain(m.antwort === 'tausch' ? 'Tausch' : 'Hilfe');
      expect(z.textContent).toContain(m.wohin);
      expect(z.textContent).toContain(GRUNDLAGE_TEXT[m.grundlage] || m.grundlage);
      if (m.quelle) expect(z.textContent).toContain(m.quelle);
    }
    expect(within(tabelle).getByText(BUNDLE.teilgruppen.sonst.wohin)).toBeTruthy();
    expect(screen.getByText(BUNDLE.teilgruppen.gesperrtText, { exact: false })).toBeTruthy();
  });

  it('Planungsprofile: fünf Bereiche mit Einheit, Dokument und Modulen, sieben Kernfelder', () => {
    zeige();
    const tabelle = screen.getByRole('table', { name: 'Planungsprofile' });
    expect(within(tabelle).getAllByRole('row').slice(1).length).toBe(5);
    for (const p of BUNDLE.planungsprofile.profile) {
      const z = within(tabelle).getByRole('rowheader', { name: new RegExp(` ${p.id}$`) }).closest('tr') as HTMLElement;
      expect(z.textContent).toContain(p.einheit);
      expect(z.textContent).toContain(p.dokument);
      for (const m of p.module) expect(z.textContent).toContain(m.name);
    }
    const kern = screen.getByRole('list', { name: 'Kernfelder des Entwurfs' });
    expect(within(kern).getAllByRole('listitem').length).toBe(7);
  });

  it('Begleitziele: drei Ziele mit Signal an der Methode und Zahl der Methoden, die sie tragen', () => {
    zeige();
    const tabelle = screen.getByRole('table', { name: 'Begleitziele' });
    const werte = BUNDLE.schemes.find((x) => x.id === 'begleitziel')!.werte!;
    expect(within(tabelle).getAllByRole('row').slice(1).length).toBe(werte.length);
    expect(werte.length).toBe(3);
    for (const w of werte) expect(within(tabelle).getByRole('rowheader', { name: new RegExp(w.label) })).toBeTruthy();
    expect(screen.getByText(/wählt nie die Kette/)).toBeTruthy();
  });

  it('Grenzen: die offenen Punkte aus dem Design stehen auf der Seite', () => {
    zeige();
    const sec = sectionOf('Grenzen der FMT 2.0');
    for (const t of [/Bindung ist gezählt/, /Was ein Raumtyp bietet, ist gesetzt/, /Lesarten sind gesetzt/, /zwei unabhängige Kodierende/i, /Nutzen für das Lernen/])
      expect(within(sec).getByText(t)).toBeTruthy();
  });
});

describe('API-Seite nach FMT 2.0 (Paket D, D7)', () => {
  it('nennt die neuen Anfrage- und Antwortfelder mit Beispielanfrage', () => {
    render(
      <MemoryRouter>
        <ApiMcpPage />
      </MemoryRouter>
    );
    const sec = sectionOf('Neue Felder der FMT 2.0');
    const felder = within(sec).getByRole('table', { name: 'Neue Felder der FMT 2.0' });
    for (const f of ['planungsprofil', 'begleitziel', 'termine', 'nachweis', 'raum', 'ohneSchrift', 'pflichtangaben', 'regelmeldungen', 'begleitstrang', 'entwurf', 'teilgruppenImpulse', 'genannteHilfen'])
      expect(within(felder).getAllByText(f).length, f).toBeGreaterThan(0);
    const beispiel = within(sec).getByLabelText('Beispielanfrage FMT 2.0').textContent || '';
    expect(beispiel).toContain('"planungsprofil": "schule"');
    expect(beispiel).toContain('"begleitziel"');
    const antwort = within(sec).getByLabelText('Auszug der Antwort').textContent || '';
    for (const f of ['"pflichtangaben"', '"regelmeldungen"', '"begleitstrang"', '"planungsprofil"', '"status": "entwurf"']) expect(antwort, f).toContain(f);
  });
});

