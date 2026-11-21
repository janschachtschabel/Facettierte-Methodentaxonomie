import {
  FMT_RULES,
  type Arrangement,
  type ArrangementNode,
  type Baustein,
  type CatalogBundle,
  type ValidationMessage
} from '@fmt/core';
import {
  getMainSequence,
  setRecurrence,
  setSlotBlock
} from './arrangementOps.js';

export interface ExplainedValidationMessage {
  raw: ValidationMessage;
  location: string;
  stepIndex: number | null;
  slotKennung: string | null;
  why: string;
  howToFix: string;
  quickFix?: {
    label: string;
    apply: (arr: Arrangement) => Arrangement;
  };
}

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;
const defaultDuration = (b: Baustein) =>
  Math.max(b.dauerMin, Math.min(b.dauerMax, Math.round((b.dauerMin + b.dauerMax) / 2 / 5) * 5));

function insertStepAt(arr: Arrangement, idx: number, block: Baustein): Arrangement {
  const next = clone(arr);
  const node: ArrangementNode = { typ: 'Einsatz', baustein: block.kennung, dauerMin: defaultDuration(block) };
  if (next.ablauf.typ === 'Parallel') {
    const teile = next.ablauf.haupt.typ === 'Sequenz' ? [...next.ablauf.haupt.teile] : [next.ablauf.haupt];
    teile.splice(Math.max(0, Math.min(teile.length, idx)), 0, node);
    next.ablauf.haupt = { typ: 'Sequenz', teile };
  } else if (next.ablauf.typ === 'Sequenz') {
    next.ablauf.teile.splice(Math.max(0, Math.min(next.ablauf.teile.length, idx)), 0, node);
  } else {
    const teile = [next.ablauf];
    teile.splice(Math.max(0, Math.min(teile.length, idx)), 0, node);
    next.ablauf = { typ: 'Sequenz', teile };
  }
  return next;
}

function bestProducerFor(
  stateId: string,
  bundle: CatalogBundle,
  maxRang: number,
  rangMap: Map<string, number>
): Baustein | null {
  const gradeRank = (b: Baustein) =>
    b.evidenz.some((e) => e.grad === 'A') ? 0 : b.evidenz.some((e) => e.grad === 'B') ? 1 : 2;
  const cands = bundle.bausteine
    .filter(
      (b) =>
        !b.komposit &&
        (rangMap.get(b.reichweite) || 0) <= maxRang &&
        (b.nachbedingung || []).includes(stateId) &&
        (b.vorbedingung || []).length === 0
    )
    .sort((a, b) => gradeRank(a) - gradeRank(b) || a.dauerMin - b.dauerMin || a.name.localeCompare(b.name, 'de'));
  return cands[0] || bundle.bausteine.find((b) => !b.komposit && (b.nachbedingung || []).includes(stateId)) || null;
}

