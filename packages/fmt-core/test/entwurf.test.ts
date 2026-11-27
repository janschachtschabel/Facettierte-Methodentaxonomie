import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator } from '../src/index.js';
import { ENTWURF_LEITPLANKEN, baueEntwurf, entwurfMarkdown, istPruefschritt, profilBegriffe, type EntwurfEingabe } from '../src/entwurf.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));
const profil = (id: string) => D.planungsprofile.profile.find((p) => p.id === id)!;

const PHASEN: EntwurfEingabe['phasen'] = [
  { zeitMin: 10, phase: 'Einstieg', methode: 'Think-Pair-Share', sozialform: 'Partnerarbeit', medien: 'Tafel', lehrende: 'stellt die Leitfrage', lernende: 'notieren Ideen', schrittRolle: 'rand' },
  {
    zeitMin: 25,
    phase: 'Erarbeitung',
    methode: 'Gruppenpuzzle',
    sozialform: 'Gruppenarbeit',
    lehrende: 'begleitet',
    lernende: 'erarbeiten Texte',
    schrittRolle: 'haupt',
    anpassungen: [{ gruppe: 'Sprachförderung', text: 'Wortliste und Satzanfänge' }]
  },
  { zeitMin: 10, phase: 'Sicherung', methode: 'Abrufquiz', sozialform: 'Einzelarbeit', lehrende: 'wertet aus', lernende: 'beantworten Fragen', schrittRolle: 'rand', pruefschritt: true },
  { zeitMin: 5, phase: 'Abschluss', methode: 'Blitzlicht', sozialform: 'Plenum', lehrende: 'moderiert', lernende: 'geben Rückmeldung', schrittRolle: 'rand' }
];

const eingabe = (x: Partial<EntwurfEingabe> = {}): EntwurfEingabe => ({
  profil: profil('schule'),
  titel: 'Statistik',
  fach: 'Mathematik',
  dauerMin: 50,
  phasen: PHASEN,
  ...x
});

describe('Begriffe des Planungsprofils', () => {
  it('Tätigkeit der Lehrenden in der richtigen Form, nicht zusammengesetzt', () => {
    expect(profilBegriffe(profil('schule')).taetigkeitLehrende).toBe('Tätigkeit der Lehrkraft');
    expect(profilBegriffe(profil('erwachsenenbildung')).taetigkeitLehrende).toBe('Tätigkeit der Kursleitung');
    expect(profilBegriffe(profil('hochschule')).taetigkeitLehrende).toBe('Tätigkeit der Lehrenden');
    expect(profilBegriffe(profil('betrieb')).taetigkeitLehrende).toBe('Tätigkeit der Ausbilderin oder des Ausbilders');
  });
  it('Tätigkeit der Lernenden und Einheit', () => {
    expect(profilBegriffe(profil('schule')).taetigkeitLernende).toBe('Tätigkeit der Schülerinnen und Schüler');
    expect(profilBegriffe(profil('erwachsenenbildung')).taetigkeitLernende).toBe('Tätigkeit der Teilnehmenden');
    expect(profilBegriffe(profil('hochschule'))).toMatchObject({ einheit: 'Sitzung', groessereEinheit: 'Modul', lernende: 'Studierende' });
  });
  it('Akkusativ nach „für“ ist gespeichert, nicht umgebaut (Betrieb)', () => {
    expect(profilBegriffe(profil('schule')).fuerLehrende).toBe('für die Lehrkraft');
    expect(profilBegriffe(profil('betrieb')).fuerLehrende).toBe('für die Ausbilderin oder den Ausbilder');
    expect(profilBegriffe(profil('erwachsenenbildung')).fuerLehrende).toBe('für die Kursleitung');
  });
  it('jedes Profil hat alle Formen', () => {
    for (const p of D.planungsprofile.profile) {
      const b = profilBegriffe(p);
      for (const v of Object.values(b)) expect(String(v).length, p.id).toBeGreaterThan(2);
    }
  });
});

