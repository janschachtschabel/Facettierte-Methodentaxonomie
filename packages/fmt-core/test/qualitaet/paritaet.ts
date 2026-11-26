/**
 * Parity check: the same request through the core matcher (Baukasten without AI), REST /api/v1/match,
 * MCP match_scenario, REST /api/v1/plan and MCP build_scenario_plan. Needs a running server (FMT_URL, default http://localhost:8080).
 * Usage: npx tsx packages/fmt-core/test/qualitaet/paritaet.ts > bericht.md
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../../src/load-data.js';
import { createMatcher, createValidator } from '../../src/index.js';
import type { MatchResult, ArrangementNode } from '../../src/types.js';
import { QUALITAETSFAELLE } from './faelle.js';
import { REIHE2 } from './faelle-reihe2.js';
import { REIHE3 } from './faelle-reihe3.js';

const URL_ = process.env.FMT_URL || 'http://localhost:8080';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const D = loadFmtData(path.join(ROOT, 'data'));
const M = createMatcher(D, createValidator(D));

const top = (a?: { ablauf: ArrangementNode }) => {
  if (!a) return [];
  const t = a.ablauf.typ === 'Sequenz' ? a.ablauf.teile : [a.ablauf];
  return t.filter((n) => n.typ === 'Einsatz').map((n) => `${(n as { baustein: string }).baustein}:${(n as { dauerMin?: number }).dauerMin}`);
};
const sig = (r: Partial<MatchResult> & { arrangement?: { ablauf: ArrangementNode } }) =>
  r.modus === 'ablauf'
    ? `${r.kette?.id} | ${top(r.arrangement).join(' > ')}`
    : `phase | ${((r as { vorschlaege?: { baustein: string }[] }).vorschlaege || []).slice(0, 5).map((v) => v.baustein).join(', ')}`;

async function rest(p: string, body: unknown) {
  const r = await fetch(URL_ + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, json: await r.json() };
}
async function mcp(name: string, args: unknown) {
  const r = await fetch(URL_ + '/mcp', {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })
  });
  const t = await r.text();
  const line = t.split('\n').find((l) => l.startsWith('data: '));
  const msg = JSON.parse(line ? line.slice(6) : t);
  const res = msg.result;
  return { isError: Boolean(res?.isError), json: res ? JSON.parse(res.content[0].text) : msg };
}
const planSig = (p: Record<string, unknown>) => {
  const e = p.ergebnis as MatchResult | undefined;
  if (e) return `${p.fehler ? 'FEHLER ' : ''}${sig(e)}`;
  const tab = (p.thematischeTabelle as { methode?: string; kennung?: string; dauerMin?: number; minuten?: number }[] | undefined) || [];
  return `${(p.kette as { id?: string })?.id ?? '?'} | ${tab.map((x) => `${x.kennung ?? x.methode}:${x.dauerMin ?? x.minuten}`).join(' > ')}`;
};

const reihe = process.argv.includes('reihe1') ? QUALITAETSFAELLE : process.argv.includes('reihe2') ? REIHE2 : process.argv.includes('reihe3') ? REIHE3 : [...QUALITAETSFAELLE, ...REIHE2, ...REIHE3];
const zeilen: string[] = [];
let abwMatch = 0, abwPlan = 0, planVsMatch = 0, fehlerPlan = 0;
for (const f of reihe) {
  const core = M.zuordnen({ text: f.text });
  const r1 = await rest('/api/v1/match', { text: f.text });
  const m1 = await mcp('match_scenario', { text: f.text, limit: 100 });
  const p1 = await rest('/api/v1/plan', { text: f.text, umfang: 'kompakt' });
  const p2 = await mcp('build_scenario_plan', { text: f.text });
  const sCore = sig(core), sRest = sig(r1.json), sMcp = sig(m1.json);
  const pa = p1.json as Record<string, unknown>, pb = p2.json as Record<string, unknown>;
  const sPlanRest = `${(pa.pruefung as { dauerMin?: number })?.dauerMin} min | ${JSON.stringify(pa.erkannteKriterien)}`;
  const sPlanMcp = `${(pb.pruefung as { dauerMin?: number })?.dauerMin} min | ${JSON.stringify(pb.erkannteKriterien)}`;
  const tabA = JSON.stringify(pa.thematischeTabelle), tabB = JSON.stringify(pb.thematischeTabelle);
  const matchGleich = sCore === sRest && sRest === sMcp;
  const planGleich = sPlanRest === sPlanMcp && tabA === tabB;
  if (!matchGleich) abwMatch++;
  if (!planGleich) abwPlan++;
  if (pa.fehler || p2.isError) fehlerPlan++;
  const planDauer = (pa.pruefung as { dauerMin?: number })?.dauerMin;
  const coreDauer = core.modus === 'ablauf' ? core.pruefung?.dauerMin : undefined;
  const pvm = core.modus !== 'ablauf' ? 'Plan erzwingt Ablauf' : planDauer !== coreDauer ? `Dauer ${coreDauer} vs. ${planDauer}` : '';
  if (pvm) planVsMatch++;
  zeilen.push(`| ${f.id} | ${matchGleich ? '=' : `≠ core: ${sCore}<br>REST: ${sRest}<br>MCP: ${sMcp}`} | ${planGleich ? '=' : `≠ REST: ${sPlanRest}<br>MCP: ${sPlanMcp}`} | ${pa.fehler || p2.isError ? 'Fehler: ' + (pa.fehler || 'MCP isError') : ''} ${pvm} |`);
}
console.log(`# Abgleich Baukasten (Regeln) – REST – MCP\n`);
console.log(`${reihe.length} Anfragen. Zuordnung (Kern = Baukasten ohne KI, REST /match, MCP match_scenario) abweichend: ${abwMatch}. Szenarioplan (REST /plan, MCP build_scenario_plan) abweichend: ${abwPlan}. Plan-Fehler: ${fehlerPlan}. Plan weicht von Zuordnung ab: ${planVsMatch}.\n`);
console.log('| Fall | Zuordnung Kern/REST/MCP | Plan REST/MCP | Plan gegenüber Zuordnung |\n|---|---|---|---|');
console.log(zeilen.join('\n'));
