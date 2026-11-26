import type { Baustein, FmtData, MatchResult, ArrangementNode, EinsatzNode } from '../../src/types.js';
import type { FmtMatcher } from '../../src/zuordnung.js';
import type { Pruefung, Qualitaetsfall } from './faelle.js';

export interface Befund {
  pruefung: Pruefung;
  ok: boolean;
  detail: string;
  /** Known data gap: reported, not failing. */
  bekannt?: string;
}

export interface Fallergebnis {
  fall: Qualitaetsfall;
  ergebnis: MatchResult;
  ablauf: string[];
  befunde: Befund[];
}

/** Method suits a gym, a workshop or a practice room: movement, hands-on work or a practice subject. */
export const istPraxismethode = (b: Baustein) =>
  (b.aufgabe || []).includes('psychomotorik') ||
  (b.repraesentation || []).includes('enaktiv') ||
  (b.fachbereich || []).some((f) => f === 'sport' || f === 'beruf-praxis');

/** Method whose main purpose is to check what learners can do (not a reflection that also shows the learning state). */
export const istPruefmethode = (b: Baustein) =>
  b.lernfunktion[0] === 'diagnose' && (b.nachbedingung || []).includes('lernstand-diagnostiziert');

function einsaetze(node: ArrangementNode | undefined, out: EinsatzNode[] = []): EinsatzNode[] {
  if (!node) return out;
  if (node.typ === 'Einsatz') {
    out.push(node);
    (node.belegung || []).forEach((x) => einsaetze(x.inhalt, out));
  } else if (node.typ === 'Sequenz' || node.typ === 'Parallel') {
    (node.teile || []).forEach((t) => einsaetze(t, out));
  } else if (node.typ === 'Alternative') {
    (node.optionen || []).forEach((t) => einsaetze(t, out));
  }
  return out;
}