describe('Entwurf mit sieben Kernfeldern', () => {
  it('sieben Kernfelder in fester Reihenfolge, jedes mit Titel und Inhalt', () => {
    const e = baueEntwurf(D.planungsprofile, eingabe());
    expect(e.kernfelder.map((k) => k.id)).toEqual(['rahmendaten', 'lernvoraussetzungen', 'ziele', 'einordnung', 'verlauf', 'lernerfolg', 'reflexion']);
    e.kernfelder.forEach((k) => {
      expect(k.titel.length).toBeGreaterThan(3);
      expect(k.inhalt.length).toBeGreaterThan(3);
    });
  });
  it('Hochschule: Sitzung, Studierende, Modul; Module leer zum Ausfüllen', () => {
    const e = baueEntwurf(D.planungsprofile, eingabe({ profil: profil('hochschule'), bildungsstufe: 'Hochschule', anzahl: 25 }));
    const md = entwurfMarkdown(e);
    expect(md).toContain('Sitzung');
    expect(md).toContain('Studierende');
    expect(md).toContain('Modul');
    expect(e.spalten.lehrende).toBe('Tätigkeit der Lehrenden');
    expect(e.spalten.lernende).toBe('Tätigkeit der Studierenden');
    expect(e.module.map((m) => m.id)).toEqual(profil('hochschule').module.map((m) => m.id));
    e.module.forEach((m) => expect(m.inhalt).toBe(''));
    expect(md).not.toContain('Lehrkraft');
  });
  it('Erwachsenenbildung: Spalte „Tätigkeit der Kursleitung“', () => {
    const md = entwurfMarkdown(baueEntwurf(D.planungsprofile, eingabe({ profil: profil('erwachsenenbildung') })));
    expect(md).toContain('| Tätigkeit der Kursleitung |');
    expect(md).toContain('Teilnehmende');
  });
  it('ohne Bildungsstufe steht „Bildungsstufe nicht angegeben“ und nirgends „Sekundarstufe I“', () => {
    const e = baueEntwurf(D.planungsprofile, eingabe({ profilAngenommen: true }));
    const md = entwurfMarkdown(e);
    expect(md).toContain('Bildungsstufe nicht angegeben');
    expect(md).not.toContain('Sekundarstufe I');
    expect(e.planungsprofil).toMatchObject({ id: 'schule', angenommen: true });
  });
  it('Lernvoraussetzungen aus Vorwissen, Sprachniveau und Teilgruppen; Ziele aus Haupt- und Begleitzielen', () => {
    const e = baueEntwurf(
      D.planungsprofile,
      eingabe({ vorwissen: 'gering', sprachniveau: 'B1', teilgruppen: [{ name: 'Sprachförderung', anzahl: 4, beschreibung: 'Deutsch als Zweitsprache' }], hauptziel: 'Mittelwerte berechnen', begleitziele: ['Selbstregulation'] })
    );
    const f = Object.fromEntries(e.kernfelder.map((k) => [k.id, k.inhalt]));
    expect(f.lernvoraussetzungen).toMatch(/gering/);
    expect(f.lernvoraussetzungen).toMatch(/B1/);
    expect(f.lernvoraussetzungen).toMatch(/Sprachförderung \(4\)/);
    expect(f.ziele).toMatch(/Mittelwerte berechnen/);
    expect(f.ziele).toMatch(/Selbstregulation/);
  });
  it('Ziele nennen den vorgeschlagenen Begleitstrang des Plans (D3); ohne Begleitziel „keine“', () => {
    const e = baueEntwurf(
      D.planungsprofile,
      eingabe({ begleitziele: ['Soziales Lernen'], begleitstrang: [{ begleitziel: 'Soziales Lernen', methode: 'Blitzlicht-Runde', dauerMin: 3 }] })
    );
    const ziele = e.kernfelder.find((k) => k.id === 'ziele')!.inhalt;
    expect(ziele).toContain('- **Begleitziele:** Soziales Lernen');
    expect(ziele).toContain('Begleitstrang (Vorschlag): Blitzlicht-Runde, 3 min am Ende (Soziales Lernen)');
    expect(baueEntwurf(D.planungsprofile, eingabe()).kernfelder.find((k) => k.id === 'ziele')!.inhalt).toContain('- **Begleitziele:** keine');
  });
  it('Einordnung aus der Einheit, sonst ein Platz zum Ausfüllen mit dem Begriff des Profils', () => {
    const mit = baueEntwurf(D.planungsprofile, eingabe({ einheit: 'Unterrichtsreihe Daten' }));
    expect(mit.kernfelder[3].inhalt).toContain('Unterrichtsreihe Daten');
    const ohne = baueEntwurf(D.planungsprofile, eingabe({ profil: profil('hochschule') }));
    expect(ohne.kernfelder[3].titel).toBe('Einordnung in das Modul');
    expect(ohne.kernfelder[3].inhalt).toMatch(/Modul nicht angegeben/);
  });
  it('Verlaufsplan trägt die Anpassungen je Teilgruppe; Sicherung aus dem Prüfschritt, Reflexion aus dem Abschluss und den Hinweisen', () => {
    const e = baueEntwurf(D.planungsprofile, eingabe({ hinweise: ['Raum vorher lüften'], nachweis: 'schriftlich' }));
    const f = Object.fromEntries(e.kernfelder.map((k) => [k.id, k.inhalt]));
    expect(f.verlauf).toContain('| Zeit | Phase | Tätigkeit der Lehrkraft | Tätigkeit der Schülerinnen und Schüler | Methode und Sozialform | Medien |');
    expect(f.verlauf).toMatch(/Sprachförderung: Wortliste und Satzanfänge/);
    expect(f.lernerfolg).toMatch(/Abrufquiz/);
    expect(f.lernerfolg).toMatch(/schriftlich/);
    expect(f.lernerfolg).not.toMatch(/Blitzlicht/);
    expect(f.reflexion).toMatch(/Blitzlicht/);
    expect(f.reflexion).toMatch(/Raum vorher lüften/);
  });
  it('ohne Prüfschritt sagt die Sicherung das, statt etwas zu erfinden', () => {
    const e = baueEntwurf(D.planungsprofile, eingabe({ phasen: PHASEN.filter((p) => p.methode !== 'Abrufquiz') }));
    expect(e.kernfelder[5].inhalt).toMatch(/Kein eigener Prüfschritt/);
  });
  it('Sicherung nur aus dem Prüfschritt der Kette: keine Eingangsdiagnose, keine Wiederkehr; Abschluss nur aus dem letzten Schritt der Stunde (Fix-Welle D, Punkt 4)', () => {
    const phasen: EntwurfEingabe['phasen'] = [
      { zeitMin: 5, phase: 'K1 · Vorwissen und Fehlvorstellungen sichtbar machen', methode: 'Live-Abstimmung', schrittRolle: 'rand' },
      { zeitMin: 16, phase: 'K2 · Konzept', methode: 'Darstellungswechsel', schrittRolle: 'haupt' },
      { zeitMin: 7, phase: 'K3 · Konsolidieren', methode: 'Brain Dump', schrittRolle: 'sicherung' },
      { zeitMin: 12, phase: 'K4 · Transfer', methode: 'Blitz-Anwendung', schrittRolle: 'haupt' },
      { zeitMin: 5, phase: 'K5 · Reflexion', methode: 'Reflexionsprompt', schrittRolle: 'rand' },
      { zeitMin: 0, phase: 'Verteilte Wiederkehr in Folgestunden', methode: 'Brain Dump', wiederkehr: true }
    ];
    const f = Object.fromEntries(baueEntwurf(D.planungsprofile, eingabe({ phasen })).kernfelder.map((k) => [k.id, k.inhalt]));
    expect(f.lernerfolg).toBe('- **Sicherung:** K3 · Konsolidieren – Brain Dump (7 min)');
    expect(f.lernerfolg).not.toMatch(/Live-Abstimmung|Wiederkehr/);
    expect(f.reflexion).toMatch(/^- \*\*Abschluss:\*\* K5 · Reflexion – Reflexionsprompt \(5 min\)/);
    expect(f.reflexion).not.toMatch(/Wiederkehr/);
    // A check step wins over the fallback, wherever it stands (a requested test may open the lesson).
    const mitPruef = [{ zeitMin: 10, phase: 'Leistung oder Lernstand überprüfen', methode: 'Abrufquiz', schrittRolle: 'haupt', pruefschritt: true }, ...phasen];
    const g = Object.fromEntries(baueEntwurf(D.planungsprofile, eingabe({ phasen: mitPruef })).kernfelder.map((k) => [k.id, k.inhalt]));
    expect(g.lernerfolg).toBe('- **Prüfschritt:** Leistung oder Lernstand überprüfen – Abrufquiz (10 min)');
  });
  it('Prüfschritt ist der Kettenschritt mit Funktion diagnose oder die eingefügte Leistungskontrolle, nie der Einstieg', () => {
    const kette = (id: string) => D.ketten.find((k) => k.id === id)!;
    expect(istPruefschritt(kette('konzeptaufbau'), 'k1')).toBe(false);
    expect(istPruefschritt(kette('konzeptaufbau'), 'k3')).toBe(false);
    expect(istPruefschritt(kette('faktenwissen'), 'f4')).toBe(true);
    expect(istPruefschritt(kette('vollstaendige-handlung'), 'h4')).toBe(true);
    expect(istPruefschritt(kette('konzeptaufbau'), 'leistungskontrolle')).toBe(true);
    expect(istPruefschritt(undefined, undefined)).toBe(false);
  });
  it('ein Ablauf aus dem Kern: die Eingangsdiagnose ist kein Prüfschritt (Biologie, Fotosynthese)', () => {
    const r = M.zuordnen({ text: 'Biologie Klasse 7, Fotosynthese, 45 Minuten' });
    if (r.modus !== 'ablauf' || !r.arrangement) throw new Error('kein Ablauf');
    const kette = D.ketten.find((k) => k.id === r.arrangement!.zieltyp);
    const teile = (r.arrangement.ablauf as { teile: Array<{ typ: string; baustein: string; dauerMin?: number; kettenschritt?: string }> }).teile;
    const phasen: EntwurfEingabe['phasen'] = teile.map((t) => ({
      zeitMin: t.dauerMin || 0,
      phase: t.kettenschritt || 'Wiederkehr',
      methode: t.baustein,
      schrittRolle: kette?.schritte.find((s) => s.id === t.kettenschritt)?.rolle,
      pruefschritt: istPruefschritt(kette, t.kettenschritt),
      wiederkehr: t.typ === 'Wiederkehr'
    }));
    const f = Object.fromEntries(baueEntwurf(D.planungsprofile, eingabe({ phasen })).kernfelder.map((k) => [k.id, k.inhalt]));
    expect(f.lernerfolg).not.toMatch(new RegExp(teile[0].baustein));
    expect(f.lernerfolg.split('\n')).toHaveLength(1);
    expect(f.reflexion).toContain(teile.filter((t) => t.typ !== 'Wiederkehr').at(-1)!.baustein);
  });
  it('Zellen mit senkrechtem Strich oder Zeilenumbruch zerbrechen die Tabelle nicht', () => {
    const e = baueEntwurf(D.planungsprofile, eingabe({ phasen: [{ ...PHASEN[0], lehrende: 'a | b\nc' }] }));
    expect(e.kernfelder[4].inhalt).toContain('a \\| b c');
  });
});

