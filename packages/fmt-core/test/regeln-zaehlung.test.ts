import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Count every check of the rule machine (pruefe) the matcher makes.
const zaehler = { pruefe: 0 };
vi.mock('../src/regeln.js', async (original) => {
  const mod = await original<typeof import('../src/regeln.js')>();
  return {
    ...mod,
    erstelleRegeln: (...args: Parameters<typeof mod.erstelleRegeln>) => {
      const r = mod.erstelleRegeln(...args);
      return {
        ...r,
        pruefe: (...p: Parameters<typeof r.pruefe>) => {
          zaehler.pruefe++;
          return r.pruefe(...p);
        }
      };
    }
  };
});

const { loadFmtData } = await import('../src/load-data.js');
const { createMatcher, createValidator } = await import('../src/index.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

describe('Regelmeldungen der Lage (B3-Review b)', () => {
  it('prüft jede Methode für die Hinweise der Lage nur einmal, nicht einmal je Regel', () => {
    const D = loadFmtData(path.join(ROOT, 'data'));
    const M = createMatcher(D, createValidator(D));
    zaehler.pruefe = 0;
    const r = M.zuordnen({ modus: 'phase', lernfunktion: ['erwerb'], vorwissen: 'gering', bildungsstufe: 'sek1' });
    expect((r.regelmeldungen || []).some((m) => !m.baustein)).toBe(true);
    // The situation-level pass calls pruefe once per method (data.bausteine.length); with one run per rule it was
    // a multiple of that. The phase ranking itself calls the machine outside pruefe (warnungen) as well.
    expect(zaehler.pruefe).toBeLessThanOrEqual(D.bausteine.length);
  });
});
