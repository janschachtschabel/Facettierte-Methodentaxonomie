import { ruleBasisOf } from './rules.js';
import type {
  Arrangement,
  ArrangementNode,
  Baustein,
  EinsatzNode,
  FmtData,
  ValidationMessage,
  ValidationResult
} from './types.js';

const CLEARING_FUNCTIONS = ['verstehen', 'konsolidierung'];
const CLEARING_GUIDANCE = ['explizit', 'geleitet'];
const PASSIVE_LIMIT_MIN = 20;
const MIN_SPACED_REPETITIONS = 2;

export interface FmtValidator {
  validate(arr: Arrangement, registry?: Map<string, Arrangement>, _stack?: string[]): ValidationResult;
  rangOf(node: ArrangementNode): number;
  functionsOf(node: ArrangementNode): Set<string>;
}

export function createValidator(data: FmtData): FmtValidator {
  const bausteine = new Map<string, Baustein>(data.bausteine.map((b) => [b.kennung, b]));
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
  const midDuration = (b: Baustein) => Math.round((b.dauerMin + b.dauerMax) / 2);

  function rangOf(node: ArrangementNode | undefined, registry: Map<string, Arrangement>): number {
    if (!node) return 0;
    switch (node.typ) {
      case 'Einsatz':
      case 'Wiederkehr': {
        const b = bausteine.get(node.baustein);
        return b ? rang.get(b.reichweite) || 0 : 0;
      }
      case 'Sequenz':
        return Math.max(0, ...(node.teile || []).map((n) => rangOf(n, registry)));
      case 'Parallel':
        return Math.max(rangOf(node.haupt, registry), ...(node.begleitend || []).map((n) => rangOf(n, registry)));
      case 'Alternative':
        return Math.max(0, ...(node.optionen || []).map((n) => rangOf(n, registry)));
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

  function functionsOf(node: ArrangementNode | undefined): Set<string> {
    if (!node) return new Set();
    switch (node.typ) {
      case 'Einsatz':
      case 'Wiederkehr': {
        const b = bausteine.get(node.baustein);
        return new Set(b ? b.lernfunktion : []);
      }
      case 'Sequenz':
        return union((node.teile || []).map(functionsOf));
      case 'Parallel':
        return union([functionsOf(node.haupt), ...(node.begleitend || []).map(functionsOf)]);
      case 'Alternative':
        return union((node.optionen || []).map(functionsOf));
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
    const add = (regel: string, schwere: 'Fehler' | 'Warnung', pfad: string, meldung: string) =>
      meldungen.push({ regel, schwere, grundlage: ruleBasisOf(regel), pfad, meldung });

    const kontext = arr.kontext || {};
    const arrRang = rang.get(arr.reichweite) || 0;
    const st: {
      zustand: Set<string>;
      offen: string | null;
      passiv: number;
      passivGemeldet: boolean;
      wiederkehr: Array<{ anzahl: number; baustein: string }>;
    } = {
      zustand: new Set(),
      offen: null,
      passiv: 0,
      passivGemeldet: false,
      wiederkehr: []
    };

    function checkPre(b: Baustein, pfad: string) {
      const missing = (b.vorbedingung || []).filter((z) => !st.zustand.has(z));
      if (missing.length) add('R-03', 'Fehler', pfad, `„${b.name}“: Vorbedingung nicht erfüllt (${missing.join(', ')}).`);
      if (b.geeignetBeiVorwissen && kontext.vorwissen && !b.geeignetBeiVorwissen.includes(kontext.vorwissen)) {
        add('R-06', 'Warnung', pfad, `„${b.name}“ ist für Vorwissen „${kontext.vorwissen}“ nicht vorgesehen (Expertise-Reversal).`);
      }
      if (b.ungeeignetBeiStufe && kontext.bildungsstufe && b.ungeeignetBeiStufe.includes(kontext.bildungsstufe)) {
        add('R-06', 'Warnung', pfad, `„${b.name}“: Für die Bildungsstufe „${kontext.bildungsstufe}“ spricht die Evidenz gegen diesen Baustein.`);
      }
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

    function walkEinsatz(node: EinsatzNode, pfad: string): number {
      const b = bausteine.get(node.baustein);
      if (!b) {
        add('R-00', 'Fehler', pfad, `Unbekannter Baustein „${node.baustein}“.`);
        return node.dauerMin || 0;
      }
      const r = rang.get(b.reichweite) || 0;
      if (r > arrRang) {
        add('R-01', 'Fehler', pfad, `„${b.name}“ (${b.reichweite}) passt nicht in ein Arrangement der Reichweite ${arr.reichweite}.`);
      }
      checkPre(b, pfad);
      const kern = new Set((b.kernkomponente || []).map((x) => x.kennung));
      (node.weggelassen || [])
        .filter((x) => kern.has(x))
        .forEach((x) =>
          add('R-10', 'Fehler', pfad, `Kernkomponente „${x}“ weggelassen: Die Bezeichnung „${b.name}“ gilt nicht mehr.`)
        );

      const dauer = node.dauerMin != null ? node.dauerMin : midDuration(b);
      if (dauer < b.dauerMin || dauer > b.dauerMax) {
        add('R-09', 'Warnung', pfad, `Dauer ${dauer} min liegt außerhalb des Rahmens von „${b.name}“ (${b.dauerMin}–${b.dauerMax} min).`);
      }

      const belegung = node.belegung || [];
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
        const cr = rangOf(bel.inhalt, registry);
        if (cr >= r || cr > (rang.get(sl.reichweite) || 0)) {
          add('R-01', 'Fehler', cp, `Slot „${sl.name}“ nimmt höchstens Reichweite ${sl.reichweite} auf; der Inhalt ist größer.`);
        }
        const fs = functionsOf(bel.inhalt);
        if (!sl.lernfunktion.some((fn) => fs.has(fn))) {
          add('R-02', 'Fehler', cp, `Inhalt passt nicht zur Funktion des Slots „${sl.name}“ (${sl.lernfunktion.join(', ')}).`);
        }
        slotDauer += walk(bel.inhalt, cp);
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

    function walk(node: ArrangementNode | undefined, pfad: string): number {
      if (!node || !node.typ) {
        add('R-00', 'Fehler', pfad, 'Knoten ohne Typ.');
        return 0;
      }
      checkStep(node, pfad);
      switch (node.typ) {
        case 'Einsatz':
          return walkEinsatz(node, pfad);
        case 'Sequenz':
          return (node.teile || []).reduce((sum, n, i) => sum + walk(n, `${pfad}/teile/${i}`), 0);
        case 'Parallel': {
          let d = walk(node.haupt, `${pfad}/haupt`);
          (node.begleitend || []).forEach((n, i) => {
            d += walk(n, `${pfad}/begleitend/${i}`);
          });
          return d;
        }
        case 'Wiederkehr': {
          const b = bausteine.get(node.baustein);
          if (!b) {
            add('R-00', 'Fehler', pfad, `Unbekannter Baustein „${node.baustein}“.`);
            return 0;
          }
          if ((rang.get(b.reichweite) || 0) > arrRang) {
            add('R-01', 'Fehler', pfad, `„${b.name}“ hat größere Reichweite als das Arrangement.`);
          }
          checkPre(b, pfad);
          const anzahl = node.anzahl || 1;
          const einzel = node.dauerMin != null ? node.dauerMin : midDuration(b);
          st.wiederkehr.push({ anzahl, baustein: b.kennung });
          leafEffects(b, einzel, pfad);
          addClosure(st.zustand, b.nachbedingung || []);
          return einzel * anzahl;
        }
        case 'Alternative': {
          const opts = node.optionen || [];
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
            maxD = Math.max(maxD, walk(o, `${pfad}/optionen/${i}`));
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
          const ref = registry.get(node.arrangement);
          if (!ref) {
            add('R-12', 'Warnung', pfad, `Verweis auf „${node.arrangement}“ ist nicht auflösbar.`);
            return 0;
          }
          if (_stack.includes(node.arrangement)) {
            add('R-12', 'Fehler', pfad, 'Zirkulärer Verweis.');
            return 0;
          }
          if ((rang.get(ref.reichweite) || 0) >= arrRang) {
            add('R-01', 'Fehler', pfad, 'Eingebundenes Arrangement muss kleinere Reichweite haben.');
          }
          const sub = validate(ref, registry, [..._stack, arr['@id'] || '']);
          if (!sub.gueltig) add('R-12', 'Warnung', pfad, `Eingebundenes Arrangement „${ref.name}“ enthält Fehler.`);
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
      wiederkehr: st.wiederkehr
    };
  }

  return { validate, rangOf: (n) => rangOf(n, new Map()), functionsOf };
}
