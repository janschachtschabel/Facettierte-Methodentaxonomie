// Scenario test runner (report docs/qualitaet/2026-11-27-szenariotest.md): every scenario of szenarien.mts through
// REST /plan, /match, /adapt and, where marked, the MCP tools. Writes rohergebnisse.json and digest.json.
// Usage (repository root, after npm run build:data): npx tsx scripts/szenariotest/run.mts <output folder>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { buildApp } from '../../apps/server/src/app.js';
import { SZ } from './szenarien.mts';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.resolve(process.argv[2] || 'szenariotest-ergebnis');
fs.mkdirSync(OUT, { recursive: true });
const app = await buildApp({ distDataDir: path.join(ROOT, 'dist-data'), config: { port: 0, host: '127.0.0.1', corsOrigin: '*', llmBaseUrl: '', llmModel: '', llmApiKey: '', llmAllowByok: true, llmRateLimitPerMin: 100000, llmTimeoutMs: 5000, llmCacheMax: 100, llmCacheTtlMs: 60000 } as any });
const base = await app.listen({ port: 0, host: '127.0.0.1' });
const client = new Client({ name: 'szenariotest', version: '1.0.0' });
await client.connect(new StreamableHTTPClientTransport(new URL('/mcp', base)));
const post = async (url: string, payload: unknown) => { const r = await app.inject({ method: 'POST', url, payload: payload as any }); let j: any; try { j = r.json(); } catch { j = r.body; } return { status: r.statusCode, json: j }; };
const call = async (name: string, args: any) => { const r: any = await client.callTool({ name, arguments: args }); const t = r.content?.[0]?.text; let j: any; try { j = JSON.parse(t); } catch { j = t; } return { isError: Boolean(r.isError), json: j }; };
const strip = (o: any, keys: string[]) => { const c = { ...o }; for (const k of keys) delete c[k]; return c; };
const raw: any = {};
for (const s of SZ) {
  const plan = await post('/api/v1/plan', { ...s.p, umfang: 'voll' });
  let matchPayload = strip(s.p, ['gruppen', 'umfang']);
  let match = await post('/api/v1/match', matchPayload);
  let matchNote = '';
  if (match.status === 400) { matchNote = 'erster Versuch 400: ' + JSON.stringify(match.json).slice(0, 300); matchPayload = strip(matchPayload, ['fach', 'lernziele', 'didaktischerAnsatz', 'einheit', 'bewertet']); match = await post('/api/v1/match', matchPayload); }
  const e: any = { id: s.id, kurz: s.kurz, anfrage: s.p, plan, match, matchNote };
  const arr = plan.json?.maschinenlesbar?.arrangement;
  if (s.p.gruppen && arr) {
    const a = { arrangement: arr, gruppen: s.p.gruppen, fach: s.p.fach, bildungsstufe: s.p.bildungsstufe, zeitMin: s.p.zeitMin, raum: s.p.raum, gruppe: s.p.gruppe };
    e.adapt = await post('/api/v1/adapt', a);
    if (s.mcp) e.mcpAdapt = await call('adapt_scenario', a);
  }
  if (s.mcp) {
    e.mcpPlan = await call('build_scenario_plan', { ...s.p, umfang: 'voll' });
    if (!s.p.gruppen && arr) {
      const a = { arrangement: arr, lerngruppenText: `${s.p.gruppe ?? 24} Lernende: 4 DaZ, 3 sehr leistungsstark`, bildungsstufe: s.p.bildungsstufe };
      e.adapt = await post('/api/v1/adapt', a); e.mcpAdapt = await call('adapt_scenario', a);
    }
  }
  raw[s.id] = e;
}
fs.writeFileSync(OUT + '/rohergebnisse.json', JSON.stringify(raw, null, 1));
// digest
const dig: any[] = [];
const noTime = (o: any): any => JSON.parse(JSON.stringify(o, (k, v) => (k === 'dauerMs' ? undefined : v)));
const diffKeys = (a: any, b: any) => { if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return ['(kein Objekt)']; const ks = new Set([...Object.keys(a), ...Object.keys(b)]); return [...ks].filter((k) => JSON.stringify(noTime(a[k])) !== JSON.stringify(noTime(b[k]))); };
for (const s of SZ) {
  const e = raw[s.id]; const p = e.plan.json; const m = e.match.json;
  const d: any = { id: s.id, kurz: s.kurz, planStatus: e.plan.status, matchStatus: e.match.status, matchNote: e.matchNote || undefined };
  if (e.plan.status !== 200) { d.fehler = p; dig.push(d); continue; }
  d.modus = p.erkannteKriterien?.modus ?? p.modus; d.fach = p.fach; d.thema = p.thema; d.fachbereich = p.fachErkannt?.fachbereich;
  d.kriterien = p.erkannteKriterien; d.kette = m?.kette?.label ?? null; d.ketteId = m?.kette?.id; d.angenommenerZieltyp = p.angenommenerZieltyp;
  d.profil = p.planungsprofil?.id + (p.planungsprofil?.angenommen ? ' (angenommen)' : '');
  const tab = p.thematischeTabelle || [];
  d.phasen = tab.map((r: any, i: number) => { const md = (p.methodenDetails || [])[i] || {}; return `${r.durationMin}′ | ${r.phaseLabel} | ${r.methodName} [${r.methodId}] | raum:${(md.raumbedarf || []).join(',')} schrift:${(md.schriftbedarf || []).join(',')}`; });
  d.summe = tab.reduce((a: number, r: any) => a + (r.durationMin || 0), 0); d.zeitAnfrage = p.erkannteKriterien?.zeitMin ?? null; d.pruefDauer = p.pruefung?.dauerMin; d.gueltig = p.pruefung?.gueltig; d.pruefMeldungen = p.pruefung?.meldungen;
  d.zieleMatch = (m?.schritte || []).map((x: any) => `${x.label} → ${x.ziel} (${x.name})`);
  d.matchGleich = JSON.stringify((m?.schritte || []).map((x: any) => x.baustein)) === JSON.stringify(tab.map((r: any) => r.methodId));
  d.annahmen = p.annahmen; d.hinweise = p.hinweise; d.pflicht = p.pflichtangaben; d.regeln = (p.regelmeldungen || []).map((r: any) => `${r.regel}/${r.wirkung}/${r.grundlage}: ${r.text}`);
  d.nachweis = p.nachweis; d.begleitstrang = p.begleitstrang; d.weitereKetten = (m?.weitereKetten || []).map((k: any) => k.label || k.id || k);
  d.teilgruppenMethoden = (p.teilgruppenMethoden || []).map((t: any) => JSON.stringify(t).slice(0, 600));
  d.zusatzphasen = (p.zusatzphasen || []).map((z: any) => `${z.position} ${z.dauerMin}′ ${z.name} – ${z.grund}`);
  d.lerngruppen = (p.lerngruppenUndMatrix || []).map((g: any) => `${g.id}/${g.label}: ${(g.matrixTop || []).slice(0, 3).join('; ')}`);
  d.erkannteMatrixSignale = p.erkannteMatrixSignale;
  d.ziele = p.entwurf?.kernfelder?.find((k: any) => k.id === 'ziele')?.inhalt; d.rahmen = p.entwurf?.kernfelder?.find((k: any) => k.id === 'rahmendaten')?.inhalt;
  d.sicherung = p.entwurf?.kernfelder?.filter((k: any) => !['ziele', 'rahmendaten', 'verlauf'].includes(k.id)).map((k: any) => `## ${k.titel}: ${k.inhalt}`);
  const txt = JSON.stringify({ t: p.thematischeTabelle, e: p.entwurf, h: p.hinweise, a: p.annahmen, r: p.regelmeldungen, pf: p.pflichtangaben, n: p.nachweis, z: p.zusatzphasen, tg: p.teilgruppenMethoden });
  d.schmutz = [...new Set((txt.match(/undefined|\bnull\b|NaN|\[object Object\]|„“|: ?""|\(\)/g) || []))];
  if (e.adapt) { const a = e.adapt.json; d.adaptStatus = e.adapt.status; d.adapt = { gesperrt: a.gesperrt, phasen: (a.phasenAnpassungen || []).map((ph: any) => ({ phase: ph.phaseLabel, methode: ph.methodName || ph.baustein, impulse: (ph.teilgruppenImpulse || []).map((i: any) => `${i.groupId}: ${i.antwort}${i.beleg?.grund ? ' – ' + i.beleg.grund : ''}${i.tausch ? ' → ' + JSON.stringify(i.tausch).slice(0, 200) : ''}${i.hilfen ? ' H:' + JSON.stringify(i.hilfen).slice(0, 200) : ''}`) })) }; }
  if (e.mcpPlan) { d.mcpPlanFehler = e.mcpPlan.isError; d.mcpPlanAbweichungen = diffKeys(p, e.mcpPlan.json); }
  if (e.mcpAdapt) { d.mcpAdaptFehler = e.mcpAdapt.isError; d.mcpAdaptAbweichungen = diffKeys(e.adapt.json, e.mcpAdapt.json); }
  dig.push(d);
}
fs.writeFileSync(OUT + '/digest.json', JSON.stringify(dig, null, 1));
console.log('fertig', dig.length, dig.filter((d) => d.planStatus !== 200).map((d) => d.id + ':' + d.planStatus + JSON.stringify(d.fehler)));
await client.close(); await app.close();
