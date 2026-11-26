/**
 * Writes an approved Einsatzprofil proposal (vorschlag-bedarf.json from vorschlag-einsatzprofil.ts) into
 * data/bausteine/: raumbedarf, schriftbedarf, raumhinweis, betreuungshinweis and the outside place as core
 * component; removes the old fields lernort and raum.
 *
 * Usage: npx tsx packages/fmt-core/scripts/uebernehme-einsatzprofil.ts <vorschlag-bedarf.json>
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BedarfVorschlag } from './vorschlag-einsatzprofil.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(__dirname, '..', '..', '..', 'data', 'bausteine');

/** Rebuilds the method with the new fields where the old ones stood (lernort → raumbedarf, raum → raumhinweis). */
export function uebernehme(b: Record<string, unknown>, v: BedarfVorschlag): Record<string, unknown> {
  const bedarf: Record<string, unknown> = {};
  if (v.raumbedarf.length) bedarf.raumbedarf = v.raumbedarf;
  if (v.schriftbedarf.length) bedarf.schriftbedarf = v.schriftbedarf;
  const hinweise: Record<string, unknown> = {};
  if (v.raumhinweis) hinweise.raumhinweis = v.raumhinweis;
  if (v.betreuungshinweis) hinweise.betreuungshinweis = v.betreuungshinweis;

  const out: Record<string, unknown> = {};
  let bedarfDone = false;
  let hinweiseDone = false;
  for (const [key, value] of Object.entries(b)) {
    if (key === 'lernort') {
      Object.assign(out, bedarf);
      bedarfDone = true;
      continue;
    }
    if (key === 'raum') {
      Object.assign(out, hinweise);
      hinweiseDone = true;
      continue;
    }
    out[key] = value;
    // Methods without a room text get the notes after their material.
    if (key === 'material' && !('raum' in b)) {
      Object.assign(out, hinweise);
      hinweiseDone = true;
    }
  }
  if (!bedarfDone) Object.assign(out, bedarf);
  if (!hinweiseDone) Object.assign(out, hinweise);

  const kern = (out.kernkomponente as Array<{ kennung: string; name: string }>) || [];
  if (v.kernkomponenteOrt && !kern.some((k) => k.kennung === 'ort')) {
    out.kernkomponente = [...kern, { kennung: 'ort', name: v.kernkomponenteOrt }];
  }
  return out;
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error('Pfad zur Vorschlagsdatei fehlt.');
  const vorschlag = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, BedarfVorschlag>;
  let n = 0;
  for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith('.json'))) {
    const p = path.join(DIR, f);
    const b = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<string, unknown>;
    const v = vorschlag[String(b.kennung)];
    if (!v) throw new Error(`Kein Vorschlag für ${String(b.kennung)}.`);
    fs.writeFileSync(p, JSON.stringify(uebernehme(b, v), null, 2) + '\n');
    n++;
  }
  console.log(`${n} Methoden übernommen.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