describe('Leitplanken für ein Sprachmodell', () => {
  it('vier Sätze wörtlich', () => {
    expect(ENTWURF_LEITPLANKEN).toEqual([
      'Methoden, Reihenfolge und Kernkomponenten sind vorgegeben und werden nicht geändert.',
      'Aussagen zur Wirksamkeit stammen nur aus dem Katalog, mit Grad, Geltung und Bezug.',
      'Kennzeichne, was übernommen und was erzeugt ist.',
      'Beschreibe Gruppen, keine einzelnen Lernenden.'
    ]);
  });
});

describe('Antwort des Kerns nennt das Planungsprofil', () => {
  it('n15: hochschule, nicht angenommen', () => {
    const r = M.zuordnen({ text: 'Hochschule, Seminar Statistik, 90 Minuten, 25 Studierende, Prüfungsform Klausur' });
    expect(r.planungsprofil).toBe('hochschule');
    expect((r.pflichtangaben?.angenommen || []).some((x) => x.feld === 'planungsprofil')).toBe(false);
  });
  it('n16: erwachsenenbildung', () => {
    const r = M.zuordnen({ text: 'Volkshochschule, Kochkurs Grundtechniken, Lehrküche, 3 Stunden, 12 Teilnehmende' });
    expect(r.planungsprofil).toBe('erwachsenenbildung');
  });
  it('ohne Bildungsstufe: schule, unter pflichtangaben.angenommen genannt', () => {
    const r = M.zuordnen({ text: 'Fotosynthese, 45 Minuten' });
    expect(r.planungsprofil).toBe('schule');
    expect(r.pflichtangaben?.angenommen).toContainEqual({
      feld: 'planungsprofil',
      wert: 'schule',
      grund: 'Keine Bildungsstufe angegeben: Planungsprofil „Schule“ angenommen.'
    });
  });
  it('ein ausdrückliches planungsprofil gewinnt', () => {
    const r = M.zuordnen({ text: 'Fotosynthese, 45 Minuten', planungsprofil: 'erwachsenenbildung' });
    expect(r.planungsprofil).toBe('erwachsenenbildung');
    expect((r.pflichtangaben?.angenommen || []).some((x) => x.feld === 'planungsprofil')).toBe(false);
  });
});
