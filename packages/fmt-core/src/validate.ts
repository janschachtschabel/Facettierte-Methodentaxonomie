import { istHilfe } from './eintragsart.js';
import { ruleBasisOf } from './rules.js';
import { erstelleRegeln } from './regeln.js';
import type {
  Arrangement,
  ArrangementNode,
  Baustein,
  EinsatzNode,
  FmtData,
  Grundlage,
  ValidationMessage,
  ValidationResult
} from './types.js';

const CLEARING_FUNCTIONS = ['verstehen', 'konsolidierung'];
const CLEARING_GUIDANCE = ['explizit', 'geleitet'];
const PASSIVE_LIMIT_MIN = 20;
const MIN_SPACED_REPETITIONS = 2;
/** R-00 for a help (eintragsart 'hilfe') used as a phase: a help supports learners inside a method. */
const hilfeAlsPhase = (b: Baustein) =>
  `„${b.name}“ ist eine Hilfe und keine Phase: Sie stützt Lernende innerhalb einer Methode und wird einer Phase zugeordnet.`;
import { KennungIndex } from './kennung.js';

export interface FmtValidator {
  validate(arr: Arrangement, registry?: Map<string, Arrangement>, _stack?: string[]): ValidationResult;
  rangOf(node: ArrangementNode): number;
  functionsOf(node: ArrangementNode): Set<string>;
}

