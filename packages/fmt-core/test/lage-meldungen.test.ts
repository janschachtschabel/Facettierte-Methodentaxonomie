import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createValidator } from '../src/validate.js';
import { createMatcher } from '../src/zuordnung.js';
import { regelmeldungenNeuPruefen, passungImArrangement, MELDUNG_LAGE_FELDER, REGEL_LAGE_FELDER } from '../src/regeln.js';
import { nachweisformen } from '../src/zielart.js';
import * as core from '../src/index.js';
import type { Baustein, MatchRequest, MatchResult, Regelmeldung } from '../src/types.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const matcher = createMatcher(D, createValidator(D));
const b = (k: string) => D.bausteine.find((x) => x.kennung === k)!;

/** Methods of an answer in the order the core collects them (whole flow, or the first six proposals). */
function methodenDer(r: MatchResult): Baustein[] {
  if (r.modus === 'phase') return r.vorschlaege.slice(0, 6).map((v) => b(v.baustein));
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    const n = node as Record<string, unknown>;
    if (typeof n.baustein === 'string' && !out.includes(n.baustein)) out.push(n.baustein);
    for (const key of ['teile', 'begleitend', 'optionen']) if (Array.isArray(n[key])) (n[key] as unknown[]).forEach(walk);
    if (Array.isArray(n.belegung)) n.belegung.forEach((x) => walk((x as { inhalt?: unknown }).inhalt));
    if (n.haupt) walk(n.haupt);
  };
  walk(r.arrangement?.ablauf);
  return out.map(b);
}
const raumDer = (r: MatchResult) =>
  (r.kriterien?.raum as string | undefined) || r.pflichtangaben?.angenommen.find((x) => x.feld === 'raum')?.wert as string | undefined;
const neu = (r: MatchResult, anfrage: Record<string, unknown>, extra: { nachweis?: string[]; methoden?: Baustein[] } = {}) =>
  regelmeldungenNeuPruefen(r.regelmeldungen || [], extra.methoden || methodenDer(r), anfrage, D, {
    raum: raumDer(r),
    modus: r.modus,
    ...(extra.nachweis ? { nachweis: extra.nachweis } : {})
  });
const ids = (ms: Regelmeldung[]) => ms.map((m) => m.regel);

const ANFRAGEN: MatchRequest[] = [
  { text: 'Mathematik Bruchrechnen Klasse 6, 90 Minuten, mit Lösungsbeispielen und Lehrervortrag', vorwissen: 'hoch' },
  { text: 'Biologie Klasse 9, Fotosynthese, 45 Minuten, 24 Lernende', bildungsstufe: 'primar', begleitziel: ['sozial'] },
  { text: 'Chemie Klasse 8, Säuren und Basen experimentell untersuchen, 90 Minuten', raum: 'fachraum', komplexitaet: 'hoch', vorwissen: 'gering' },
  { text: 'Sport Klasse 5, Ballspiele, 45 Minuten', begleitziel: ['selbstregulation', 'sprache'], termine: 1 },
  { text: 'Deutsch Klasse 7, Erörterung, 90 Minuten', nachweis: 'muendlich', sprachniveau: 'a2' },
  { text: 'Elektroniker Lernfeld 3, Fehlersuche an Schaltungen, 45 Minuten, am Ende praktische Prüfung' },
  { text: 'VHS Integrationskurs Deutsch A2: beim Arzt, 90 Minuten, 15 Teilnehmende' },
  { text: 'Einstieg in Physik Klasse 8, Hebelgesetz', modus: 'phase', vorwissen: 'gering' } as MatchRequest
];

