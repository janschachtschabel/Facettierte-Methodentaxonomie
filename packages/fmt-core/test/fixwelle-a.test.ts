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
});
