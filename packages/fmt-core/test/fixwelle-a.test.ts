import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createMatcher, createValidator } from '../src/index.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));

describe('Fix wave Paket A', () => {
  it('1: "Klassenraum" als Listeneintrag nennt den Raum, kein angenommener Raum', () => {
    const r = M.zuordnen({ text: 'Sport Klasse 8, Ausdauer, Klassenraum, 45 Minuten' });
    expect(r.kriterien.raum).toBe('klassenraum');
    expect((r.pflichtangaben?.angenommen || []).some((x) => x.feld === 'raum')).toBe(false);
    expect(r.pflichtangaben?.fehlt).not.toContain('raum');
  });

  it('2: Sport im Hörsaal oder per Videokonferenz nimmt keine Bewegung an', () => {
    const hoersaal = M.zuordnen({ text: 'Sport Klasse 11: Doping, 90 Minuten', raum: 'hoersaal' });
    expect(hoersaal.modus === 'ablauf' && hoersaal.kette?.id).not.toBe('fertigkeit-bewegung');
    expect((hoersaal.pflichtangaben?.angenommen || []).some((x) => x.wert === 'bewegung')).toBe(false);
    const video = M.zuordnen({ text: 'Sport Klasse 11 per Videokonferenz: Trainingslehre, 45 Minuten' });
    expect(video.kriterien.raum).toBe('digital');
    expect(video.modus === 'ablauf' && video.kette?.id).not.toBe('fertigkeit-bewegung');
    // Without a room, or in a room with space to move, sport still assumes movement.
    const ohne = M.zuordnen({ text: 'Sport Klasse 7: Handball, 45 Minuten' });
    expect(ohne.modus === 'ablauf' && ohne.kette?.id).toBe('fertigkeit-bewegung');
    const draussen = M.zuordnen({ text: 'Sport Klasse 7: Handball, 45 Minuten', raum: 'draussen' });
    expect(draussen.modus === 'ablauf' && draussen.kette?.id).toBe('fertigkeit-bewegung');
    const flaeche = M.zuordnen({ text: 'Sport Klasse 7: Handball, 45 Minuten', raumBietet: ['bewegungsflaeche', 'stellflaeche'] });
    expect(flaeche.modus === 'ablauf' && flaeche.kette?.id).toBe('fertigkeit-bewegung');
  });

  it('3: Passungswarnungen gewählter Methoden erscheinen im Ablauf als Hinweis', () => {
    const r = M.zuordnen({ text: 'Sport Klasse 8, Ausdauer, Klassenraum, 90 Minuten, mit Makerspace' });
    expect(r.modus).toBe('ablauf');
    expect(JSON.stringify(r.modus === 'ablauf' && r.arrangement?.ablauf)).toContain('makerspace-tueftelwerkstatt');
    expect(r.hinweise || []).toContain('„Makerspace / Tüftelwerkstatt (FabLab)“: Im Fachbereich Sport nicht vorgesehen.');
  });

  it('6: der Satz zur praktischen Methode des Fachbereichs spricht ohne Fachjargon', () => {
    const r = M.zuordnen({ text: 'Biologie Klasse 6 Mikroskopieren lernen: Zwiebelhaut, 90 Minuten' });
    const satz = ((r.modus === 'ablauf' && r.annahmen) || []).find((x) => x.includes('praktische Methode des Fachbereichs'));
    expect(satz).toBeDefined();
    expect(satz).not.toMatch(/Wissensart|trägt/);
    expect(satz).toContain('„Demonstrationsexperiment“ ist eine praktische Methode des Fachbereichs');
  });

  it('10: eine Zielart ohne eigene Kette nennt sich im Grund, statt „keine Zielart angegeben“', () => {
    const r = M.zuordnen({ text: 'Deutsch Klasse 8: Lesestrategien, 45 Minuten', zielart: 'metakognitiv' });
    const z = (r.pflichtangaben?.angenommen || []).find((x) => x.feld === 'zielart');
    expect(z?.wert).toBe('konzepte');
    expect(z?.grund).not.toMatch(/Keine Zielart angegeben/);
    expect(z?.grund).toMatch(/hat keine eigene Kette: Konzepte angenommen\.$/);
    // Without a goal kind the old reason stays.
    const ohne = M.zuordnen({ text: 'Deutsch Klasse 8: Lesestrategien, 45 Minuten' });
    const o = (ohne.pflichtangaben?.angenommen || []).find((x) => x.feld === 'zielart');
    if (o) expect(o.grund).toBe('Keine Zielart angegeben: Konzepte angenommen.');
  });

  it('12: ist Sport aus der Zielart Kondition angenommen, nennt der Raumgrund die Kondition', () => {
    const r = M.zuordnen({ zielart: 'kondition', zeitMin: 45 });
    const fach = (r.pflichtangaben?.angenommen || []).find((x) => x.feld === 'fachbereich');
    expect(fach?.wert).toBe('sport');
    const raum = (r.pflichtangaben?.angenommen || []).find((x) => x.feld === 'raum');
    expect(raum?.wert).toBe('bewegungsraum');
    expect(raum?.grund).toBe('Raum nicht angegeben: Sporthalle angenommen, weil das Ziel Kondition ist.');
    // A stated subject sport keeps the subject as the reason.
    const sport = M.zuordnen({ text: 'Sport Klasse 7: Handball, 45 Minuten' });
    expect((sport.pflichtangaben?.angenommen || []).find((x) => x.feld === 'raum')?.grund).toBe(
      'Raum nicht angegeben: Sporthalle angenommen, weil das Fach Sport ist.'
    );
  });

  it('15: der Prüfschritt bekommt die Mindestzeit der Prüfmethode, die er dann auch wählt', () => {
    const faelle: Array<[string, string | undefined]> = [
      ['Sport Klasse 8, Ausdauer mit Leistungskontrolle, Sportplatz, 45 Minuten', undefined],
      ['Mathematik Klasse 8, lineare Funktionen, 45 Minuten, Lernzielkontrolle am Ende', 'muendlich'],
      ['Technik Klasse 9: Löten einer einfachen Schaltung im Werkraum, 90 Minuten, Lernzielkontrolle am Ende', 'praktisch']
    ];
    let geprueft = 0;
    for (const [text, nachweis] of faelle) {
      const r = M.zuordnen({ text, ...(nachweis ? { nachweis } : {}) });
      expect(r.modus, text).toBe('ablauf');
      if (r.modus !== 'ablauf' || !r.nachweis) continue;
      const kette = D.ketten.find((k) => k.id === r.kette?.id)!;
      const pruef = (r.schritte || []).find(
        (st) => st.schritt === 'leistungskontrolle' || kette.schritte.find((k) => k.id === st.schritt)?.ziel === 'lernstand-diagnostiziert'
      );
      if (!pruef) continue;
      const einsatz = (r.arrangement?.ablauf as { teile?: Array<{ typ: string; baustein?: string; dauerMin?: number }> }).teile?.find(
        (t) => t.typ === 'Einsatz' && t.baustein === pruef.baustein
      );
      expect(einsatz?.baustein, text).toBeDefined();
      const b = D.bausteine.find((x) => x.kennung === einsatz!.baustein)!;
      expect(einsatz!.dauerMin!, `${text}: ${b.kennung}`).toBeGreaterThanOrEqual(b.dauerMin);
      geprueft++;
    }
    expect(geprueft).toBeGreaterThan(0);
  });
});