export function explainValidationMessage(
  msg: ValidationMessage,
  arrangement: Arrangement,
  blocksById: Map<string, Baustein>,
  bundle: CatalogBundle,
  totalDauerMin: number
): ExplainedValidationMessage {
  const { seq } = getMainSequence(arrangement);
  const rule = FMT_RULES.find((r) => r.id === msg.regel);
  const rangMap = new Map(
    (bundle.schemes.find((s) => s.id === 'reichweite')?.werte || []).map((w) => [w.id, w.rang ?? 0])
  );
  const arrRang = rangMap.get(arrangement.reichweite) || 3;

  let stepIndex: number | null = null;
  let slotKennung: string | null = null;
  let location = 'Gesamtablauf';

  const teileMatch = msg.pfad.match(/\/teile\/(\d+)(?:\/belegung\/([^/]+))?/);
  if (teileMatch) {
    stepIndex = Number(teileMatch[1]);
    slotKennung = teileMatch[2] || null;
    const node = seq.teile[stepIndex];
    const bName =
      node?.typ === 'Einsatz' || node?.typ === 'Wiederkehr'
        ? blocksById.get(node.baustein)?.name || node.baustein
        : node?.typ || 'Schritt';
    const visSteps: ArrangementNode[] = seq.teile.filter((t) => t.typ !== 'Wiederkehr');
    const visPos = node ? visSteps.indexOf(node) : -1;
    const labelPrefix = node?.typ === 'Wiederkehr' ? 'Wiederkehr' : visPos >= 0 ? `Schritt ${visPos + 1}` : `Schritt ${stepIndex + 1}`;
    location = `${labelPrefix} · ${bName}`;
    if (slotKennung && node?.typ === 'Einsatz') {
      const sl = blocksById.get(node.baustein)?.slot?.find((s) => s.kennung === slotKennung);
      location += ` → Slot „${sl?.name || slotKennung}“`;
    }
  } else if (msg.pfad.includes('/begleitend/')) {
    location = 'Begleitstrang (Parallel)';
  } else if (msg.pfad === '/kontext/zeitbudgetMin') {
    location = 'Zeitbudget';
  } else if (msg.pfad === '/zieltyp') {
    location = 'Zieltyp / Funktionskette';
  }

  let howToFix = 'Prüfen Sie Baustein, Reihenfolge oder Kontext im Editor.';
  let quickFix: ExplainedValidationMessage['quickFix'] | undefined;

  switch (msg.regel) {
    case 'R-01': {
      howToFix =
        'Die Granularität (Reichweite R1–R4) muss von außen nach innen kleiner werden (z. B. R3 Reihe ⊃ R2 Szenario ⊃ R1 Interaktion).';
      if (arrangement.reichweite === 'r2' || arrangement.reichweite === 'r1') {
        quickFix = {
          label: 'Rahmen auf R3 (Unterrichtsreihe) anheben',
          apply: (a) => ({ ...a, reichweite: 'r3' })
        };
      } else if (arrangement.reichweite === 'r3') {
        quickFix = {
          label: 'Rahmen auf R4 (Modul / Kurs) anheben',
          apply: (a) => ({ ...a, reichweite: 'r4' })
        };
      }
      break;
    }
    case 'R-02':
      howToFix = 'Wählen Sie für diesen Slot einen Baustein mit passender Lernfunktion (wird in der Slot-Auswahl vorgefiltert).';
      break;
    case 'R-03': {
      howToFix =
        'Dieser Baustein erwartet einen Lernzustand aus einer vorherigen Phase. Fügen Sie davor einen passenden Einstiegs- oder Erarbeitungsbaustein ein.';
      const mState = msg.meldung.match(/\(([^)]+)\)/);
      const missingState = mState ? mState[1].split(',')[0].trim() : '';
      if (missingState && stepIndex !== null) {
        const producer = bestProducerFor(missingState, bundle, arrRang, rangMap);
        if (producer) {
          const insertAt = stepIndex;
          quickFix = {
            label: `+ „${producer.name}“ davor einfügen`,
            apply: (a) => insertStepAt(a, insertAt, producer)
          };
        }
      }
      break;
    }
    case 'R-04': {
      howToFix =
        'Die gewählte Funktionskette verlangt weitere Zielzustände. Ergänzen Sie einen Baustein, der den fehlenden Lernzustand liefert, oder wechseln Sie auf „Freier Ablauf“.';
      const stateScheme = bundle.schemes.find((s) => s.id === 'lernzustand')?.werte || [];
      const missingMatch = stateScheme.find((z) => msg.meldung.includes(z.id) || msg.meldung.includes(z.label));
      if (missingMatch) {
        const producer = bestProducerFor(missingMatch.id, bundle, arrRang, rangMap);
        if (producer) {
          quickFix = {
            label: `+ „${producer.name}“ anfügen`,
            apply: (a) => {
              const { seq: s } = getMainSequence(a);
              const wkIdx = s.teile.findIndex((n) => n.typ === 'Wiederkehr');
              return insertStepAt(a, wkIdx >= 0 ? wkIdx : s.teile.length, producer);
            }
          };
        }
      }
      break;
    }
    case 'R-05': {
      howToFix =
        'Auf offene Erkundungsphasen sollte eine explizite oder geleitete Sicherung folgen, damit Fehlkonzepte korrigiert werden.';
      const sicherung =
        blocksById.get('vergleichende-instruktion') || blocksById.get('vortrag-prompts') || blocksById.get('abrufquiz');
      if (sicherung) {
        const insertAfter = stepIndex !== null ? stepIndex + 1 : seq.teile.length;
        quickFix = {
          label: `+ „${sicherung.name}“ zur Sicherung danach einfügen`,
          apply: (a) => insertStepAt(a, insertAfter, sicherung)
        };
      }
      break;
    }
    case 'R-06':
      howToFix =
        'Prüfen Sie, ob Bildungsstufe und Vorwissen zum Baustein passen (Expertise-Reversal) oder nutzen Sie „⇄ Ersatz“ für eine passendere Alternative.';
      break;
    case 'R-07': {
      howToFix = 'Ergänzen Sie im Bereich „Wiederkehr (verteilt)“ einen kurzen Abrufbaustein (z. B. 3× Abrufquiz im Abstand von 2 Tagen).';
      if (blocksById.has('abrufquiz')) {
        quickFix = {
          label: 'Verteilte Wiederkehr (3× Abrufquiz) aktivieren',
          apply: (a) => setRecurrence(a, { baustein: 'abrufquiz', anzahl: 3, abstand: 'P2D', dauerMin: 6 })
        };
      }
      break;
    }
    case 'R-08':
      howToFix = 'Unterbrechen Sie lange passive Vortragsphasen (> 20 min) durch eine kurze aktive/konstruktive Interaktion (z. B. Think-Pair-Share oder Murmelgruppe).';
      break;
    case 'R-09': {
      howToFix = 'Passen Sie die Minutenzahlen einzelner Schritte oder das Gesamt-Zeitbudget oben an.';
      if (msg.pfad === '/kontext/zeitbudgetMin' && totalDauerMin > 0) {
        quickFix = {
          label: `Zeitbudget auf ${totalDauerMin} min anpassen`,
          apply: (a) => ({ ...a, kontext: { ...a.kontext, zeitbudgetMin: totalDauerMin } })
        };
      }
      break;
    }
    case 'R-11': {
      howToFix =
        'Dieser Container-Baustein wirkt über seine eingebetteten Pflichtslots. Wählen Sie direkt in der eingerückten Slot-Tasche einen passenden Unterbaustein.';
      if (stepIndex !== null) {
        const node = seq.teile[stepIndex];
        if (node?.typ === 'Einsatz') {
          const parent = blocksById.get(node.baustein);
          const emptySlot = (parent?.slot || []).find(
            (sl) => sl.pflicht && !(node.belegung || []).some((bel) => bel.slotKennung === sl.kennung)
          );
          if (parent && emptySlot) {
            const pRang = rangMap.get(parent.reichweite) || 3;
            const sRang = rangMap.get(emptySlot.reichweite) || 2;
            const cand = bundle.bausteine.find(
              (c) =>
                (rangMap.get(c.reichweite) || 0) < pRang &&
                (rangMap.get(c.reichweite) || 0) <= sRang &&
                c.lernfunktion.some((fn) => emptySlot.lernfunktion.includes(fn))
            );
            if (cand) {
              const targetIdx = stepIndex;
              quickFix = {
                label: `Slot „${emptySlot.name}“ mit „${cand.name}“ belegen`,
                apply: (a) => setSlotBlock(a, targetIdx, emptySlot.kennung, cand)
              };
            }
          }
        }
      }
      break;
    }
    default:
      break;
  }

  return {
    raw: msg,
    location,
    stepIndex,
    slotKennung,
    why: rule ? `${rule.prueft} (${rule.begruendung})` : msg.meldung,
    howToFix,
    quickFix
  };
}
