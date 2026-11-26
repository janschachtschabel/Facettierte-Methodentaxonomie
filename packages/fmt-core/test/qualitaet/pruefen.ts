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

export function einsaetze(node: ArrangementNode | undefined, out: EinsatzNode[] = []): EinsatzNode[] {
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

/** All methods a result uses: the whole sequence, or the proposals of a single phase. */
export function alleBausteine(r: MatchResult): string[] {
  if (r.modus === 'phase') return r.vorschlaege.map((v) => v.baustein);
  return einsaetze(r.arrangement?.ablauf).map((n) => n.baustein);
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
    const gestaltung = /\b(?:\w*tanz\w*|choreo\w*|gymnastik\w*|akrobati\w*|kür|jonglier\w*)/i.test(fall.text) && !/distanz|substanz|instanz/i.test(fall.text);
    if (area) {
      const fremd = alle.filter((n) => {
        const fb = byId.get(n.baustein)!.fachbereich || [];
        // Dance and movement design in sport may use methods of the arts.
        if (area === 'sport' && gestaltung && fb.includes('aesthetik')) return false;
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

    const kette4 = D.ketten.find((x) => x.id === r.kette?.id);
    const nichtImPlan = (felder: 'raumbedarf' | 'schriftbedarf', verboten: string[]) =>
      alle.filter((n) => (byId.get(n.baustein)![felder] || []).some((x) => verboten.includes(x))).map((n) => n.baustein);
    if (e.ohneRaumbedarf) {
      const drin = nichtImPlan('raumbedarf', e.ohneRaumbedarf);
      add('bedarf', drin.length === 0, `Methoden mit ausgeschlossenem Raumbedarf: ${drin.join(', ') || '–'}`);
    }
    if (e.ohneSchriftbedarf) {
      const drin = nichtImPlan('schriftbedarf', e.ohneSchriftbedarf);
      add('bedarf', drin.length === 0, `Methoden mit ausgeschlossenem Schriftbedarf: ${drin.join(', ') || '–'}`);
    }
    if (e.wissensartHaupt) {
      // Main and securing steps only; the opening and closing steps (rolle 'rand') are free.
      const tragend = haupt.filter((n) => {
        const rolle = kette4?.schritte.find((st) => st.id === n.kettenschritt)?.rolle;
        return rolle === 'haupt' || rolle === 'sicherung';
      });
      const falsch = tragend.filter((n) => !(byId.get(n.baustein)!.aufgabe || []).some((a) => e.wissensartHaupt!.includes(a)));
      add('bindung', tragend.length > 0 && falsch.length === 0, `Haupt- und Sicherungsschritte ohne ${e.wissensartHaupt.join('/')}: ${falsch.map((n) => n.baustein).join(', ') || '–'}`);
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

  // Checks on answer fields that later packages add; while a field is missing the check counts as failed.
  const antwort = r as unknown as Record<string, unknown>;
  const text = (x: unknown) => JSON.stringify(x ?? null);
  const fehlt = (feld: string) => antwort[feld] === undefined;
  if (e.pflichtFehlt || e.angenommen) {
    const p = antwort.pflichtangaben as { fehlt?: string[]; angenommen?: string[] | Record<string, unknown> } | undefined;
    const fehltListe = p?.fehlt || [];
    const angListe = Array.isArray(p?.angenommen) ? (p!.angenommen as string[]) : Object.keys(p?.angenommen || {});
    const luecken = [
      ...(e.pflichtFehlt || []).filter((x) => !fehltListe.includes(x)).map((x) => `${x} nicht als fehlend gemeldet`),
      ...(e.angenommen || []).filter((x) => !angListe.includes(x)).map((x) => `${x} nicht als angenommen ausgewiesen`)
    ];
    add('pflichtangaben', p !== undefined && luecken.length === 0, p === undefined ? 'Antwortfeld pflichtangaben fehlt' : luecken.join('; '));
  }
  if (e.regeln) {
    const meldungen = text(antwort.regelmeldungen);
    const fehlend = e.regeln.filter((id) => !meldungen.includes(`"${id}"`));
    add('regel', !fehlt('regelmeldungen') && fehlend.length === 0, fehlt('regelmeldungen') ? 'Antwortfeld regelmeldungen fehlt' : `Regel nicht gemeldet: ${fehlend.join(', ')}`);
  }
  if (e.nachweisform) {
    const form = text(antwort.nachweis);
    add('nachweis', !fehlt('nachweis') && form.includes(`"${e.nachweisform}"`), fehlt('nachweis') ? 'Antwortfeld nachweis fehlt' : `erwartet ${e.nachweisform}, erhalten ${form}`);
  }
  if (e.planungsprofil) {
    const profil = text(antwort.planungsprofil);
    add('profil', !fehlt('planungsprofil') && profil.includes(`"${e.planungsprofil}"`), fehlt('planungsprofil') ? 'Antwortfeld planungsprofil fehlt' : `erwartet ${e.planungsprofil}, erhalten ${profil}`);
  }
  if (e.begleitstrang) {
    const strang = text(antwort.begleitstrang);
    add('begleitziel', !fehlt('begleitstrang') && strang.includes(`"${e.begleitstrang}"`), fehlt('begleitstrang') ? 'Antwortfeld begleitstrang fehlt' : `erwartet ${e.begleitstrang}, erhalten ${strang}`);
  }
  // Subgroup checks will run through adaptScenario once Package C defines the subgroup input; stub until then.
  if (e.teilgruppe) add('teilgruppe', false, 'noch nicht umgesetzt (Paket C)');

  return { fall, ergebnis: r, ablauf, befunde };
}

/** Share of distinct sequences among a set of plans, and share of the most frequent one. */
export function variabilitaet(ablaeufe: string[][]) {
  const counts = new Map<string, number>();
  ablaeufe.forEach((a) => counts.set(a.join(' > '), (counts.get(a.join(' > ')) || 0) + 1));
  return { verschieden: counts.size, haeufigsterAnteil: Math.max(0, ...counts.values()) / Math.max(1, ablaeufe.length) };
}