describe('Regelmeldungen der Antwort für die aktuelle Anfrage neu prüfen (R02)', () => {
  it('wird aus @fmt/core exportiert, mit der Liste der gelesenen Felder', () => {
    expect(typeof core.regelmeldungenNeuPruefen).toBe('function');
    expect(core.MELDUNG_LAGE_FELDER).toBe(MELDUNG_LAGE_FELDER);
    expect(MELDUNG_LAGE_FELDER).toEqual([...REGEL_LAGE_FELDER, 'raum', 'begleitziel', 'termine']);
  });

  it('gleiche Methoden und gleiche Anfrage: genau die Meldungen der Antwort, in derselben Reihenfolge', () => {
    let mitLage = 0;
    for (const a of ANFRAGEN) {
      const r = matcher.zuordnen(a);
      const alt = r.regelmeldungen || [];
      if (alt.some((m) => !m.baustein || m.regel === 'begleitziel-braucht-termine' || m.regel === 'sicherheitshinweis')) mitLage++;
      expect(neu(r, r.kriterien as Record<string, unknown>, { nachweis: r.nachweis?.formen }), a.text).toEqual(alt);
    }
    expect(mitLage).toBeGreaterThanOrEqual(3);
  });

  it('geleerte Bildungsstufe: der Hinweis der Regel für die Grundschule und die Warnungen der Stufe verschwinden', () => {
    const r = matcher.zuordnen(ANFRAGEN[1]);
    expect(ids(r.regelmeldungen || [])).toContain('problemloesen-vor-instruktion-primar');
    const { bildungsstufe: _weg, ...rest } = r.kriterien as Record<string, unknown>;
    const jetzt = neu(r, rest);
    expect(ids(jetzt)).not.toContain('problemloesen-vor-instruktion-primar');
    expect(jetzt.some((m) => m.regel === 'eignung-stufe' || m.regel === 'evidenz-geltung')).toBe(false);
  });

  it('begleitziel-braucht-termine: verschwindet mit genug Terminen oder ohne Begleitziel', () => {
    const r = matcher.zuordnen(ANFRAGEN[1]);
    expect(ids(r.regelmeldungen || [])).toContain('begleitziel-braucht-termine');
    const k = r.kriterien as Record<string, unknown>;
    expect(ids(neu(r, { ...k, termine: 4 }))).not.toContain('begleitziel-braucht-termine');
    expect(ids(neu(r, { ...k, begleitziel: [] }))).not.toContain('begleitziel-braucht-termine');
    expect(ids(neu(r, { ...k, termine: 1 }))).toContain('begleitziel-braucht-termine');
  });

  it('Sicherheitshinweis: folgt Raum, Fachbereich und den praktischen Methoden im Ablauf', () => {
    const r = matcher.zuordnen(ANFRAGEN[2]);
    const sicher = (r.regelmeldungen || []).find((m) => m.regel === 'sicherheitshinweis');
    expect(sicher).toBeTruthy();
    const k = r.kriterien as Record<string, unknown>;
    // Hands-on methods taken out of the flow: no note.
    const ohnePraktisch = methodenDer(r).filter((m) => !sicher!.bausteine!.includes(m.kennung));
    expect(ids(neu(r, k, { methoden: ohnePraktisch }))).not.toContain('sicherheitshinweis');
    // A classroom in a subject area without practical work: no note.
    const imKlassenraum = regelmeldungenNeuPruefen(r.regelmeldungen || [], methodenDer(r), { ...k, raum: 'klassenraum', fachbereich: 'sprachen' }, D, {
      raum: 'klassenraum',
      modus: r.modus
    });
    expect(ids(imKlassenraum)).not.toContain('sicherheitshinweis');
  });

  it('Nachweis: ohne gewünschte Form oder mit einer passenden Form steht keine Meldung mehr', () => {
    const r = matcher.zuordnen(ANFRAGEN[5]);
    expect(ids(r.regelmeldungen || [])).toContain('nachweis-passt-zum-ziel');
    const k = r.kriterien as Record<string, unknown>;
    expect(ids(neu(r, k, { nachweis: [] }))).not.toContain('nachweis-passt-zum-ziel');
    expect(ids(neu(r, k, { nachweis: r.nachweis!.formen }))).toContain('nachweis-passt-zum-ziel');
    // Without the option the message stays as the answer gave it.
    expect(ids(neu(r, k))).toContain('nachweis-passt-zum-ziel');
    // A form the check method yields: no message.
    const pruefung = b((r.regelmeldungen || []).find((x) => x.regel === 'nachweis-passt-zum-ziel')!.baustein!);
    const passend = nachweisformen(pruefung);
    if (passend.length) expect(ids(neu(r, k, { nachweis: passend }))).not.toContain('nachweis-passt-zum-ziel');
  });

  it('passungImArrangement nennt auch die Meldungen der Lage (Grundschule, Begleitziel ohne Termine)', () => {
    const r = matcher.zuordnen(ANFRAGEN[1]);
    const arr = r.arrangement!;
    const lage = passungImArrangement(arr, { bildungsstufe: 'primar', begleitziel: ['sozial'] }, D);
    expect(ids(lage)).toContain('problemloesen-vor-instruktion-primar');
    expect(ids(lage)).toContain('begleitziel-braucht-termine');
    expect(ids(passungImArrangement(arr, { begleitziel: ['sozial'], termine: 3 }, D))).not.toContain('begleitziel-braucht-termine');
    expect(passungImArrangement(arr, {}, D)).toEqual([]);
  });
});
