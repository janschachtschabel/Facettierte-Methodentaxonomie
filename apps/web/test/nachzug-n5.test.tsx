import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { MCP_HINWEISE, createSearch, createValidator, type CatalogBundle, type FmtData } from '@fmt/core';
import { MethodDetailPage, HILFE_ERKLAERUNG } from '../src/pages/MethodDetailPage.js';
import { ComparePage } from '../src/pages/ComparePage.js';
import { CatalogPage } from '../src/pages/CatalogPage.js';
import { DifferentiationPage, OHNE_METHODE_TEXT } from '../src/pages/DifferentiationPage.js';
import { ACTIVE_PLANNER_DRAFT_KEY } from '../src/planner/scenarioStorage.js';
import { SystematikPage, zuordnungsStufen } from '../src/pages/SystematikPage.js';
import { ApiMcpPage } from '../src/pages/ApiMcpPage.js';
import { Layout } from '../src/components/Layout.js';
import { filterAusUrl, filterInUrl } from '../src/data/katalogFilter.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BUNDLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist-data', 'catalog.bundle.json'), 'utf8')) as CatalogBundle;
const DATA = { ...BUNDLE, VERSION: BUNDLE.version } as unknown as FmtData;
const labels = new Map<string, string>();
for (const s of BUNDLE.schemes) for (const w of s.werte || (s.gruppen || []).flatMap((g) => g.werte)) labels.set(`${s.id}:${w.id}`, w.label);
const VERBOTEN = [/Anforderung/, /Bedingungsraum/, /Ergänzende Merkmale/, /Q2 Bedingungen/];

const CATALOG = {
  bundle: BUNDLE,
  loading: false,
  error: null,
  blocksById: new Map(BUNDLE.bausteine.map((b) => [b.kennung, b])),
  search: createSearch(DATA, createValidator(DATA)),
  comparePair: ['fehleranalyse', 'scaffolding-hilfen'] as [string, string],
  setComparePair: () => {},
  queueBlockForPlanner: () => {},
  setLlmSettingsOpen: () => {},
  byok: { enabled: false },
  labelOf: (scheme: string, code: string) => labels.get(`${scheme}:${code}`) || code,
  valuesOf: (scheme: string) => {
    const s = BUNDLE.schemes.find((x) => x.id === scheme);
    return s ? s.werte || (s.gruppen || []).flatMap((g) => g.werte) : [];
  }
};
vi.mock('../src/data/CatalogContext.js', () => ({ useCatalog: () => CATALOG }));

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

