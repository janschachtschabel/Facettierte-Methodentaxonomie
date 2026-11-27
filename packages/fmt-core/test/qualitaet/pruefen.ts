import type { Baustein, FmtData, MatchResult, ArrangementNode, EinsatzNode } from '../../src/types.js';
import type { FmtMatcher } from '../../src/zuordnung.js';
import { adaptScenario } from '../../src/adaptScenario.js';
import { extractSubjectAndTopic } from '../../src/thema.js';
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

/**
 * Practice method: carries the knowledge type psychomotorik or works enactively (FMT 2.0, Abbau Zeile 3). The subject
 * areas sport and beruf-praxis no longer count on their own.
 */
export const istPraxismethode = (b: Baustein) =>
  (b.aufgabe || []).includes('psychomotorik') || (b.repraesentation || []).includes('enaktiv');

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
  const r = M.zuordnen({ text: fall.text, ...fall.anfrage });
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
    if (e.ketteNicht) add('ketteNicht', r.kette?.id !== e.ketteNicht, `Kette ${r.kette?.id}`);
    if (e.schwach) {
      const gemeldet = new Set(((r as unknown as { schwachBesetzt?: Array<{ schritt: string }> }).schwachBesetzt || []).map((x) => x.schritt));
      const fehlend = e.schwach.filter((x) => !gemeldet.has(x));
      add('schwach', fehlend.length === 0, `nicht als schwach besetzt gemeldet: ${fehlend.join(', ')}`);
    }

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
  if (e.pflichtFehlt || e.angenommen || e.pflichtNichtFehlt || e.angenommenWert) {
    const p = antwort.pflichtangaben as
      | { fehlt?: string[]; angenommen?: Array<string | { feld: string; wert?: unknown }> | Record<string, unknown> }
      | undefined;
    const fehltListe = p?.fehlt || [];
    // The answer lists each assumption as { feld, wert, grund } (spec 5.4); a plain list of field names is read as well.
    const angListe = Array.isArray(p?.angenommen)
      ? p!.angenommen.map((x) => (typeof x === 'string' ? x : x.feld))
      : Object.keys(p?.angenommen || {});
    const luecken = [
      ...(e.pflichtFehlt || []).filter((x) => !fehltListe.includes(x)).map((x) => `${x} nicht als fehlend gemeldet`),
      ...(e.angenommen || []).filter((x) => !angListe.includes(x)).map((x) => `${x} nicht als angenommen ausgewiesen`),
      ...(e.pflichtNichtFehlt || []).filter((x) => fehltListe.includes(x)).map((x) => `${x} fälschlich als fehlend gemeldet`)
    ];
    const angWerte = Array.isArray(p?.angenommen) ? p!.angenommen.filter((x): x is { feld: string; wert?: unknown } => typeof x !== 'string') : [];
    for (const [feld, wert] of Object.entries(e.angenommenWert || {})) {
      const da = angWerte.filter((x) => x.feld === feld);
      if (!da.some((x) => JSON.stringify(x.wert) === JSON.stringify(wert)))
        luecken.push(`${feld}=${JSON.stringify(wert)} nicht als angenommen ausgewiesen (${da.map((x) => JSON.stringify(x.wert)).join(', ') || 'keine Annahme'})`);
    }
    add('pflichtangaben', p !== undefined && luecken.length === 0, p === undefined ? 'Antwortfeld pflichtangaben fehlt' : luecken.join('; '));
  }
  if (e.regeln) {
    const gemeldet = new Set(((antwort.regelmeldungen as Array<{ regel: string }> | undefined) || []).map((m) => m.regel));
    const fehlend = e.regeln.filter((id) => !gemeldet.has(id));
    add('regel', !fehlt('regelmeldungen') && fehlend.length === 0, fehlt('regelmeldungen') ? 'Antwortfeld regelmeldungen fehlt' : `Regel nicht gemeldet: ${fehlend.join(', ')}`);
  }
  if (e.regelnNicht) {
    const gemeldet = ((antwort.regelmeldungen as Array<{ regel: string }> | undefined) || []).map((m) => m.regel);
    const drin = e.regelnNicht.filter((id) => gemeldet.includes(id));
    add('regelNicht', drin.length === 0, `Regel gemeldet: ${drin.join(', ')}`);
  }
  if (e.hinweis || e.hinweisNicht) {
    const hinweise = r.hinweise || [];
    const trifft = (m: string | RegExp, h: string) => (typeof m === 'string' ? h.includes(m) : m.test(h));
    const fehler: string[] = [];
    for (const m of e.hinweis || []) {
      const { muster, anzahl, erster } = typeof m === 'object' && !(m instanceof RegExp) ? m : { muster: m as string | RegExp, anzahl: undefined, erster: undefined };
      const n = hinweise.filter((h) => trifft(muster, h)).length;
      if (erster ? !hinweise.length || !trifft(muster, hinweise[0]) : anzahl != null ? n !== anzahl : n === 0)
        fehler.push(`${erster ? 'erster Hinweis' : anzahl != null ? `${anzahl}× Hinweis` : 'Hinweis'} ${String(muster)} fehlt (${n}×)`);
    }
    for (const m of e.hinweisNicht || []) if (hinweise.some((h) => trifft(m, h))) fehler.push(`Hinweis ${String(m)} vorhanden`);
    add('hinweis', fehler.length === 0, fehler.join('; ') || `${hinweise.length} Hinweise`);
  }
  if (e.thema || e.themaNicht) {
    const thema = extractSubjectAndTopic(fall.text).thema || '';
    const fehler: string[] = [];
    if (e.thema && !(typeof e.thema === 'string' ? thema.includes(e.thema) : e.thema.test(thema))) fehler.push(`erwartet ${String(e.thema)}`);
    for (const w of e.themaNicht || []) if (thema.includes(w)) fehler.push(`enthält „${w}“`);
    add('thema', fehler.length === 0, `${fehler.join('; ')}${fehler.length ? ', ' : ''}gelesen „${thema}“`);
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
  // Subgroups (Package C): adaptScenario on the plan with the groups the text names after "Teilgruppe:". The answer of a
  // group is the strongest over its phases (tausch > hilfe > passt); every group other than the main group counts.
  if (e.teilgruppe) {
    const soll = e.teilgruppe;
    if (r.modus !== 'ablauf' || !r.arrangement) {
      add('teilgruppe', false, `kein Ablauf (modus ${r.modus})`);
    } else {
      const gruppenText = /teilgruppe\s*:\s*(.+)$/i.exec(fall.text)?.[1] ?? fall.text;
      const res = adaptScenario(D, { arrangement: r.arrangement, lerngruppenText: gruppenText });
      const rang = { passt: 0, hilfe: 1, tausch: 2 } as const;
      const gruppen = res.teilgruppen.filter((g) => g.id !== 'regel');
      const impulse = (id: string) => res.phasenAnpassungen.flatMap((ph) => ph.teilgruppenImpulse.filter((t) => t.groupId === id));
      const antworten = gruppen.map((g) => {
        const liste = impulse(g.id);
        const staerkste = liste.reduce<'passt' | 'hilfe' | 'tausch'>((a, t) => (rang[t.antwort] > rang[a] ? t.antwort : a), 'passt');
        return { g, liste, staerkste };
      });
      const fehler: string[] = [];
      if (!antworten.length) fehler.push(`keine Teilgruppe erkannt in „${gruppenText}“`);
      for (const a of antworten) {
        if (a.staerkste !== soll.antwort) fehler.push(`${a.g.label}: erwartet ${soll.antwort}, erhalten ${a.staerkste}`);
        if (soll.abbau) {
          const hilfen = a.liste.filter((t) => t.antwort === 'hilfe');
          const ohne = hilfen.filter((t) => !t.hilfen.length || t.hilfen.some((h) => !h.abbau));
          if (!hilfen.length || ohne.length) fehler.push(`${a.g.label}: Hilfe ohne Abbau-Satz`);
        }
      }
      if (soll.gesperrt && !res.gesperrt.length) fehler.push('gesperrtes Merkmal nicht gemeldet');
      if (soll.gesperrt === false && res.gesperrt.length) fehler.push('gesperrtes Merkmal gemeldet');
      add('teilgruppe', fehler.length === 0, fehler.join('; ') || antworten.map((a) => `${a.g.label}: ${a.staerkste}`).join('; '));
    }
  }

  return { fall, ergebnis: r, ablauf, befunde };
}

/** Share of distinct sequences among a set of plans, and share of the most frequent one. */
export function variabilitaet(ablaeufe: string[][]) {
  const counts = new Map<string, number>();
  ablaeufe.forEach((a) => counts.set(a.join(' > '), (counts.get(a.join(' > ')) || 0) + 1));
  return { verschieden: counts.size, haeufigsterAnteil: Math.max(0, ...counts.values()) / Math.max(1, ablaeufe.length) };
}