export function createValidator(data: FmtData): FmtValidator {
  const bausteine: Map<string, Baustein> = new KennungIndex(
    data.bausteine.map((b) => [b.kennung, b] as const),
    data.weiterleitungen
  );
  const ketten = new Map(data.ketten.map((k) => [k.id, k]));
  const reichweiteScheme = data.schemes.find((s) => s.id === 'reichweite')!;
  const rang = new Map<string, number>((reichweiteScheme.werte || []).map((w) => [w.id, w.rang ?? 0]));
  const lernzustandScheme = data.schemes.find((s) => s.id === 'lernzustand')!;
  const implies = new Map<string, string[]>((lernzustandScheme.werte || []).map((w) => [w.id, w.impliziert || []]));

  const addClosure = (set: Set<string>, states: string[]) => {
    const stack = [...states];
    while (stack.length) {
      const s = stack.pop()!;
      if (set.has(s)) continue;
      set.add(s);
      (implies.get(s) || []).forEach((x) => stack.push(x));
    }
  };
  const labelOf = (schema: string, code: string) => {
    const s = data.schemes.find((x) => x.id === schema);
    const w = (s?.werte || (s?.gruppen || []).flatMap((g) => g.werte)).find((x) => x.id === code);
    return w ? w.label : code;
  };
  /** Fit rules (regeln.ts): the same machine the matcher ranks with. */
  const regeln = erstelleRegeln(data.regeln || [], labelOf);
  const midDuration = (b: Baustein) => Math.round((b.dauerMin + b.dauerMax) / 2);

  const MAX_DEPTH = 32;
  const asArr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  function rangOf(node: ArrangementNode | undefined, registry: Map<string, Arrangement>, depth = 0): number {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > MAX_DEPTH) return 0;
    switch (node.typ) {
      case 'Einsatz':
      case 'Wiederkehr': {
        const b = bausteine.get(node.baustein);
        return b ? rang.get(b.reichweite) || 0 : 0;
      }
      case 'Sequenz':
        return Math.max(0, ...asArr<ArrangementNode>(node.teile).map((n) => rangOf(n, registry, depth + 1)));
      case 'Parallel':
        return Math.max(
          rangOf(node.haupt, registry, depth + 1),
          ...asArr<ArrangementNode>(node.begleitend).map((n) => rangOf(n, registry, depth + 1))
        );
      case 'Alternative':
        return Math.max(0, ...asArr<ArrangementNode>(node.optionen).map((n) => rangOf(n, registry, depth + 1)));
      case 'Verweis': {
        const r = registry.get(node.arrangement);
        return r ? rang.get(r.reichweite) || 0 : 0;
      }
      default:
        return 0;
    }
  }

  const union = (sets: Set<string>[]): Set<string> =>
    sets.reduce((acc, s) => {
      s.forEach((x) => acc.add(x));
      return acc;
    }, new Set<string>());

  function functionsOf(node: ArrangementNode | undefined, depth = 0): Set<string> {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth > MAX_DEPTH) return new Set();
    switch (node.typ) {
      case 'Einsatz':
      case 'Wiederkehr': {
        const b = bausteine.get(node.baustein);
        return new Set(b ? b.lernfunktion : []);
      }
      case 'Sequenz':
        return union(asArr<ArrangementNode>(node.teile).map((n) => functionsOf(n, depth + 1)));
      case 'Parallel':
        return union([
          functionsOf(node.haupt, depth + 1),
          ...asArr<ArrangementNode>(node.begleitend).map((n) => functionsOf(n, depth + 1))
        ]);
      case 'Alternative':
        return union(asArr<ArrangementNode>(node.optionen).map((n) => functionsOf(n, depth + 1)));
      default:
        return new Set();
    }
  }

  function validate(
    arr: Arrangement,
    registry: Map<string, Arrangement> = new Map(),
    _stack: string[] = []
  ): ValidationResult {
    const meldungen: ValidationMessage[] = [];
    const add = (regel: string, schwere: 'Fehler' | 'Warnung', pfad: string, meldung: string, grundlage?: Grundlage) =>
      meldungen.push({ regel, schwere, grundlage: grundlage ?? ruleBasisOf(regel), pfad, meldung });

    const kontext = arr.kontext || {};
    const lage = {
      ...(kontext.vorwissen ? { vorwissen: kontext.vorwissen } : {}),
      ...(kontext.bildungsstufe ? { bildungsstufe: kontext.bildungsstufe } : {}),
      ...(kontext.komplexitaet ? { komplexitaet: kontext.komplexitaet } : {}),
      ...(kontext.sprachniveau ? { sprachniveau: kontext.sprachniveau } : {}),
      ...(kontext.fachbereich ? { fachbereich: kontext.fachbereich } : {})
    };
    const arrRang = rang.get(arr.reichweite) || 0;
    const st: {
      zustand: Set<string>;
      offen: string | null;
      passiv: number;
      passivGemeldet: boolean;
      wiederkehr: Array<{ anzahl: number; baustein: string }>;
      ausserhalbMin: number;
    } = {
      zustand: new Set(kontext.vorhanden || []),
      offen: null,
      passiv: 0,
      passivGemeldet: false,
      wiederkehr: [],
      ausserhalbMin: 0
    };

    function checkPre(b: Baustein, pfad: string) {
      const missing = (b.vorbedingung || []).filter((z) => !st.zustand.has(z));
      if (missing.length) add('R-03', 'Fehler', pfad, `„${b.name}“: Vorbedingung nicht erfüllt (${missing.join(', ')}).`);
      // R-06 Eignung und Passung: every warning of the fit rules and suitability entries for this situation.
      for (const m of regeln.warnungen(b, lage)) add('R-06', 'Warnung', pfad, m.quelle ? `${m.text} (${m.quelle})` : m.text, m.grundlage);
    }

    function leafEffects(b: Baustein, dauer: number, pfad: string) {
      if (b.engagement.length && b.engagement.every((e) => e === 'passiv')) {
        st.passiv += dauer;
        if (st.passiv > PASSIVE_LIMIT_MIN && !st.passivGemeldet) {
          add('R-08', 'Warnung', pfad, `Mehr als ${PASSIVE_LIMIT_MIN} Minuten am Stück im passiven Modus.`);
          st.passivGemeldet = true;
        }
      } else {
        st.passiv = 0;
        st.passivGemeldet = false;
      }
      const opens = b.anleitung.length === 1 && b.anleitung[0] === 'offen';
      const clears =
        b.lernfunktion.some((f) => CLEARING_FUNCTIONS.includes(f)) &&
        b.anleitung.some((a) => CLEARING_GUIDANCE.includes(a));
      if (opens) st.offen = pfad;
      else if (clears) st.offen = null;
    }

    const kette = arr.zieltyp ? ketten.get(arr.zieltyp) || null : null;

    function checkStep(node: ArrangementNode, pfad: string) {
      if (!kette || !node.kettenschritt) return;
      const step = kette.schritte.find((x) => x.id === node.kettenschritt);
      if (!step) {
        add('R-04', 'Fehler', pfad, `Unbekannter Kettenschritt „${node.kettenschritt}“.`);
        return;
      }
      const parts = node.typ === 'Alternative' ? node.optionen || [] : [node];
      parts.forEach((p) => {
        if (![...functionsOf(p)].some((f) => step.funktion.includes(f))) {
          add(
            'R-04',
            'Fehler',
            pfad,
            `Der Baustein auf Schritt „${step.label}“ hat keine passende Lernfunktion (${step.funktion.join(', ')}).`
          );
        }
      });
    }

    function walkEinsatz(node: EinsatzNode, pfad: string, depth: number): number {
      const b = bausteine.get(node.baustein);
      if (!b) {
        add('R-00', 'Fehler', pfad, `Unbekannter Baustein „${node.baustein}“.`);
        return typeof node.dauerMin === 'number' ? node.dauerMin : 0;
      }
      if (istHilfe(b)) add('R-00', 'Fehler', pfad, hilfeAlsPhase(b));
      const r = rang.get(b.reichweite) || 0;
      if (r > arrRang) {
        add('R-01', 'Fehler', pfad, `„${b.name}“ (${b.reichweite}) passt nicht in ein Arrangement der Reichweite ${arr.reichweite}.`);
      }
      checkPre(b, pfad);
      const kern = new Set((b.kernkomponente || []).map((x) => x.kennung));
      if (node.weggelassen != null && !Array.isArray(node.weggelassen)) {
        add('R-00', 'Fehler', pfad, 'Feld „weggelassen“ muss ein Array sein.');
      }
      asArr<string>(node.weggelassen)
        .filter((x) => kern.has(x))
        .forEach((x) =>
          add('R-10', 'Fehler', pfad, `Kernkomponente „${x}“ weggelassen: Die Bezeichnung „${b.name}“ gilt nicht mehr.`)
        );

      const dauer = typeof node.dauerMin === 'number' ? node.dauerMin : midDuration(b);
      if (dauer < b.dauerMin || dauer > b.dauerMax) {
        add('R-09', 'Warnung', pfad, `Dauer ${dauer} min liegt außerhalb des Rahmens von „${b.name}“ (${b.dauerMin}–${b.dauerMax} min).`);
      }

      if (node.belegung != null && !Array.isArray(node.belegung)) {
        add('R-00', 'Fehler', pfad, 'Feld „belegung“ muss ein Array sein.');
      }
      const belegung = asArr<{ slotKennung: string; inhalt: ArrangementNode }>(node.belegung).filter(
        (x) => x && typeof x === 'object' && typeof x.slotKennung === 'string'
      );
      const slots = b.slot || [];
      belegung
        .filter((x) => !slots.some((s) => s.kennung === x.slotKennung))
        .forEach((x) => add('R-02', 'Fehler', pfad, `„${b.name}“ hat keinen Slot „${x.slotKennung}“.`));

      const filled = (sl: { kennung: string }) => belegung.find((x) => x.slotKennung === sl.kennung);
      const pflichtLeer = slots.filter((sl) => sl.pflicht && !filled(sl));
      pflichtLeer.forEach((sl) =>
        add(
          'R-11',
          'Warnung',
          pfad,
          `Pflichtslot „${sl.name}“ von „${b.name}“ ist leer.` + (b.komposit ? ' Ein Kompositbaustein wirkt nur über seine Slots.' : '')
        )
      );

      let slotDauer = 0;
      const walkSlot = (sl: NonNullable<Baustein['slot']>[number]) => {
        const bel = filled(sl);
        if (!bel) return;
        const cp = `${pfad}/belegung/${sl.kennung}`;
        const cr = rangOf(bel.inhalt, registry, depth + 1);
        if (cr >= r || cr > (rang.get(sl.reichweite) || 0)) {
          add('R-01', 'Fehler', cp, `Slot „${sl.name}“ nimmt höchstens Reichweite ${sl.reichweite} auf; der Inhalt ist größer.`);
        }
        const fs = functionsOf(bel.inhalt, depth + 1);
        if (!sl.lernfunktion.some((fn) => fs.has(fn))) {
          add('R-02', 'Fehler', cp, `Inhalt passt nicht zur Funktion des Slots „${sl.name}“ (${sl.lernfunktion.join(', ')}).`);
        }
        slotDauer += walk(bel.inhalt, cp, depth + 1);
      };

      slots.filter((sl) => !sl.nachKernphase).forEach(walkSlot);
      if (!b.komposit || !belegung.length) leafEffects(b, dauer, pfad);
      if (!b.komposit) addClosure(st.zustand, b.nachbedingung || []);
      if (!b.komposit && !(b.nachbedingung || []).length) {
        add('R-04', 'Warnung', pfad, `„${b.name}“ erzeugt keinen verlässlichen Lernzustand.`);
      }
      slots.filter((sl) => sl.nachKernphase).forEach(walkSlot);
      if (b.komposit && !pflichtLeer.length) {
        const offen = (b.nachbedingung || []).filter((z) => !st.zustand.has(z));
        if (offen.length) {
          add('R-11', 'Warnung', pfad, `„${b.name}“ erreicht mit dieser Belegung nicht: ${offen.join(', ')}.`);
        }
      }
      if (slotDauer > dauer) {
        add('R-09', 'Warnung', pfad, `Slots brauchen ${slotDauer} min, der Baustein hat ${dauer} min.`);
      }
      return dauer;
    }

    function walk(node: ArrangementNode | undefined, pfad: string, depth = 0): number {
      if (depth > MAX_DEPTH) {
        add('R-12', 'Fehler', pfad, 'Maximale Verschachtelungstiefe überschritten.');
        return 0;
      }
      if (!node || typeof node !== 'object' || Array.isArray(node) || typeof node.typ !== 'string') {
        add('R-00', 'Fehler', pfad, 'Knoten ohne Typ.');
        return 0;
      }
      checkStep(node, pfad);
      switch (node.typ) {
        case 'Einsatz':
          return walkEinsatz(node, pfad, depth);
        case 'Sequenz': {
          if (node.teile != null && !Array.isArray(node.teile)) {
            add('R-00', 'Fehler', pfad, 'Sequenz erwartet ein Array im Feld „teile“.');
            return 0;
          }
          return asArr<ArrangementNode>(node.teile).reduce((sum, n, i) => sum + walk(n, `${pfad}/teile/${i}`, depth + 1), 0);
        }
        case 'Parallel': {
          let d = walk(node.haupt, `${pfad}/haupt`, depth + 1);
          if (node.begleitend != null && !Array.isArray(node.begleitend)) {
            add('R-00', 'Fehler', pfad, 'Parallel erwartet ein Array im Feld „begleitend“.');
            return d;
          }
          asArr<ArrangementNode>(node.begleitend).forEach((n, i) => {
            d += walk(n, `${pfad}/begleitend/${i}`, depth + 1);
          });
          return d;
        }
        case 'Wiederkehr': {
          const b = bausteine.get(node.baustein);
          if (!b) {
            add('R-00', 'Fehler', pfad, `Unbekannter Baustein „${node.baustein}“.`);
            return 0;
          }
          if (istHilfe(b)) add('R-00', 'Fehler', pfad, hilfeAlsPhase(b));
          if ((rang.get(b.reichweite) || 0) > arrRang) {
            add('R-01', 'Fehler', pfad, `„${b.name}“ hat größere Reichweite als das Arrangement.`);
          }
          checkPre(b, pfad);
          const anzahl = typeof node.anzahl === 'number' && node.anzahl > 0 ? node.anzahl : 1;
          const einzel = typeof node.dauerMin === 'number' ? node.dauerMin : midDuration(b);
          st.wiederkehr.push({ anzahl, baustein: b.kennung });
          leafEffects(b, einzel, pfad);
          addClosure(st.zustand, b.nachbedingung || []);
          if (node.ausserhalbBudget != null && typeof node.ausserhalbBudget !== 'boolean') {
            add('R-00', 'Fehler', pfad, 'Wiederkehr erwartet im Feld „ausserhalbBudget“ wahr oder falsch.');
          }
          if (node.ausserhalbBudget === true) {
            // Repetitions in later sessions: they satisfy R-07 but are not part of this plan's duration.
            st.ausserhalbMin += einzel * anzahl;
            return 0;
          }
          return einzel * anzahl;
        }
        case 'Alternative': {
          if (node.optionen != null && !Array.isArray(node.optionen)) {
            add('R-00', 'Fehler', pfad, 'Alternative erwartet ein Array im Feld „optionen“.');
            return 0;
          }
          const opts = asArr<ArrangementNode>(node.optionen);
          if (opts.length < 2) add('R-02', 'Warnung', pfad, 'Alternative mit weniger als zwei Optionen.');
          const start = {
            zustand: new Set(st.zustand),
            offen: st.offen,
            passiv: st.passiv,
            passivGemeldet: st.passivGemeldet
          };
          const results: Set<string>[] = [];
          let maxD = 0;
          let offen: string | null = null;
          opts.forEach((o, i) => {
            st.zustand = new Set(start.zustand);
            st.offen = start.offen;
            st.passiv = start.passiv;
            st.passivGemeldet = start.passivGemeldet;
            maxD = Math.max(maxD, walk(o, `${pfad}/optionen/${i}`, depth + 1));
            results.push(st.zustand);
            offen = offen || st.offen;
          });
          st.zustand = results.length
            ? new Set([...results[0]].filter((z) => results.every((r) => r.has(z))))
            : start.zustand;
          st.offen = offen;
          return maxD;
        }
        case 'Verweis': {
          const refKey = typeof node.arrangement === 'string' ? node.arrangement : '';
          const ref = registry.get(refKey);
          if (!ref) {
            add('R-12', 'Warnung', pfad, `Verweis auf „${refKey}“ ist nicht auflösbar.`);
            return 0;
          }
          if (_stack.includes(refKey) || (ref['@id'] && _stack.includes(ref['@id'])) || _stack.length >= MAX_DEPTH) {
            add('R-12', 'Fehler', pfad, 'Zirkulärer Verweis.');
            return 0;
          }
          if ((rang.get(ref.reichweite) || 0) >= arrRang) {
            add('R-01', 'Fehler', pfad, 'Eingebundenes Arrangement muss kleinere Reichweite haben.');
          }
          const nextStack = [
            ..._stack,
            ...(arr['@id'] ? [arr['@id']] : []),
            refKey,
            ...(ref['@id'] && ref['@id'] !== refKey ? [ref['@id']] : [])
          ];
          const sub = validate(ref, registry, nextStack);
          if (sub.meldungen.some((m) => m.regel === 'R-12' && m.schwere === 'Fehler')) {
            add('R-12', 'Fehler', pfad, 'Zirkulärer Verweis.');
          } else if (!sub.gueltig) {
            add('R-12', 'Warnung', pfad, `Eingebundenes Arrangement „${ref.name}“ enthält Fehler.`);
          }
          addClosure(st.zustand, sub.endzustand);
          sub.wiederkehr.forEach((w) => st.wiederkehr.push(w));
          return sub.dauerMin;
        }
        default: {
          const unknownNode = node as { typ?: string };
          add('R-00', 'Fehler', pfad, `Unbekannter Knotentyp „${unknownNode.typ}“.`);
          return 0;
        }
      }
    }

    const dauerMin = walk(arr.ablauf, '/ablauf');

    if (st.offen) add('R-05', 'Fehler', st.offen, 'Offene Phase ohne nachfolgende explizite oder geleitete Sicherung.');
    if (arr.zieltyp) {
      if (!kette) add('R-04', 'Fehler', '/zieltyp', `Unbekannter Zieltyp „${arr.zieltyp}“.`);
      else {
        kette.schritte
          .filter((s) => !st.zustand.has(s.ziel))
          .forEach((s) => add('R-04', 'Fehler', '/ablauf', `Funktion „${s.label}“ ist nicht abgedeckt (Zielzustand ${s.ziel}).`));
        if (
          kette.schritte.some((s) => s.ziel === 'wissen-konsolidiert') &&
          !st.wiederkehr.some((w) => w.anzahl >= MIN_SPACED_REPETITIONS)
        ) {
          add(
            'R-07',
            'Warnung',
            '/ablauf',
            'Konsolidierungsziel ohne verteilte Wiederholung: Mindestens zwei Durchgänge mit Abstand verbessern das Langzeitbehalten.'
          );
        }
      }
    }
    if (kontext.zeitbudgetMin && dauerMin > kontext.zeitbudgetMin) {
      add('R-09', 'Warnung', '/kontext', `Gesamtdauer ${dauerMin} min überschreitet das Zeitbudget von ${kontext.zeitbudgetMin} min.`);
    }

    return {
      gueltig: !meldungen.some((m) => m.schwere === 'Fehler'),
      meldungen,
      endzustand: [...st.zustand],
      dauerMin,
      reichweite: arr.reichweite,
      wiederkehr: st.wiederkehr,
      ...(st.ausserhalbMin ? { dauerAusserhalbMin: st.ausserhalbMin } : {})
    };
  }

  return { validate, rangOf: (n) => rangOf(n, new Map()), functionsOf };
}