const methode = (k: string) => BUNDLE.bausteine.find((b) => b.kennung === k)!;
const zeige = (kennung: string) =>
  render(
    <MemoryRouter initialEntries={[`/methoden/${kennung}`]}>
      <Routes>
        <Route path="/methoden/:kennung" element={<MethodDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
const sectionOf = (heading: string) => screen.getByRole('heading', { name: heading }).closest('section') as HTMLElement;

describe('Methodendetail nach W-Raster (App-Nachzug N5)', () => {
  it('Block „Eignung“ nennt Vorwissen, Stufe und Fachbereich mit Grund und Grundlage; kein „Q2 Bedingungen“ mehr', () => {
    const f = methode('fehleranalyse');
    zeige(f.kennung);
    const sec = sectionOf('Eignung');
    const tab = within(sec).getByRole('table', { name: 'Eignung nach W-Feld' });
    // W-field of the data (vocab.merkmale: ungeeignetBeiVorwissen → lernende).
    expect(within(tab).getByText('Lernende')).toBeTruthy();
    expect(tab.textContent).toContain('Vorwissen:');
    expect(tab.textContent).toContain(`Passt weniger zu: ${labels.get('vorwissen:gering')}`);
    expect(tab.textContent).toContain(f.eignungsgrund!.vorwissen!.text);
    expect(tab.textContent).toContain(`Grundlage: belegt (${f.eignungsgrund!.vorwissen!.quelle})`);
    const body = document.body.textContent || '';
    for (const w of VERBOTEN) expect(body).not.toMatch(w);
    expect(body).not.toContain('Weniger geeignet für');
    cleanup();

    zeige('dual-praxismodul');
    const st = within(sectionOf('Eignung')).getByRole('table', { name: 'Eignung nach W-Feld' });
    expect(st.textContent).toContain('Bildungsstufe:');
    expect(st.textContent).toContain('Grundlage: gefolgert');
    cleanup();

    zeige('bestimmungsuebung');
    const fb = within(sectionOf('Eignung')).getByRole('table', { name: 'Eignung nach W-Feld' });
    expect(within(fb).getByText('Lerninhalte')).toBeTruthy();
    expect(fb.textContent).toContain('Fachbereich:');
    for (const c of methode('bestimmungsuebung').fachbereichUngeeignet!) expect(fb.textContent).toContain(labels.get(`fachbereich:${c}`)!);
  });

  it('Block „Einordnung“ nennt Ketten und Schritte mit gebundener Wissensart und die Lernstände in der Lesart der Zielart', () => {
    const b = methode('abc-liste');
    zeige(b.kennung);
    const sec = sectionOf('Einordnung');
    const tab = within(sec).getByRole('table', { name: 'Einordnung in Funktionsketten' });
    // Independent expectation from ketten.json: steps that ask for a learning function of the method and either bind
    // no knowledge type (edge) or one the method carries (D1).
    const erwartet = BUNDLE.ketten.flatMap((k) =>
      k.schritte
        .filter((st) => st.funktion.some((fn) => b.lernfunktion.includes(fn)))
        .filter((st) => st.rolle === 'rand' || !st.wissensart?.length || st.wissensart.some((w) => b.aufgabe.includes(w)))
        .map((st) => ({ k, st }))
    );
    expect(erwartet.length).toBeGreaterThan(0);
    for (const { k, st } of erwartet) {
      const zeile = within(tab).getByText(k.label, { selector: 'td > strong' }).closest('tr') as HTMLElement;
      expect(zeile.textContent, `${k.id}/${st.id}`).toContain(st.label);
    }
    // Movement chain: the reading of the learning state in movement words (vocab lernzustand[].lesart.bewegung).
    const bew = within(tab).getByText(BUNDLE.ketten.find((k) => k.id === 'fertigkeit-bewegung')!.label, { selector: 'td > strong' }).closest('tr') as HTMLElement;
    const zustand = BUNDLE.schemes.find((s) => s.id === 'lernzustand')!.werte!.find((w) => w.id === b.nachbedingung[0])!;
    expect(bew.textContent).toContain((zustand.lesart as Record<string, string>).bewegung);
    expect(bew.textContent).toContain('bindet keine Wissensart');
    // A step that binds a knowledge type names it.
    const gebunden = erwartet.find(({ st }) => st.rolle !== 'rand' && st.wissensart?.length);
    if (gebunden) {
      const z = within(tab).getByText(gebunden.k.label, { selector: 'td > strong' }).closest('tr') as HTMLElement;
      expect(z.textContent).toContain(labels.get(`aufgabenstruktur:${gebunden.st.wissensart![0]}`) || '');
    }
    // Beitrag, Bedarf, Eignung and Einordnung each grouped by W-field.
    expect(screen.getByRole('table', { name: 'Beitrag nach W-Feld' })).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Bedarf nach W-Feld' })).toBeTruthy();
    expect(within(sec).getByRole('table', { name: 'Einordnung nach W-Feld' }).textContent).toContain('Eintragsart: Methode');
  });

  it('eine Hilfe zeigt kein Radar und keine Schnittstelle, sondern was sie stützt', () => {
    const h = BUNDLE.bausteine.find((b) => b.eintragsart === 'hilfe')!;
    zeige(h.kennung);
    expect(screen.queryByRole('heading', { name: '13-Facetten-Profil' })).toBeNull();
    expect(screen.queryByRole('heading', { name: /Schnittstelle/ })).toBeNull();
    const box = screen.getByRole('region', { name: 'Was die Hilfe stützt' });
    expect(box.textContent).toContain(HILFE_ERKLAERUNG);
    for (const f of h.lernfunktion) expect(box.textContent).toContain(labels.get(`lernfunktion:${f}`)!);
    expect(within(sectionOf('Einordnung')).getByText(/füllt keinen Kettenschritt/)).toBeTruthy();
  });
});

describe('Vergleich (App-Nachzug N5)', () => {
  it('hat Zeilen für Eintragsart, Raumbedarf, Schriftbedarf, Termine, Fachbereich, Eignung und Evidenzbezug; Hilfen sind gekennzeichnet', () => {
    render(
      <MemoryRouter>
        <ComparePage />
      </MemoryRouter>
    );
    const tabelle = screen.getAllByRole('table').at(-1)!;
    const zeile = (label: string) => within(tabelle).getByText(label).closest('tr') as HTMLElement;
    expect(zeile('Eintragsart').textContent).toContain('Methode');
    expect(zeile('Eintragsart').textContent).toContain('Hilfe');
    for (const l of ['Raumbedarf', 'Schriftbedarf (Lernende …)', 'Termine', 'Fachbereich', 'Fachbereich ungeeignet', 'Evidenzbezug']) expect(zeile(l)).toBeTruthy();
    expect(zeile('Bildungsstufe und Vorwissen').textContent).toContain('Grundlage: belegt');
    expect(zeile('Bildungsstufe und Vorwissen').textContent).toContain('keine Einschränkung erfasst');
    for (const g of ['Einordnung', 'Bedarf', 'Eignung', 'Beitrag und Evidenz']) expect(within(tabelle).getByRole('columnheader', { name: g })).toBeTruthy();
    const hilfen = BUNDLE.bausteine.filter((b) => b.eintragsart === 'hilfe');
    const optionen = screen.getAllByRole('option').map((o) => o.textContent);
    for (const h of hilfen) expect(optionen).toContain(`${h.name} (Hilfe)`);
  });
});

describe('Katalog: Filter über die Kernsuche, alle im Link (App-Nachzug N5)', () => {
  function Ort() {
    const l = useLocation();
    return <div data-testid="ort">{l.search}</div>;
  }
  const zeigeKatalog = (url = '/') =>
    render(
      <MemoryRouter initialEntries={[url]}>
        <Routes>
          <Route
            path="/"
            element={
              <>
                <CatalogPage />
                <Ort />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    );
  const anzahl = () => Number((screen.getByTestId('trefferzahl').textContent || '').match(/\d+/)![0]);

  it('filterAusUrl und filterInUrl lesen einander (Listen, Zahlen, Schalter)', () => {
    const f = { raum: 'hoersaal', ohneSchrift: ['lesen', 'schreiben'], termine: 1, ohneKI: true, raumbedarf: 'stellflaeche', ohneRaumbedarf: 'bewegungsflaeche' };
    expect(filterAusUrl(filterInUrl(f))).toEqual(f);
    expect(filterInUrl(f).toString()).toContain('ohneSchrift=lesen%2Cschreiben');
  });

  it('„ohne Lesen“ und „ohne Schreiben“ getrennt, über die Kernsuche, und im Link', () => {
    zeigeKatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    fireEvent.click(screen.getByLabelText('ohne Schreiben'));
    const nurSchreiben = BUNDLE.bausteine.filter((b) => !(b.schriftbedarf || []).includes('schreibt')).length;
    expect(anzahl()).toBe(nurSchreiben);
    expect(screen.getByTestId('ort').textContent).toContain('ohneSchrift=schreiben');
    fireEvent.click(screen.getByLabelText('ohne Lesen'));
    expect(anzahl()).toBe(BUNDLE.bausteine.filter((b) => !(b.schriftbedarf || []).length).length);
    expect(screen.getByTestId('ort').textContent).toContain('ohneSchrift=lesen%2Cschreiben');
  }, 60_000);

  it('ein Link mit Raum, Raumbedarf, Termine und Schrift stellt die Filter wieder her', () => {
    zeigeKatalog('/?ohneRaumbedarf=bewegungsflaeche&termine=1&ohneSchrift=lesen&raum=klassenraum&eintragsart=methode');
    fireEvent.click(screen.getByRole('button', { name: 'Tabelle' }));
    const erwartet = CATALOG.search.suche({ ohneRaumbedarf: 'bewegungsflaeche', termine: 1, ohneSchrift: ['lesen'], raum: 'klassenraum', eintragsart: 'methode' }).length;
    // Independent check of two of the filters.
    const grob = BUNDLE.bausteine.filter(
      (b) => b.eintragsart !== 'hilfe' && !(b.raumbedarf || []).includes('bewegungsflaeche') && !((b.termineMin ?? 1) > 1) && !(b.schriftbedarf || []).includes('liest')
    ).length;
    expect(erwartet).toBeLessThanOrEqual(grob);
    expect(erwartet).toBeGreaterThan(0);
    expect(anzahl()).toBe(erwartet);
    expect((screen.getByLabelText('ohne Lesen') as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Raum') as HTMLSelectElement).value).toBe('klassenraum');
    fireEvent.click(screen.getByRole('button', { name: /Alle Facetten/ }));
    expect((screen.getByLabelText('Ohne Bedarf an') as HTMLSelectElement).value).toBe('bewegungsflaeche');
    expect((screen.getByLabelText('Termine verfügbar') as HTMLInputElement).value).toBe('1');
    fireEvent.change(screen.getByLabelText('Braucht im Raum'), { target: { value: 'stellflaeche' } });
    expect(screen.getByTestId('ort').textContent).toContain('raumbedarf=stellflaeche');
    expect(anzahl()).toBe(CATALOG.search.suche({ ohneRaumbedarf: 'bewegungsflaeche', termine: 1, ohneSchrift: ['lesen'], raum: 'klassenraum', eintragsart: 'methode', raumbedarf: 'stellflaeche' }).length);
  }, 60_000);
});

describe('Binnendifferenzierung zeigt passt, Hilfe oder Tausch (App-Nachzug N5)', () => {
  it('ohne geplante Methode: ein Hinweis und die Hilfen der Matrix einmal je Gruppe, keine Karten; gesperrte Merkmale werden genannt', () => {
    render(
      <MemoryRouter initialEntries={['/differenzierung']}>
        <DifferentiationPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('tab', { name: /Nach Phase/ }));
    const block = screen.getByRole('region', { name: 'Passt, Hilfe oder andere Methode' });
    expect(within(block).getByText(OHNE_METHODE_TEXT)).toBeTruthy();
    // No decision per phase was made, so no card says one was.
    expect(within(block).queryAllByText('Hilfe in dieser Methode')).toEqual([]);
    expect(within(block).queryAllByText(/^Beleg:/)).toEqual([]);
    expect(within(block).queryAllByRole('region', { name: /Entscheidung für/ })).toEqual([]);
    const liste = within(block).getByRole('list', { name: 'Hilfen der Matrix je Teilgruppe' });
    const daz = within(liste).getByText(/DaZ/).closest('li') as HTMLElement;
    // Once per group: each help at most once, with its abbau.
    const namen = within(daz).getAllByRole('listitem').map((li) => li.firstChild?.textContent);
    expect(namen.length).toBeGreaterThan(0);
    expect(new Set(namen).size).toBe(namen.length);
    expect(within(daz).getAllByText(/Wann die Hilfe entfällt:/).length).toBe(namen.length);
    // The phase boxes say the same instead of "Hilfe in dieser Methode".
    expect(screen.queryAllByText('Hilfe in dieser Methode')).toEqual([]);
    expect(screen.getAllByText(/Noch keine Methode geplant$/).length).toBeGreaterThan(0);

    // A blocked trait (Lerntypen) is named with its reason.
    fireEvent.change(document.getElementById('diff-groups-input') as HTMLInputElement, {
      target: { value: '4 Lernende mit geringem Vorwissen, 3 Lerntypen visuell' }
    });
    const gesperrt = within(screen.getByRole('region', { name: 'Passt, Hilfe oder andere Methode' })).getByRole('list', { name: 'Nicht ausgewertete Merkmale' });
    expect(gesperrt.textContent).toMatch(/Lerntypen/);
    expect(gesperrt.textContent).toMatch(/nicht belegt/);
  });

  it('mit geplanten Methoden: Karten mit Beleg, Grundlage und „Wann die Hilfe entfällt“, ohne Hinweis und ohne Knöpfe', () => {
    window.sessionStorage.setItem(
      ACTIVE_PLANNER_DRAFT_KEY,
      JSON.stringify({
        updatedAt: new Date().toISOString(),
        title: 'Physik · Dichte',
        fach: 'Physik',
        thema: 'Dichte',
        scenarioText: 'Physik Klasse 7 Dichte',
        bildungsstufe: 'sek1',
        zeitMin: 45,
        maxTechnik: 't-keine',
        ohneInternet: true,
        ohneKI: false,
        arrangement: {
          typ: 'Arrangement',
          name: 'Dichte',
          kontext: { bildungsstufe: 'sek1', zeitbudgetMin: 45 },
          ablauf: {
            typ: 'Sequenz',
            teile: [
              { typ: 'Einsatz', baustein: 'ampelspiel', dauerMin: 10 },
              { typ: 'Einsatz', baustein: 'partnerarbeit', dauerMin: 20 }
            ]
          }
        },
        groups: [
          { id: 'regel', label: 'Regelgruppe', profile: '', focus: 'regel', active: true, count: 20, personaId: 'average' },
          { id: 'basis', label: 'Basis & Sprachsensibel', profile: '', focus: 'basis', active: true, count: 6, matrixValues: { sprachkompetenz: 'sprachkompetenz-gering' }, genannt: ['sprachkompetenz-gering'] }
        ]
      })
    );
    render(
      <MemoryRouter initialEntries={['/differenzierung?source=planner']}>
        <DifferentiationPage />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('tab', { name: /Nach Phase/ }));
    const block = screen.getByRole('region', { name: 'Passt, Hilfe oder andere Methode' });
    expect(within(block).queryByText(OHNE_METHODE_TEXT)).toBeNull();
    const gruppe = within(block).getByRole('region', { name: /Entscheidung für Basis/ });
    const titel = within(gruppe).getAllByText(/^(Passt so|Hilfe in dieser Methode|Andere Methode für diese Gruppe)$/);
    // One card per planned phase.
    expect(titel.length).toBe(2);
    expect(within(gruppe).getAllByText(/^Grundlage:/).length).toBeGreaterThan(0);
    if (within(gruppe).queryAllByText('Hilfe in dieser Methode').length) {
      expect(within(gruppe).getAllByText(/^Beleg:/).length).toBeGreaterThan(0);
      expect(within(gruppe).getAllByText(/Wann die Hilfe entfällt:/).length).toBeGreaterThan(0);
    }
    // Read-only: no take-over buttons and no boxes for what the group cannot do (that is step 3 of the planner).
    expect(within(block).queryAllByRole('button', { name: /übernehmen/ })).toEqual([]);
    expect(within(block).queryAllByRole('checkbox')).toEqual([]);
  });
});

describe('Systematik: Zuordnungsstufen und Eintragsart Hilfe (App-Nachzug N5)', () => {
  it('Stufe 4 nennt jede Passungsregel, Stufe 5 die Toleranz des Begleitziels', () => {
    const stufen = zuordnungsStufen(BUNDLE.regeln);
    const alle = stufen.map((s) => s.join(' ')).join(' ');
    for (const r of BUNDLE.regeln) expect(alle, r.id).toContain(r.name);
    const vier = stufen[3].join(' ');
    for (const id of ['wenig-anleitung-komplexer-inhalt', 'schrift-niedriges-sprachniveau', 'nachweis-passt-zum-ziel', 'sicherheitshinweis', 'lehrkraft-nicht-doppelt']) {
      const r = BUNDLE.regeln.find((x) => x.id === id)!;
      expect(vier, id).toContain(r.name);
    }
    expect(stufen[4].join(' ')).toMatch(/Begleitziel ordnet nur innerhalb der Toleranz/);

    render(
      <MemoryRouter>
        <SystematikPage />
      </MemoryRouter>
    );
    expect(screen.getByRole('heading', { name: 'Eintragsart Hilfe' })).toBeTruthy();
    const liste = screen.getByRole('list', { name: 'Hilfen im Katalog' });
    for (const h of BUNDLE.bausteine.filter((b) => b.eintragsart === 'hilfe')) expect(within(liste).getByText(h.name)).toBeTruthy();
    expect(document.body.textContent).toMatch(/keine Nachbedingung, erscheint in keinem Kettenschritt/);
  });
});

describe('API-Seite und Fußzeile (App-Nachzug N5)', () => {
  it('Feldtabellen vollständig, Hinweise des MCP-Servers wörtlich, SKOS-Zahl aus den Daten', () => {
    render(
      <MemoryRouter>
        <ApiMcpPage />
      </MemoryRouter>
    );
    const weitere = screen.getByRole('table', { name: 'Weitere Anfragefelder der FMT 2.0' });
    for (const f of ['zielart', 'komplexitaet', 'sprachniveau', 'lehrende', 'einheit', 'bewertet', 'raumBietet', 'fachausstattungArt'])
      expect(within(weitere).getByText(f, { selector: 'td > code' }), f).toBeTruthy();
    expect(weitere.textContent).toContain('handlung');
    const methodenfelder = screen.getByRole('table', { name: 'Neue Felder einer Methode' });
    for (const f of ['eintragsart', 'raumbedarf', 'schriftbedarf', 'termineMin', 'eignungsgrund', 'evidenz[].evidenzBezug'])
      expect(within(methodenfelder).getByText(f, { selector: 'td > code' }), f).toBeTruthy();
    expect(methodenfelder.textContent).toContain('programm');

    const hinweise = screen.getByLabelText('Hinweise des MCP-Servers');
    expect(hinweise.textContent).toBe(MCP_HINWEISE);
    expect(MCP_HINWEISE).toContain('Kann oder will der Nutzer nicht antworten');

    const body = document.body.textContent || '';
    // One SKOS file per scheme plus the chain vocabulary (build-artefacts).
    expect(body).toContain(`${BUNDLE.schemes.length + 1} SKOS-Vokabulare`);
    for (const alt of ['5-Stufen', '6 Skalen', '13-Regeln-Validator']) expect(body, alt).not.toContain(alt);
    for (const t of ['match_scenario', 'adapt_scenario', 'build_scenario_plan', 'list_vocabularies', 'search_methods', 'elaborate_scenario']) {
      const li = screen.getAllByText(t, { selector: 'li > code' })[0].closest('li') as HTMLElement;
      expect(li.textContent, t).toBeTruthy();
    }
    const li = (t: string) => screen.getAllByText(t, { selector: 'li > code' })[0].closest('li')!.textContent || '';
    expect(li('match_scenario')).toContain('pflichtangaben');
    expect(li('match_scenario')).toContain('regelmeldungen');
    expect(li('adapt_scenario')).toMatch(/passt, Hilfe oder Tausch/);
    expect(li('list_vocabularies')).toMatch(/Passungsregeln.*Raumtypen.*Zielarten/);
    expect(li('elaborate_scenario')).toMatch(/sieben Kernfeldern/);
    expect(li('search_methods')).toMatch(/eintragsart.*raum.*schriftbedarf/);
    const meta = screen.getByText('GET /api/v1/meta').closest('tr')!.textContent || '';
    for (const k of ['wfelder', 'arten', 'merkmale', 'regeln', 'raumtypen', 'zielarten', 'planungsprofile', 'ketten']) expect(meta, k).toContain(k);
    const methods = screen.getByText(/GET \/api\/v1\/methods\?/).closest('tr')!.textContent || '';
    for (const k of ['eintragsart', 'raum', 'raumbedarf', 'schriftbedarf', 'ohneSchrift', 'termine']) expect(methods, k).toContain(k);
  });

  it('die Fußzeile nennt die Version aus den Daten', () => {
    render(
      <MemoryRouter>
        <Layout>
          <div />
        </Layout>
      </MemoryRouter>
    );
    const fuss = document.querySelector('footer')!.textContent || '';
    expect(fuss).toContain(`Version ${BUNDLE.version}`);
    expect(fuss).not.toContain('1.0.0');
  });
});