export function pruefeFall(fall: Qualitaetsfall, M: FmtMatcher, D: FmtData): Fallergebnis {
  const byId = new Map(D.bausteine.map((b) => [b.kennung, b]));
  const r = M.zuordnen({ text: fall.text });
  const k = r.kriterien as Record<string, unknown>;
  const e = fall.erwartet;
  const befunde: Befund[] = [];
  const add = (pruefung: Pruefung, ok: boolean, detail: string, bekanntGilt = true) =>
    befunde.push({ pruefung, ok, detail, ...(bekanntGilt && fall.bekannt?.[pruefung] ? { bekannt: fall.bekannt[pruefung] } : {}) });

  const modus = e.modus || 'ablauf';
  add('modus', r.modus === modus, `erwartet ${modus}, erhalten ${r.modus}`);

  const ablauf: string[] = [];
  if (r.modus === 'ablauf' && r.arrangement) {
    const top = r.arrangement.ablauf.typ === 'Sequenz' ? r.arrangement.ablauf.teile : [r.arrangement.ablauf];
    const haupt = top.filter((n): n is EinsatzNode => n.typ === 'Einsatz');
    haupt.forEach((n) => ablauf.push(n.baustein));
    const alle = einsaetze(r.arrangement.ablauf);

    add('gueltig', Boolean(r.pruefung?.gueltig) && (r.offen || []).length === 0, JSON.stringify(r.pruefung?.meldungen || r.offen));
    if (e.kette) add('kette', r.kette?.id === e.kette, `erwartet ${e.kette}, erhalten ${r.kette?.id}`);

    const budget = typeof k.zeitMin === 'number' ? k.zeitMin : null;
    if (budget != null) {
      const dauer = r.pruefung?.dauerMin ?? 0;
      add('zeit', dauer <= budget && dauer >= budget * 0.9, `${dauer} von ${budget} min`);
    }
    const ausserhalb = alle.filter((n) => {
      const b = byId.get(n.baustein)!;
      return (n.dauerMin ?? 0) < b.dauerMin || (n.dauerMin ?? 0) > b.dauerMax;
    });
    add('methodendauer', ausserhalb.length === 0, ausserhalb.map((n) => `${n.baustein} ${n.dauerMin} min`).join(', '));

    const area = typeof k.fachbereich === 'string' ? k.fachbereich : '';
    if (area) {
      const fremd = alle.filter((n) => {
        const fb = byId.get(n.baustein)!.fachbereich || [];
        return fb.length > 0 && !fb.includes(area) && !fb.includes('uebergreifend');
      });
      add('fachpassung', fremd.length === 0, fremd.map((n) => n.baustein).join(', '));
    }

    if (e.praxis) {
      // Main phases carry the lesson; a short reflection or a check may stay seated.
      const hauptphasen = haupt.filter((n) => {
        const st = (r.kette && D.ketten.find((x) => x.id === r.kette!.id)?.schritte.find((s) => s.id === n.kettenschritt)) || null;
        return st ? st.rolle === 'haupt' : false;
      });
      const stepOf = (n: EinsatzNode) => D.ketten.find((x) => x.id === r.kette?.id)?.schritte.find((s) => s.id === n.kettenschritt);
      const sitzend = hauptphasen.filter((n) => !istPraxismethode(byId.get(n.baustein)!));
      const anteil = haupt.filter((n) => istPraxismethode(byId.get(n.baustein)!)).length / Math.max(1, haupt.length);
      // The known gap covers the transfer phase only; a seated practice phase is always a finding.
      const nurTransfer = sitzend.every((n) => stepOf(n)?.ziel === 'transfer-gezeigt');
      add(
        'praxis',
        sitzend.length === 0 && anteil >= 0.5,
        `Hauptphasen ohne Praxis: ${sitzend.map((n) => n.baustein).join(', ') || '–'}; Praxisanteil ${Math.round(anteil * 100)} %`,
        nurTransfer
      );
    }

    if (e.leistungskontrolle) {
      // The check step: the chain's own check step or the added one (no chain step id); a later repetition does not count.
      const kette = D.ketten.find((x) => x.id === r.kette?.id);
      const istPruefschritt = (n: EinsatzNode) =>
        !n.kettenschritt || kette?.schritte.find((st) => st.id === n.kettenschritt)?.ziel === 'lernstand-diagnostiziert';
      // At the end, or at the start when the request puts the check first ("Vokabeltest und danach …").
      const rand = [...haupt.slice(0, 2), ...haupt.slice(-2)];
      const prueft = rand.some((n) => istPruefschritt(n) && istPruefmethode(byId.get(n.baustein)!));
      add('leistungskontrolle', prueft, `erste und letzte Phasen: ${rand.map((n) => n.baustein).join(', ')}`);
    }
    if (e.enthaelt) add('enthaelt', alle.some((n) => n.baustein === e.enthaelt), `${e.enthaelt} fehlt`);
    if (e.nicht) {
      const drin = alle.filter((n) => e.nicht!.includes(n.baustein)).map((n) => n.baustein);
      add('nicht', drin.length === 0, drin.join(', '));
    }
    if (e.ohneInteraktion) {
      const nur = alle.filter((n) => {
        const ia = byId.get(n.baustein)!.interaktion || [];
        return ia.length > 0 && ia.every((x) => e.ohneInteraktion!.includes(x));
      });
      add('verneinung', nur.length === 0, `Methoden nur mit ausgeschlossener Sozialform: ${nur.map((n) => n.baustein).join(', ')}`);
    }
  } else if (r.modus === 'phase') {
    add('gueltig', (r.vorschlaege || []).length > 0, `${(r.vorschlaege || []).length} Vorschläge`);
    if (e.praxis) {
      const top = (r.vorschlaege || []).slice(0, 3);
      add('praxis', top.every((v) => istPraxismethode(byId.get(v.baustein)!)), `erste Vorschläge: ${top.map((v) => v.baustein).join(', ')}`);
    }
    if (e.leistungskontrolle) {
      const top = (r.vorschlaege || []).slice(0, 5);
      add('leistungskontrolle', top.some((v) => istPruefmethode(byId.get(v.baustein)!)), top.map((v) => v.baustein).join(', '));
    }
  }

  if (e.ohneAnsatz) {
    const ansatz = (k.ansatz as string[] | undefined) || [];
    const drin = e.ohneAnsatz.filter((x) => ansatz.includes(x));
    add('verneinung', drin.length === 0, `gelesener Ansatz trotz Verneinung: ${drin.join(', ')}`);
  }
  const kriterienFehler: string[] = [];
  for (const [feld, wert] of Object.entries(e.kriterien || {})) {
    if (JSON.stringify(k[feld]) !== JSON.stringify(wert)) kriterienFehler.push(`${feld}=${JSON.stringify(k[feld])} statt ${JSON.stringify(wert)}`);
  }
  for (const [feld, wert] of Object.entries(e.nichtKriterien || {})) {
    if (JSON.stringify(k[feld]) === JSON.stringify(wert)) kriterienFehler.push(`${feld}=${JSON.stringify(wert)} fälschlich gelesen`);
  }
  if (e.kriterien || e.nichtKriterien) add('kriterien', kriterienFehler.length === 0, kriterienFehler.join('; '));

  return { fall, ergebnis: r, ablauf, befunde };
}

/** Share of distinct sequences among a set of plans, and share of the most frequent one. */
export function variabilitaet(ablaeufe: string[][]) {
  const counts = new Map<string, number>();
  ablaeufe.forEach((a) => counts.set(a.join(' > '), (counts.get(a.join(' > ')) || 0) + 1));
  return { verschieden: counts.size, haeufigsterAnteil: Math.max(0, ...counts.values()) / Math.max(1, ablaeufe.length) };
}
