import {
  computeMultiGroupSynthesis,
  locate,
  type AlternativeNode,
  type Arrangement,
  type ArrangementNode,
  type Baustein,
  type CatalogBundle,
  type EinsatzNode,
  type MatchResult,
  type SequenzNode,
  type ValidationResult,
  type WiederkehrNode
} from '@fmt/core';
import { safeOerList } from './safeUrl.js';
import { escHtml, markdownToHtml, renderInlineMarkdownHtml } from './markdownMath.js';

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

const defaultDuration = (b: Baustein) =>
  Math.max(b.dauerMin, Math.min(b.dauerMax, Math.round((b.dauerMin + b.dauerMax) / 2 / 5) * 5));

export function getMainSequence(arr: Arrangement): { seq: SequenzNode; prefix: string } {
  if (!arr?.ablauf || typeof arr.ablauf !== 'object' || Array.isArray(arr.ablauf)) {
    return { seq: { typ: 'Sequenz', teile: [] }, prefix: '/ablauf' };
  }
  if (arr.ablauf.typ === 'Parallel') {
    const haupt = arr.ablauf.haupt;
    if (!haupt || typeof haupt !== 'object') {
      return { seq: { typ: 'Sequenz', teile: [] }, prefix: '/ablauf/haupt' };
    }
    if (haupt.typ === 'Sequenz') {
      return {
        seq: { typ: 'Sequenz', teile: Array.isArray(haupt.teile) ? haupt.teile : [] },
        prefix: '/ablauf/haupt'
      };
    }
    return { seq: { typ: 'Sequenz', teile: [haupt] }, prefix: '/ablauf/haupt' };
  }
  if (arr.ablauf.typ === 'Sequenz') {
    return {
      seq: { typ: 'Sequenz', teile: Array.isArray(arr.ablauf.teile) ? arr.ablauf.teile : [] },
      prefix: '/ablauf'
    };
  }
  return { seq: { typ: 'Sequenz', teile: [arr.ablauf] }, prefix: '/ablauf' };
}

export function withMainSequence(arr: Arrangement, updater: (teile: ArrangementNode[]) => ArrangementNode[]): Arrangement {
  const next = clone(arr);
  if (next.ablauf?.typ === 'Parallel') {
    const haupt = next.ablauf.haupt;
    const cur =
      haupt && haupt.typ === 'Sequenz'
        ? Array.isArray(haupt.teile)
          ? haupt.teile
          : []
        : haupt
          ? [haupt]
          : [];
    next.ablauf.haupt = { typ: 'Sequenz', teile: updater(cur) };
    if (!Array.isArray(next.ablauf.begleitend)) next.ablauf.begleitend = [];
  } else if (next.ablauf?.typ === 'Sequenz') {
    next.ablauf.teile = updater(Array.isArray(next.ablauf.teile) ? next.ablauf.teile : []);
  } else if (next.ablauf && typeof next.ablauf === 'object') {
    next.ablauf = { typ: 'Sequenz', teile: updater([next.ablauf]) };
  } else {
    next.ablauf = { typ: 'Sequenz', teile: updater([]) };
  }
  return next;
}

const E = (baustein: string, dauerMin: number, extra?: Partial<EinsatzNode>): EinsatzNode => ({
  typ: 'Einsatz',
  baustein,
  dauerMin,
  ...extra
});

const fill = (slotKennung: string, inhalt: ArrangementNode) => ({ slotKennung, inhalt });

/** A free flow without any template content, shown when the user starts from an own description. */
export function createEmptyArrangement(bundle: CatalogBundle): Arrangement {
  return {
    '@context': bundle.NS + 'context.jsonld',
    '@id': bundle.NS + 'plan/entwurf',
    typ: 'Arrangement',
    name: 'Freier Ablauf',
    reichweite: 'r3',
    ablauf: { typ: 'Sequenz', teile: [] }
  };
}

/**
 * "Anderer Vorschlag": asks the matcher for the following variants until one has a different flow.
 * Returns null when the next few variants all repeat the current flow.
 */
export function findNextVariant(
  zuordnen: (variante: number) => MatchResult,
  current: Arrangement,
  currentVariante: number,
  maxTries = 6
): { variante: number; result: MatchResult; arrangement: Arrangement } | null {
  const now = JSON.stringify(current.ablauf);
  for (let v = currentVariante + 1; v <= currentVariante + maxTries; v++) {
    const result = zuordnen(v);
    if (result.modus === 'ablauf' && result.arrangement && JSON.stringify(result.arrangement.ablauf) !== now) {
      return { variante: v, result, arrangement: result.arrangement };
    }
  }
  return null;
}

export function createChainPreset(zieltyp: string, bundle: CatalogBundle): Arrangement {
  const kette = bundle.ketten.find((k) => k.id === zieltyp);
  const label = kette?.label || zieltyp;
  const base = {
    '@context': bundle.NS + 'context.jsonld',
    '@id': bundle.NS + 'plan/entwurf',
    typ: 'Arrangement' as const,
    name: `Eigene Reihe (${label})`,
    reichweite: 'r3',
    zieltyp
  };

  if (zieltyp === 'konzeptaufbau') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'gering', zeitbudgetMin: 270 },
      ablauf: {
        typ: 'Parallel',
        haupt: {
          typ: 'Sequenz',
          teile: [
            E('vbe', 30, { kettenschritt: 'k1', belegung: [fill('austausch', E('tps', 10))] }),
            E('productive-failure', 90, {
              kettenschritt: 'k2',
              belegung: [
                fill('generierung', E('erfindungsaufgabe', 45)),
                fill('konsolidierung', E('vergleichende-instruktion', 40))
              ]
            }),
            E('loesungsbeispiele', 30, { kettenschritt: 'k3' }),
            E('experiment', 55, { kettenschritt: 'k4', belegung: [fill('sicherung', E('exit-ticket', 5))] }),
            E('reflexionsprompt', 10, { kettenschritt: 'k5' }),
            { typ: 'Wiederkehr', baustein: 'abrufquiz', anzahl: 3, abstand: 'P2D', dauerMin: 6 }
          ]
        },
        begleitend: [E('kompetenzraster-checkliste', 15)]
      }
    };
  }

  if (zieltyp === 'prozedur') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'gering', zeitbudgetMin: 90 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('tps', 8, { kettenschritt: 'p1' }),
          E('vortrag-prompts', 20, { kettenschritt: 'p2' }),
          E('loesungsbeispiele', 30, { kettenschritt: 'p3' }),
          E('abrufquiz', 8, { kettenschritt: 'p4' }),
          { typ: 'Wiederkehr', baustein: 'abrufquiz', anzahl: 3, abstand: 'P2D', dauerMin: 6 }
        ]
      }
    };
  }

  if (zieltyp === 'problemloesen') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'mittel', zeitbudgetMin: 180 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('ankerfall', 25, { kettenschritt: 'q1' }),
          E('erfindungsaufgabe', 40, { kettenschritt: 'q2' }),
          E('vergleichende-instruktion', 30, { kettenschritt: 'q3' }),
          E('experiment', 55, { kettenschritt: 'q4', belegung: [fill('sicherung', E('exit-ticket', 5))] })
        ]
      }
    };
  }

  if (zieltyp === 'fuenf-e') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'mittel', zeitbudgetMin: 135 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('tps', 8, { kettenschritt: 'e1' }),
          E('erfindungsaufgabe', 40, { kettenschritt: 'e2' }),
          E('vergleichende-instruktion', 30, { kettenschritt: 'e3' }),
          E('experiment', 45, { kettenschritt: 'e4', belegung: [fill('sicherung', E('abrufquiz', 6))] }),
          E('exit-ticket', 5, { kettenschritt: 'e5' })
        ]
      }
    };
  }

  if (zieltyp === 'pbl-siebensprung') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'mittel', zeitbudgetMin: 225 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('ankerfall', 25, { kettenschritt: 'pbl1' }),
          E('erfindungsaufgabe', 40, { kettenschritt: 'pbl2' }),
          E('vergleichende-instruktion', 35, { kettenschritt: 'pbl3' }),
          E('experiment', 55, { kettenschritt: 'pbl4', belegung: [fill('sicherung', E('exit-ticket', 5))] }),
          E('reflexionsprompt', 10, { kettenschritt: 'pbl5' })
        ]
      }
    };
  }

  if (zieltyp === 'direkte-instruktion') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'gering', zeitbudgetMin: 135 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('rosenshine-daily-review', 8, { kettenschritt: 'di1' }),
          E('vortrag-prompts', 25, { kettenschritt: 'di2' }),
          E('loesungsbeispiele', 35, { kettenschritt: 'di3' }),
          E('exit-ticket', 5, { kettenschritt: 'di4' }),
          E('abrufquiz', 8, { kettenschritt: 'di5' }),
          { typ: 'Wiederkehr', baustein: 'abrufquiz', anzahl: 3, abstand: 'P2D', dauerMin: 6 }
        ]
      }
    };
  }

  if (zieltyp === 'kooperatives-lernen') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'mittel', zeitbudgetMin: 135 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('tps', 8, { kettenschritt: 'ko1' }),
          E('gruppenpuzzle', 60, { kettenschritt: 'ko2', belegung: [fill('sicherung', E('abrufquiz', 8))] }),
          E('abrufquiz', 8, { kettenschritt: 'ko3' }),
          E('exit-ticket', 5, { kettenschritt: 'ko4' }),
          { typ: 'Wiederkehr', baustein: 'abrufquiz', anzahl: 3, abstand: 'P2D', dauerMin: 6 }
        ]
      }
    };
  }

  if (zieltyp === 'projektlernen') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'mittel', zeitbudgetMin: 270 },
      ablauf: {
        typ: 'Parallel',
        haupt: {
          typ: 'Sequenz',
          teile: [
            E('ankerfall', 25, { kettenschritt: 'pr1' }),
            E('kooperatives-skript', 35, { kettenschritt: 'pr2' }),
            E('experiment', 60, { kettenschritt: 'pr3', belegung: [fill('sicherung', E('exit-ticket', 5))] }),
            E('reflexionsprompt', 10, { kettenschritt: 'pr4' })
          ]
        },
        begleitend: [E('kanban-lernboard', 20)]
      }
    };
  }

  if (zieltyp === 'urteilsbildung') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'mittel', zeitbudgetMin: 90 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('positionslinie', 10, { kettenschritt: 'u1' }),
          E('lehrgespraech', 20, { kettenschritt: 'u2' }),
          E('pro-contra-debatte', 45, { kettenschritt: 'u3' }),
          E('reflexionsprompt', 10, { kettenschritt: 'u4' })
        ]
      }
    };
  }

  if (zieltyp === 'fertigkeit-bewegung') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'gering', zeitbudgetMin: 90 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('gebundene-musik-rhythmus', 10, { kettenschritt: 'b1' }),
          E('demonstration-nachmachen', 15, { kettenschritt: 'b2' }),
          E('stationstraining-bewegung', 35, { kettenschritt: 'b3' }),
          E('differenzielles-lernen', 20, { kettenschritt: 'b4' }),
          E('blitzlicht', 8, { kettenschritt: 'b5' })
        ]
      }
    };
  }

  if (zieltyp === 'produktion') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'mittel', zeitbudgetMin: 90 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('stummer-impuls', 8, { kettenschritt: 'pd1' }),
          E('lehrgespraech', 17, { kettenschritt: 'pd2' }),
          E('kreatives-schreiben', 40, { kettenschritt: 'pd3' }),
          E('textlupe', 25, { kettenschritt: 'pd4' })
        ]
      }
    };
  }

  // faktenwissen or fallback
  return {
    ...base,
    kontext: { bildungsstufe: 'sek1', vorwissen: 'gering', zeitbudgetMin: 135 },
    ablauf: {
      typ: 'Sequenz',
      teile: [
        E('kugellager', 10, { kettenschritt: 'f1' }),
        E('gruppenpuzzle', 60, { kettenschritt: 'f2', belegung: [fill('sicherung', E('abrufquiz', 8))] }),
        E('abrufquiz', 8, { kettenschritt: 'f3' }),
        E('exit-ticket', 5, { kettenschritt: 'f4' }),
        { typ: 'Wiederkehr', baustein: 'abrufquiz', anzahl: 3, abstand: 'P1W', dauerMin: 6 }
      ]
    }
  };
}

export function appendBlockToArrangement(arr: Arrangement, block: Baustein): Arrangement {
  const newNode: EinsatzNode = { typ: 'Einsatz', baustein: block.kennung, dauerMin: defaultDuration(block) };
  return withMainSequence(arr, (teile) => {
    const wkIndex = teile.findIndex((t) => t.typ === 'Wiederkehr');
    if (wkIndex === -1) return [...teile, newNode];
    return [...teile.slice(0, wkIndex), newNode, ...teile.slice(wkIndex)];
  });
}

export function removeStep(arr: Arrangement, index: number): Arrangement {
  return withMainSequence(arr, (teile) => teile.filter((_, i) => i !== index));
}

export function moveStep(arr: Arrangement, from: number, to: number): Arrangement {
  return withMainSequence(arr, (teile) => {
    if (from < 0 || from >= teile.length || to < 0 || to >= teile.length || from === to) return teile;
    const copy = [...teile];
    const [item] = copy.splice(from, 1);
    copy.splice(to, 0, item);
    return copy;
  });
}

export function updateStepBlock(arr: Arrangement, index: number, block: Baustein, keepStep = true): Arrangement {
  return withMainSequence(arr, (teile) => {
    const copy = [...teile];
    const prev = copy[index];
    copy[index] = {
      typ: 'Einsatz',
      baustein: block.kennung,
      dauerMin: defaultDuration(block),
      ...(keepStep && prev?.kettenschritt ? { kettenschritt: prev.kettenschritt } : {})
    };
    return copy;
  });
}

export function updateStepDuration(arr: Arrangement, index: number, dauerMin: number): Arrangement {
  return withMainSequence(arr, (teile) => {
    const copy = [...teile];
    const cur = copy[index];
    if (cur && (cur.typ === 'Einsatz' || cur.typ === 'Wiederkehr')) {
      copy[index] = { ...cur, dauerMin: Math.max(0, dauerMin) };
    }
    return copy;
  });
}

export function setSlotBlock(arr: Arrangement, stepIndex: number, slotKennung: string, block: Baustein | null): Arrangement {
  return withMainSequence(arr, (teile) => {
    const copy = [...teile];
    const cur = copy[stepIndex];
    if (!cur || cur.typ !== 'Einsatz') return copy;
    const rest = (cur.belegung || []).filter((b) => b.slotKennung !== slotKennung);
    const otherSlotMin = rest.reduce((s, x) => s + (x.inhalt.typ === 'Einsatz' ? x.inhalt.dauerMin || 0 : 0), 0);
    let slotDur = block ? defaultDuration(block) : 0;
    if (block && typeof cur.dauerMin === 'number' && cur.dauerMin > otherSlotMin) {
      const remaining = cur.dauerMin - otherSlotMin;
      if (remaining >= block.dauerMin && remaining < slotDur) {
        slotDur = remaining;
      }
    }
    const nextBel = block
      ? [...rest, { slotKennung, inhalt: { typ: 'Einsatz' as const, baustein: block.kennung, dauerMin: slotDur } }]
      : rest;
    const totalSlotMin = nextBel.reduce((s, x) => s + (x.inhalt.typ === 'Einsatz' ? x.inhalt.dauerMin || 0 : 0), 0);
    const nextParentDur = typeof cur.dauerMin === 'number' ? Math.max(cur.dauerMin, totalSlotMin) : totalSlotMin;
    copy[stepIndex] = { ...cur, dauerMin: nextParentDur, belegung: nextBel.length ? nextBel : undefined };
    return copy;
  });
}

export function updateSlotDuration(
  arr: Arrangement,
  stepIndex: number,
  slotKennung: string,
  dauerMin: number,
  autoFitParent = false
): Arrangement {
  return withMainSequence(arr, (teile) => {
    const copy = [...teile];
    const cur = copy[stepIndex];
    if (!cur || cur.typ !== 'Einsatz' || !Array.isArray(cur.belegung)) return copy;
    const safeMin = Math.max(0, dauerMin);
    const nextBel = cur.belegung.map((b) =>
      b.slotKennung === slotKennung && b.inhalt.typ === 'Einsatz'
        ? { ...b, inhalt: { ...b.inhalt, dauerMin: safeMin } }
        : b
    );
    const sum = nextBel.reduce((s, x) => s + (x.inhalt.typ === 'Einsatz' ? x.inhalt.dauerMin || 0 : 0), 0);
    copy[stepIndex] = {
      ...cur,
      ...(autoFitParent && typeof cur.dauerMin === 'number' && sum > cur.dauerMin ? { dauerMin: sum } : {}),
      belegung: nextBel
    };
    return copy;
  });
}

export function fitContainerDurationToSlots(arr: Arrangement, stepIndex: number): Arrangement {
  return withMainSequence(arr, (teile) => {
    const copy = [...teile];
    const cur = copy[stepIndex];
    if (!cur || cur.typ !== 'Einsatz' || !Array.isArray(cur.belegung)) return copy;
    const sum = cur.belegung.reduce((s, x) => s + (x.inhalt.typ === 'Einsatz' ? x.inhalt.dauerMin || 0 : 0), 0);
    if (sum > 0) copy[stepIndex] = { ...cur, dauerMin: sum };
    return copy;
  });
}

export function updateAlternativeOptionDuration(
  arr: Arrangement,
  stepIndex: number,
  optionIndex: number,
  dauerMin: number
): Arrangement {
  return withMainSequence(arr, (teile) => {
    const copy = [...teile];
    const cur = copy[stepIndex];
    if (!cur || cur.typ !== 'Alternative') return copy;
    const opts = [...cur.optionen];
    const target = opts[optionIndex];
    if (target && target.typ === 'Einsatz') {
      opts[optionIndex] = { ...target, dauerMin: Math.max(0, dauerMin) };
    }
    copy[stepIndex] = { ...cur, optionen: opts };
    return copy;
  });
}

export function wrapStepInAlternative(
  arr: Arrangement,
  stepIndex: number,
  secondBlock: Baustein,
  kriterium = 'Adaptive Wahl nach Lernstand oder Interesse'
): Arrangement {
  return withMainSequence(arr, (teile) => {
    const copy = [...teile];
    const cur = copy[stepIndex];
    if (!cur || cur.typ === 'Alternative') return copy;
    const alt: AlternativeNode = {
      typ: 'Alternative',
      kettenschritt: cur.kettenschritt,
      kriterium,
      optionen: [
        { ...cur, kettenschritt: undefined },
        { typ: 'Einsatz', baustein: secondBlock.kennung, dauerMin: defaultDuration(secondBlock) }
      ]
    };
    copy[stepIndex] = alt;
    return copy;
  });
}

export function unwrapAlternative(arr: Arrangement, stepIndex: number, keepOptionIndex = 0): Arrangement {
  return withMainSequence(arr, (teile) => {
    const copy = [...teile];
    const cur = copy[stepIndex];
    if (!cur || cur.typ !== 'Alternative') return copy;
    const chosen = cur.optionen[keepOptionIndex] || cur.optionen[0];
    if (!chosen) return copy;
    copy[stepIndex] = { ...chosen, kettenschritt: cur.kettenschritt };
    return copy;
  });
}

export function updateAlternativeOption(
  arr: Arrangement,
  stepIndex: number,
  optionIndex: number,
  block: Baustein
): Arrangement {
  return withMainSequence(arr, (teile) => {
    const copy = [...teile];
    const cur = copy[stepIndex];
    if (!cur || cur.typ !== 'Alternative') return copy;
    const opts = [...cur.optionen];
    opts[optionIndex] = { typ: 'Einsatz', baustein: block.kennung, dauerMin: defaultDuration(block) };
    copy[stepIndex] = { ...cur, optionen: opts };
    return copy;
  });
}

export function setParallelBlock(arr: Arrangement, block: Baustein | null, dauerMin?: number): Arrangement {
  const next = clone(arr);
  const haupt = next.ablauf.typ === 'Parallel' ? next.ablauf.haupt : next.ablauf;
  if (!block) {
    next.ablauf = haupt;
  } else {
    next.ablauf = {
      typ: 'Parallel',
      haupt,
      begleitend: [{ typ: 'Einsatz', baustein: block.kennung, dauerMin: dauerMin ?? defaultDuration(block) }]
    };
  }
  return next;
}

export function setRecurrence(
  arr: Arrangement,
  spec: { baustein: string; anzahl: number; abstand: string; dauerMin: number; ausserhalbBudget?: boolean } | null
): Arrangement {
  return withMainSequence(arr, (teile) => {
    const without = teile.filter((t) => t.typ !== 'Wiederkehr');
    if (!spec || !spec.baustein || spec.anzahl <= 0) return without;
    const wk: WiederkehrNode = {
      typ: 'Wiederkehr',
      baustein: spec.baustein,
      anzahl: spec.anzahl,
      abstand: spec.abstand || 'P2D',
      dauerMin: spec.dauerMin,
      ...(spec.ausserhalbBudget ? { ausserhalbBudget: true } : {})
    };
    return [...without, wk];
  });
}

export function replaceNodeAtPath(arr: Arrangement, pfad: string, baustein: string, dauerMin: number): Arrangement {
  const copy = clone(arr);
  const at = locate(copy, pfad);
  const prev = at.holder[at.key] as { typ?: string; kettenschritt?: string; anzahl?: number; abstand?: string };
  at.holder[at.key] = {
    typ: prev.typ === 'Wiederkehr' ? 'Wiederkehr' : 'Einsatz',
    baustein,
    dauerMin,
    ...(prev.kettenschritt ? { kettenschritt: prev.kettenschritt } : {}),
    ...(prev.typ === 'Wiederkehr' ? { anzahl: prev.anzahl || 3, abstand: prev.abstand || 'P2D' } : {})
  };
  return copy;
}

const VALID_NODE_TYPES = new Set(['Einsatz', 'Sequenz', 'Parallel', 'Wiederkehr', 'Alternative', 'Verweis']);

function validateNodeStructure(node: unknown, pathLabel = '/ablauf', depth = 0): string | null {
  if (depth > 32) return `${pathLabel}: Maximale Verschachtelungstiefe überschritten.`;
  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return `${pathLabel}: Knoten muss ein JSON-Objekt sein.`;
  }
  const n = node as Record<string, unknown>;
  if (typeof n.typ !== 'string' || !VALID_NODE_TYPES.has(n.typ)) {
    return `${pathLabel}: Ungültiger oder fehlender Knotentyp „${String(n.typ ?? '')}“.`;
  }
  switch (n.typ) {
    case 'Einsatz':
      if (typeof n.baustein !== 'string' || !n.baustein.trim()) {
        return `${pathLabel}: Einsatz benötigt eine Baustein-Kennung.`;
      }
      if (n.belegung !== undefined) {
        if (!Array.isArray(n.belegung)) return `${pathLabel}: Feld „belegung“ muss ein Array sein.`;
        for (let i = 0; i < n.belegung.length; i++) {
          const bel = n.belegung[i] as Record<string, unknown> | null;
          if (!bel || typeof bel !== 'object' || typeof bel.slotKennung !== 'string') {
            return `${pathLabel}/belegung/${i}: Ungültiger Slot-Eintrag.`;
          }
          const subErr = validateNodeStructure(bel.inhalt, `${pathLabel}/belegung/${bel.slotKennung}`, depth + 1);
          if (subErr) return subErr;
        }
      }
      return null;
    case 'Sequenz':
      if (!Array.isArray(n.teile)) return `${pathLabel}: Sequenz benötigt ein Array im Feld „teile“.`;
      for (let i = 0; i < n.teile.length; i++) {
        const subErr = validateNodeStructure(n.teile[i], `${pathLabel}/teile/${i}`, depth + 1);
        if (subErr) return subErr;
      }
      return null;
    case 'Parallel': {
      const hErr = validateNodeStructure(n.haupt, `${pathLabel}/haupt`, depth + 1);
      if (hErr) return hErr;
      if (!Array.isArray(n.begleitend)) return `${pathLabel}: Parallel benötigt ein Array im Feld „begleitend“.`;
      for (let i = 0; i < n.begleitend.length; i++) {
        const subErr = validateNodeStructure(n.begleitend[i], `${pathLabel}/begleitend/${i}`, depth + 1);
        if (subErr) return subErr;
      }
      return null;
    }
    case 'Wiederkehr':
      if (typeof n.baustein !== 'string' || !n.baustein.trim()) {
        return `${pathLabel}: Wiederkehr benötigt eine Baustein-Kennung.`;
      }
      return null;
    case 'Alternative':
      if (!Array.isArray(n.optionen)) return `${pathLabel}: Alternative benötigt ein Array im Feld „optionen“.`;
      for (let i = 0; i < n.optionen.length; i++) {
        const subErr = validateNodeStructure(n.optionen[i], `${pathLabel}/optionen/${i}`, depth + 1);
        if (subErr) return subErr;
      }
      return null;
    case 'Verweis':
      if (typeof n.arrangement !== 'string' || !n.arrangement.trim()) {
        return `${pathLabel}: Verweis benötigt eine Ziel-URI im Feld „arrangement“.`;
      }
      return null;
    default:
      return `${pathLabel}: Unbekannter Knotentyp.`;
  }
}

export function importArrangementJson(
  raw: string
): { ok: true; arrangement: Arrangement } | { ok: false; fehler: string } {
  try {
    const parsed = JSON.parse(raw) as Partial<Arrangement>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, fehler: 'JSON muss ein Objekt sein.' };
    }
    if (parsed.typ !== 'Arrangement' || !parsed.ablauf || typeof parsed.ablauf !== 'object' || Array.isArray(parsed.ablauf)) {
      return { ok: false, fehler: 'Erwartet wird ein FMT-Arrangement mit typ: "Arrangement" und Objekt im Feld "ablauf".' };
    }
    const structErr = validateNodeStructure(parsed.ablauf, '/ablauf');
    if (structErr) {
      return { ok: false, fehler: structErr };
    }
    return {
      ok: true,
      arrangement: {
        '@context': parsed['@context'] || 'https://w3id.org/fmt/context.jsonld',
        '@id': parsed['@id'] || 'https://w3id.org/fmt/plan/import',
        typ: 'Arrangement',
        name: parsed.name || 'Importiertes Arrangement',
        reichweite: parsed.reichweite || 'r3',
        zieltyp: parsed.zieltyp,
        kontext: parsed.kontext && typeof parsed.kontext === 'object' && !Array.isArray(parsed.kontext) ? parsed.kontext : {},
        ablauf: parsed.ablauf
      }
    };
  } catch (e) {
    return { ok: false, fehler: 'Ungültiges JSON: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

export interface ExportOptions {
  fach?: string;
  thema?: string;
  didaktischerAnsatz?: string;
  lehrkraefteInfo?: string;
  lernziele?: string;
  problemstellung?: string;
  kiAusarbeitung?: string | null;
  timelineSvg?: string | null;
  machineReadableJson?: string | null;
  includeMachineReadableInMd?: boolean;
  groups?: Array<{
    id: string;
    label: string;
    count?: number;
    active: boolean;
    personaId?: string;
    matrixValues?: Record<string, string>;
  }>;
  maxTechnik?: string;
  ohneInternet?: boolean;
  ohneKI?: boolean;
  thematicRows?: Array<{
    key: string;
    orderLabel: string;
    phaseLabel: string;
    durationMin: number;
    methodId: string;
    methodName: string;
    methodProcedure?: string;
    teacherAction: string;
    learnerAction: string;
    groupAdaptations: Record<string, string>;
    materialsAndOer: string;
  }>;
  generatedMaterials?: Array<{ stepKey: string; title: string; materialType: string; content: string }>;
  separateMaterialPagesInHtml?: boolean;
  scenarioRows?: Array<{
    key?: string;
    orderLabel: string;
    phaseLabel: string;
    durationMin: number;
    methodName: string;
    methodRange: string;
    methodUrl: string;
    teacherRole: string;
    learnerRole: string;
    socialForm: string;
    differentiation: Array<{ groupLabel: string; measure: string }>;
    subgroupMethods?: Record<string, { methodId: string; methodName: string; methodUrl: string }>;
    oerResources: Array<{ title: string; url: string; wwwurl?: string; license?: string | null; note?: string }>;
  }>;
}

export function collectUsedBlocks(arr: Arrangement, blocksById: Map<string, Baustein>): Baustein[] {
  const seen = new Set<string>();
  const ordered: Baustein[] = [];
  const visit = (node: ArrangementNode | undefined) => {
    if (!node || typeof node !== 'object') return;
    if (node.typ === 'Einsatz' || node.typ === 'Wiederkehr') {
      if (!seen.has(node.baustein)) {
        seen.add(node.baustein);
        const b = blocksById.get(node.baustein);
        if (b) ordered.push(b);
      }
      if (node.typ === 'Einsatz' && Array.isArray(node.belegung)) {
        node.belegung.forEach((bel) => visit(bel.inhalt));
      }
    } else if (node.typ === 'Sequenz' && Array.isArray(node.teile)) {
      node.teile.forEach(visit);
    } else if (node.typ === 'Parallel') {
      visit(node.haupt);
      if (Array.isArray(node.begleitend)) node.begleitend.forEach(visit);
    } else if (node.typ === 'Alternative' && Array.isArray(node.optionen)) {
      node.optionen.forEach(visit);
    }
  };
  visit(arr.ablauf);
  return ordered;
}

export function exportArrangementMarkdown(
  arr: Arrangement,
  blocksById: Map<string, Baustein>,
  validation: ValidationResult,
  options: ExportOptions = {}
): string {
  const { seq } = getMainSequence(arr);
  const usedBlocks = collectUsedBlocks(arr, blocksById);
  const title = options.thema ? `${arr.name} – ${options.thema}` : arr.name;
  const lines: string[] = [
    `# ${title}`,
    '',
    ...(options.fach ? [`- **Fach:** ${options.fach}`] : []),
    ...(options.thema ? [`- **Thema:** ${options.thema}`] : []),
    ...(options.didaktischerAnsatz ? [`- **Didaktischer Ansatz:** ${options.didaktischerAnsatz}`] : []),
    ...(options.lehrkraefteInfo ? [`- **Lehrkraft / Begleitung:** ${options.lehrkraefteInfo}`] : []),
    ...(options.groups?.filter((g) => g.active).length
      ? [
        `- **Lerngruppen:** ${options.groups
          .filter((g) => g.active)
          .map((g) => `${g.label}${g.count ? ` (${g.count} Pers.)` : ''}`)
          .join(' · ')}`
      ]
      : []),
    `- **Granularität / Reichweite:** ${arr.reichweite.toUpperCase()}`,
    `- **Zieltyp / Kette:** ${arr.zieltyp || 'Freier Ablauf'}`,
    `- **Gesamtdauer:** ${validation.dauerMin} min${arr.kontext?.zeitbudgetMin ? ` (Budget: ${arr.kontext.zeitbudgetMin} min)` : ''}`,
    `- **Prüfstatus (R-00..R-12):** ${validation.gueltig ? 'Gültig' : 'Ungültig'} (${validation.meldungen.filter((m) => m.schwere === 'Fehler').length} Fehler, ${validation.meldungen.filter((m) => m.schwere === 'Warnung').length} Warnungen)`,
    ...(options.lernziele?.trim() ? ['', '## Lernziele', '', options.lernziele.trim()] : []),
    ...(options.problemstellung?.trim() ? ['', '## Didaktische Ausgangslage / Problemstellung', '', options.problemstellung.trim()] : []),
    '',
    '## 1. Thematischer Verlaufsplan & Methodenanwendung'
  ];

  if (!seq.teile.length) {
    lines.push('_Noch keine Bausteine enthalten._');
  } else {
    seq.teile.forEach((node, idx) => {
      if (node.typ === 'Einsatz') {
        const b = blocksById.get(node.baustein);
        lines.push(`${idx + 1}. **${b?.name || node.baustein}** [${(b?.reichweite || '').toUpperCase()}] (${node.dauerMin ?? '?'} min)`);
        if (b?.kurzbeschreibung) lines.push(`   _${b.kurzbeschreibung}_`);
        (node.belegung || []).forEach((bel) => {
          const sl = b?.slot?.find((s) => s.kennung === bel.slotKennung);
          const innerB = bel.inhalt.typ === 'Einsatz' ? blocksById.get(bel.inhalt.baustein) : undefined;
          const innerName = innerB?.name || (bel.inhalt.typ === 'Einsatz' ? bel.inhalt.baustein : bel.inhalt.typ);
          const innerMin = bel.inhalt.typ === 'Einsatz' ? bel.inhalt.dauerMin : undefined;
          lines.push(
            `   - **Eingebetteter Block (Slot „${sl?.name || bel.slotKennung}“):** ${innerName}${innerB ? ` [${innerB.reichweite.toUpperCase()}]` : ''}${innerMin ? ` (${innerMin} min)` : ''}`
          );
        });
      } else if (node.typ === 'Alternative') {
        lines.push(`${idx + 1}. **Adaptive Alternative** (${node.kriterium || 'Verzweigung'})`);
        node.optionen.forEach((opt, oi) => {
          const name = opt.typ === 'Einsatz' ? blocksById.get(opt.baustein)?.name || opt.baustein : opt.typ;
          lines.push(`   - Option ${oi + 1}: ${name}`);
        });
      } else if (node.typ === 'Wiederkehr') {
        const b = blocksById.get(node.baustein);
        lines.push(
          `${idx + 1}. **Verteilte Wiederkehr:** ${b?.name || node.baustein} (${node.anzahl}×, Abstand ${node.abstand || 'P2D'}, je ${node.dauerMin ?? '?'} min${node.ausserhalbBudget ? ', in Folgestunden' : ''})`
        );
      } else if (node.typ === 'Verweis') {
        lines.push(`${idx + 1}. **Verweis:** ${node.arrangement}`);
      }
    });
  }

  if (arr.ablauf.typ === 'Parallel' && arr.ablauf.begleitend.length) {
    lines.push('', '### Begleitstrang (Parallel)');
    arr.ablauf.begleitend.forEach((n) => {
      if (n.typ === 'Einsatz') {
        const b = blocksById.get(n.baustein);
        lines.push(`- **${b?.name || n.baustein}** (${n.dauerMin ?? '?'} min)${b?.kurzbeschreibung ? ` – ${b.kurzbeschreibung}` : ''}`);
      }
    });
  }

  if (options.thematicRows && options.thematicRows.length) {
    const activeGroups = (options.groups || []).filter((g) => g.active);
    const cleanCell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');
    lines.push('', '### Thematische Verlaufstabelle (Methodisches Vorgehen, Rollen, Binnendifferenzierung & OER)', '');
    const headers = [
      '#',
      'Phase & FMT-Methode',
      'Zeit',
      'Methodisches Vorgehen (am Thema)',
      'Lehrkraft',
      'Lernende',
      ...(activeGroups.length ? ['Binnendifferenzierung / Teilgruppen'] : []),
      'Materialien & WLO-OER (inkl. wwwurl)'
    ];
    lines.push(`| ${headers.join(' | ')} |`);
    lines.push(`|${headers.map((_, i) => (i === 2 ? '---:' : '---')).join('|')}|`);
    for (const tr of options.thematicRows) {
      const scRow = options.scenarioRows?.find((sr) => sr.key === tr.key || sr.orderLabel === tr.orderLabel);
      const mLink = scRow?.methodUrl?.startsWith('http')
        ? `[${cleanCell(tr.methodName)}](${scRow.methodUrl})`
        : cleanCell(tr.methodName);
      const diffTxt = activeGroups
        .map((g) => {
          const val = tr.groupAdaptations[g.id] || tr.groupAdaptations[g.label];
          const alt = scRow?.subgroupMethods?.[g.id];
          const altStr = alt ? ` *(Alternativ-Methode: ${cleanCell(alt.methodName)})*` : '';
          return val || altStr ? `**${cleanCell(g.label)}:** ${cleanCell(val || '')}${altStr}` : '';
        })
        .filter(Boolean)
        .join(' · ');
      const oerLinks = (scRow?.oerResources || [])
        .map((o) => {
          const href = o.wwwurl || o.url;
          return `[${cleanCell(o.title)}](${href}) (\`${href}\`)`;
        })
        .join(' · ');
      const matCell = oerLinks
        ? `${cleanCell(tr.materialsAndOer)} · ${oerLinks}`
        : cleanCell(tr.materialsAndOer);
      const cols = [
        cleanCell(tr.orderLabel),
        `${cleanCell(tr.phaseLabel)} – ${mLink}`,
        `${tr.durationMin} min`,
        cleanCell(tr.methodProcedure || '–'),
        cleanCell(tr.teacherAction),
        cleanCell(tr.learnerAction),
        ...(activeGroups.length ? [diffTxt || '–'] : []),
        matCell || '–'
      ];
      lines.push(`| ${cols.join(' | ')} |`);
    }
  } else if (options.scenarioRows && options.scenarioRows.length) {
    lines.push('', '### Verlaufsplan (IMS-LD Akteur- & Differenzierungstabelle)', '');
    lines.push('| # | Phase | Zeit | FMT-Methode (Datenbank) | Rolle Lehrkraft | Rolle Lernende | Binnendifferenzierung & OER (wwwurl) |');
    lines.push('|---|---|---:|---|---|---|---|');
    const cleanCell = (s: string) => s.replace(/\|/g, '/').replace(/\n/g, ' ');
    for (const r of options.scenarioRows) {
      const mLink = r.methodUrl.startsWith('http')
        ? `[${cleanCell(r.methodName)} (${r.methodRange})](${r.methodUrl})`
        : `${cleanCell(r.methodName)} (${r.methodRange})`;
      const altEntries = r.subgroupMethods
        ? Object.entries(r.subgroupMethods).map(([gid, alt]) => {
            const gLabel = options.groups?.find((g) => g.id === gid)?.label || gid;
            return `**${cleanCell(gLabel)} (Alternativ-Methode):** ${cleanCell(alt.methodName)}`;
          })
        : [];
      const diffTxt = [
        ...r.differentiation.map((d) => `**${cleanCell(d.groupLabel)}:** ${cleanCell(d.measure)}`),
        ...altEntries
      ].join(' · ');
      const oerTxt = r.oerResources
        .map((o) => {
          const href = o.wwwurl || o.url;
          return `[OER: ${cleanCell(o.title)}](${href}) (${href})`;
        })
        .join(' · ');
      const extra = [diffTxt, oerTxt].filter(Boolean).join(' · ') || '–';
      lines.push(
        `| ${cleanCell(r.orderLabel)} | ${cleanCell(r.phaseLabel)} | ${r.durationMin} min | ${mLink} | ${cleanCell(r.teacherRole)} | ${cleanCell(r.learnerRole)} | ${extra} |`
      );
    }
  }

  // Dedicated UDL Basis & Zielkonflikte summary in Markdown / HTML-Handout / Word-Doc when 2+ groups are active
  const activeDiffGroups = (options.groups || []).filter((g) => g.active);
  if (activeDiffGroups.length >= 2) {
    const synth = computeMultiGroupSynthesis(
      activeDiffGroups.map((g) => ({
        id: g.id,
        label: g.label,
        count: g.count,
        personaId: g.personaId,
        selectedValues: g.matrixValues
      })),
      {
        maxTechnik: options.maxTechnik,
        ohneInternet: options.ohneInternet,
        ohneKI: options.ohneKI
      }
    );
    if (synth.udlBasis.length || synth.konflikte.length) {
      lines.push('', '### Binnendifferenzierung: Gemeinsame Basis (UDL) & Zielkonflikte', '');
      if (synth.udlBasis.length) {
        lines.push('**Gemeinsame Basis für alle Teilgruppen (UDL):**');
        for (const u of synth.udlBasis.slice(0, 5)) {
          lines.push(`- **${u.name}** (Passung ≥ +${u.minNormalizedScore} %): ${u.meta.umsetzungsimpuls}`);
        }
        lines.push('');
      }
      if (synth.konflikte.length) {
        lines.push('**Erkannte Zielkonflikte & Auflösungsstrategien:**');
        for (const k of synth.konflikte.slice(0, 4)) {
          lines.push(`- **${k.measureName}:** ${k.aufloesungsstrategie}`);
        }
        lines.push('');
      }
    }
  }

  if (options.kiAusarbeitung && options.kiAusarbeitung.trim()) {
    lines.push('', '## 2. Ausformulierte Stunden- / Reihenbeschreibung', '', options.kiAusarbeitung.trim());
  }

  if (options.generatedMaterials && options.generatedMaterials.length && !options.separateMaterialPagesInHtml) {
    lines.push('', '## Erstellte Unterrichtsmaterialien');
    for (const mat of options.generatedMaterials) {
      lines.push('', `### ${mat.title}`, '', mat.content.trim());
    }
  }

  // Dedicated WLO-OER directory with explicit wwwurl for every attached resource
  const allOers = (options.scenarioRows || []).flatMap((r) =>
    r.oerResources.map((o) => ({ phase: `${r.orderLabel} ${r.phaseLabel}`, ...o }))
  );
  if (allOers.length) {
    lines.push('', '## Verknüpfte OER-Ressourcen (WirLernenOnline – inkl. wwwurl)');
    for (const o of allOers) {
      const href = o.wwwurl || o.url;
      lines.push(
        `- **${o.phase}:** [${o.title}](${href}) – wwwurl: \`${href}\`${o.license ? ` (${o.license})` : ''}${o.note ? ` · _${o.note}_` : ''}`
      );
    }
  }

  if (usedBlocks.length) {
    lines.push('', `## ${options.kiAusarbeitung ? '3' : '2'}. Eingesetzte Methoden & Durchführungshinweise`);
    for (const b of usedBlocks) {
      lines.push('', `### ${b.name} (${b.reichweite.toUpperCase()}, ${b.dauerMin}–${b.dauerMax} min)`);
      lines.push(b.kurzbeschreibung);
      if (b.durchfuehrung.length) {
        lines.push('**Durchführung:**');
        b.durchfuehrung.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
      }
      if (b.material?.length) lines.push(`- **Material:** ${b.material.join(', ')}`);
      if (b.kernkomponente?.length) {
        lines.push(`- **Kernkomponenten (R-10):** ${b.kernkomponente.map((k) => k.name).join('; ')}`);
      }
      if (b.qualitaetsrisiko?.length) {
        lines.push(`- **Qualitätsrisiken:** ${b.qualitaetsrisiko.join('; ')}`);
      }
      if (b.evidenz?.length) {
        b.evidenz.forEach((ev) => {
          lines.push(`- **Evidenz (Grad ${ev.grad}):** ${ev.befund} (${ev.quelle}; Geltung: ${ev.geltung})`);
        });
      }
    }
  }

  if (validation.meldungen.length) {
    lines.push('', '## Prüfmeldungen (R-00 bis R-12)');
    validation.meldungen.forEach((m) => {
      lines.push(`- **${m.regel} (${m.schwere}, Grundlage: ${m.grundlage}):** ${m.meldung}`);
    });
  }

  if (usedBlocks.length) {
    lines.push('', '## Quellenverzeichnis zu den verwendeten Methoden');
    const seenUrls = new Set<string>();
    for (const b of usedBlocks) {
      for (const q of b.quellen || []) {
        const key = `${b.kennung}:${q.url || q.titel}`;
        if (seenUrls.has(key)) continue;
        seenUrls.add(key);
        const link = q.url ? `[${q.titel}](${q.url})` : q.titel;
        lines.push(`- **${b.name}:** ${link}${q.lizenz ? ` (${q.lizenz})` : ''}`);
      }
    }
  }

  if (options.includeMachineReadableInMd && options.machineReadableJson) {
    lines.push('', '## Maschinenlesbare Repräsentation (IMS-LD / FMT JSON-LD)', '', '```json', options.machineReadableJson, '```');
  }

  lines.push(
    '',
    '---',
    '_Erstellt mit der Facettierten Methodentaxonomie (FMT), Jan Schachtschabel, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)._'
  );
  return lines.join('\n');
}

function markdownToCleanHtml(md: string): string {
  // Use native MathML output in standalone print/PDF/Word documents so formulas render
  // offline in every modern browser & Word/LibreOffice without external font files.
  return markdownToHtml(md, { mathOutput: 'mathml' });
}

export function exportArrangementHtmlHandout(
  arr: Arrangement,
  blocksById: Map<string, Baustein>,
  validation: ValidationResult,
  options: ExportOptions = {}
): string {
  const md = exportArrangementMarkdown(arr, blocksById, validation, { ...options, separateMaterialPagesInHtml: true });
  const htmlBody = markdownToCleanHtml(md);
  const title = options.thema ? `${arr.name} – ${options.thema}` : arr.name;
  const svgSection = options.timelineSvg
    ? `<section class="svg-box"><h2>Visuelles Zeitband &amp; Schachtelung</h2>${options.timelineSvg}</section>`
    : '';
  const materialPagesHtml = (options.generatedMaterials || [])
    .map(
      (mat, idx) =>
        `<section class="material-page"><div class="material-page-header">Unterrichtsmaterial ${idx + 1} · ${escHtml(title)}</div><h1>${escHtml(mat.title)}</h1>${markdownToCleanHtml(mat.content)}</section>`
    )
    .join('\n');
  const jsonLdScript = options.machineReadableJson
    ? `<script type="application/ld+json">${options.machineReadableJson.replace(/<\/script/gi, '<\\/script')}</script>`
    : '';
  const embeddedProjectJson = JSON.stringify({
    '@type': 'FmtScenarioProject',
    schemaVersion: '1.4',
    title,
    fach: options.fach || '',
    thema: options.thema || '',
    lernziele: options.lernziele || '',
    problemstellung: options.problemstellung || '',
    didaktischerAnsatz: options.didaktischerAnsatz || '',
    lehrkraefteInfo: options.lehrkraefteInfo || '',
    arrangement: arr,
    groups: options.groups || [],
    thematicRows: options.thematicRows || null,
    generatedMaterials: options.generatedMaterials || [],
    elaboration: options.kiAusarbeitung || null
  }).replace(/<\/script/gi, '<\\/script');
  const projectScript = `<script id="fmt-scenario-project" type="application/json">${embeddedProjectJson}</script>`;

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(title)}</title>
  ${jsonLdScript}
  ${projectScript}
  <style>
    @page { size: A4; margin: 16mm 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Georgia, "Times New Roman", serif; color: #14212E; background: #fff; max-width: 960px; margin: 24px auto; padding: 0 20px; line-height: 1.52; font-size: 10.5pt; }
    h1, h2, h3 { font-family: "Barlow Semi Condensed", "Segoe UI", Arial, sans-serif; color: #14212E; margin-top: 1.25em; margin-bottom: 0.45em; break-after: avoid; page-break-after: avoid; }
    h1 { font-size: 19pt; border-bottom: 2.5px solid #2C5D8A; padding-bottom: 6px; margin-top: 0; }
    h2 { font-size: 13.5pt; border-bottom: 1px solid #C6D0C9; padding-bottom: 3px; color: #2C5D8A; }
    h3 { font-size: 11.5pt; color: #1F3E2E; }
    .svg-box { margin: 14px 0 18px; padding: 12px; border: 1px solid #C6D0C9; border-radius: 6px; background: #FAFBFA; break-inside: avoid; page-break-inside: avoid; }
    .svg-box h2 { margin-top: 0; }
    .svg-box svg { width: 100%; height: auto; display: block; }
    .material-page { margin-top: 28px; padding-top: 14px; border-top: 2px dashed #2C5D8A; break-before: page; page-break-before: always; break-after: page; page-break-after: always; }
    .material-page-header { font-family: "Barlow Semi Condensed", Arial, sans-serif; font-size: 9pt; color: #4A5864; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px; }
    .after-materials { break-before: page; page-break-before: always; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 9pt; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; page-break-inside: avoid; }
    th, td { border: 1px solid #C6D0C9; padding: 6px 8px; text-align: left; vertical-align: top; }
    th { background: #EEF2EE; font-family: "Barlow Semi Condensed", Arial, sans-serif; font-weight: 700; }
    ul, ol { margin: 6px 0 10px; padding-left: 20px; }
    li { margin: 3px 0; }
    a { color: #2C5D8A; text-decoration: underline; }
    code { background: #EEF2EE; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
    pre { background: #F5F7F5; border: 1px solid #C6D0C9; border-radius: 5px; padding: 10px 12px; overflow-x: auto; font-size: 9pt; }
    pre code { background: none; padding: 0; }
    blockquote { margin: 10px 0; padding: 8px 14px; border-left: 3px solid #2C5D8A; background: #F5F8FA; color: #243442; }
    .math-display { margin: 10px 0; text-align: center; overflow-x: auto; }
    .math-inline math { font-size: 1.04em; }
    .md-task-item { list-style: none; margin-left: -14px; }
    hr { border: none; border-top: 1px solid #C6D0C9; margin: 18px 0; }
    @media print {
      body { margin: 0; padding: 0; max-width: none; }
      a { color: #14212E; }
      .material-page { margin-top: 0; padding-top: 0; border-top: none; }
    }
  </style>
</head>
<body>
${svgSection}
${htmlBody}
${materialPagesHtml}
</body>
</html>`;
}

export function exportArrangementWordDoc(
  arr: Arrangement,
  blocksById: Map<string, Baustein>,
  validation: ValidationResult,
  options: ExportOptions = {}
): string {
  // Word & LibreOffice Writer open HTML wrapped with Word XML namespaces cleanly as editable .doc
  const md = exportArrangementMarkdown(arr, blocksById, validation, { ...options, separateMaterialPagesInHtml: true });
  const htmlBody = markdownToCleanHtml(md);
  const title = options.thema ? `${arr.name} – ${options.thema}` : arr.name;
  const materialPagesHtml = (options.generatedMaterials || [])
    .map(
      (mat, idx) =>
        `<section class="material-page"><p class="material-page-header">Unterrichtsmaterial ${idx + 1} · ${escHtml(title)}</p><h1>${escHtml(mat.title)}</h1>${markdownToCleanHtml(mat.content)}</section>`
    )
    .join('\n');
  return `\uFEFF<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40" lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(title)}</title>
  <style>
    body { font-family: Calibri, Arial, sans-serif; color: #14212E; font-size: 11pt; line-height: 1.45; }
    h1 { color: #2C5D8A; font-size: 18pt; border-bottom: 1.5pt solid #2C5D8A; padding-bottom: 4pt; }
    h2 { color: #2C5D8A; font-size: 13pt; margin-top: 14pt; }
    h3 { color: #1F3E2E; font-size: 11.5pt; margin-top: 10pt; }
    .material-page { page-break-before: always; break-before: page; page-break-after: always; break-after: page; }
    .material-page-header { font-size: 9pt; color: #4A5864; text-transform: uppercase; }
    table { border-collapse: collapse; width: 100%; margin: 8pt 0; font-size: 9.5pt; }
    th, td { border: 1pt solid #C6D0C9; padding: 5pt; vertical-align: top; }
    th { background: #EEF2EE; font-weight: bold; }
  </style>
</head>
<body>
${htmlBody}
${materialPagesHtml}
</body>
</html>`;
}

export function exportMarkdownToPrintableHtml(title: string, markdown: string): string {
  const htmlBody = markdownToCleanHtml(markdown);
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(title)}</title>
  <style>
    @page { size: A4; margin: 18mm 16mm; }
    body { font-family: Georgia, "Times New Roman", serif; color: #14212E; background: #fff; max-width: 820px; margin: 20px auto; padding: 0 20px; line-height: 1.55; font-size: 11pt; }
    h1, h2, h3 { font-family: "Barlow Semi Condensed", Arial, sans-serif; color: #14212E; break-after: avoid; }
    h1 { font-size: 18pt; border-bottom: 2px solid #2C5D8A; padding-bottom: 6px; margin-top: 0; }
    h2 { font-size: 13pt; color: #2C5D8A; margin-top: 1.2em; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 10pt; }
    th, td { border: 1px solid #C6D0C9; padding: 6px 8px; text-align: left; }
    th { background: #EEF2EE; }
    ul, ol { margin: 6px 0 10px; padding-left: 22px; }
    li { margin: 4px 0; }
    code { background: #EEF2EE; padding: 1px 4px; border-radius: 3px; font-size: 0.9em; }
    blockquote { margin: 8px 0; padding: 6px 12px; border-left: 3px solid #2C5D8A; background: #F5F8FA; }
    .math-display { margin: 10px 0; text-align: center; }
    @media print { body { margin: 0; padding: 0; max-width: none; } }
  </style>
</head>
<body>
${htmlBody}
</body>
</html>`;
}

function clipCompact(text: string, maxChars: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= maxChars) return clean;
  const cut = clean.slice(0, maxChars - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > maxChars * 0.65 ? cut.slice(0, lastSpace) : cut}…`;
}

/**
 * Generates a crisp, teacher-ready 1-page A4 Portrait cheat-sheet ("Kurzablauf / Pultvorlage")
 * with a clean non-overlapping timeline strip, readable 4-column table, and a dedicated
 * Materials & WLO-OER source box directly below the table on Page 1.
 * Any generated classroom materials follow automatically on isolated A4 handout pages (Page 2+).
 */
export function exportArrangementOnePageSheet(
  arr: Arrangement,
  blocksById: Map<string, Baustein>,
  validation: ValidationResult,
  options: ExportOptions = {}
): string {
  const title = options.thema ? `${options.fach ? `${options.fach}: ` : ''}${options.thema}` : arr.name;
  const activeGroups = (options.groups || []).filter((g) => g.active);
  const totalLearners = activeGroups.reduce((s, g) => s + (g.count || 0), 0);

  const thematicRows = options.thematicRows?.length ? options.thematicRows : null;
  const scenarioRows = options.scenarioRows?.length ? options.scenarioRows : [];

  type CompactRow = {
    orderLabel: string;
    durationMin: number;
    phaseLabel: string;
    methodName: string;
    procedure: string;
    teacher: string;
    learner: string;
    diffLines: string[];
    material: string;
  };

  const genMats = options.generatedMaterials || [];
  const rows: CompactRow[] = thematicRows
    ? thematicRows.map((tr) => {
      const scRow = scenarioRows.find((r) => r.key === tr.key);
      const diffLines = activeGroups
        .map((g) => {
          const val = tr.groupAdaptations[g.id];
          const alt = scRow?.subgroupMethods?.[g.id];
          if (!val && !alt) return '';
          const shortLabel = g.label.split(/[\s&(]/)[0] || g.label;
          const altNote = alt ? ` → Alt.: ${alt.methodName}` : '';
          return `**${shortLabel}:** ${val || ''}${altNote}`;
        })
        .filter(Boolean);
      const oerNames = (scRow?.oerResources || []).map((o) => `🌐 ${o.title}`);
      const matNames = genMats.filter((m) => m.stepKey === tr.key).map((m) => `📝 ${m.title}`);
      const matSummary = [...matNames, ...oerNames].length
        ? [...matNames, ...oerNames].join(' · ')
        : tr.materialsAndOer;
      return {
        orderLabel: tr.orderLabel,
        durationMin: tr.durationMin,
        phaseLabel: tr.phaseLabel,
        methodName: tr.methodName,
        procedure: tr.methodProcedure || tr.methodName,
        teacher: tr.teacherAction,
        learner: tr.learnerAction,
        diffLines,
        material: matSummary || '–'
      };
    })
    : scenarioRows.length
      ? scenarioRows.map((r) => {
        const matNames = r.key ? genMats.filter((m) => m.stepKey === r.key).map((m) => `📝 ${m.title}`) : [];
        return {
          orderLabel: r.orderLabel,
          durationMin: r.durationMin,
          phaseLabel: r.phaseLabel,
          methodName: r.methodName,
          procedure: `${r.methodName} (${r.socialForm})`,
          teacher: r.teacherRole,
          learner: r.learnerRole,
          diffLines: r.differentiation.map((d) => `**${d.groupLabel.split(/[\s&(]/)[0]}:** ${d.measure}`),
          material: [...matNames, ...r.oerResources.map((o) => `🌐 ${o.title}`)].join(' · ') || '–'
        };
      })
      : collectUsedBlocks(arr, blocksById).map((b, idx) => ({
        orderLabel: String(idx + 1),
        durationMin: b.dauerMin ?? 15,
        phaseLabel: `Phase ${idx + 1}`,
        methodName: b.name,
        procedure: b.durchfuehrung?.slice(0, 2).join(' → ') || b.kurzbeschreibung || '',
        teacher: b.kurzbeschreibung || '',
        learner: '',
        diffLines: [],
        material: b.material?.slice(0, 2).join(', ') || '–'
      }));

  const n = rows.length;
  // A4 Portrait gives 277mm usable height: generous, crisp typography with clean wrapping and zero wasted bottom half
  const fontPt = n <= 6 ? 8.3 : n <= 9 ? 7.6 : n <= 12 ? 7.0 : 6.4;
  const cellPad = n <= 6 ? '5px 6px' : n <= 9 ? '4px 5px' : '3px 4px';
  const procCap = n <= 6 ? 260 : n <= 9 ? 190 : 140;
  const roleCap = n <= 6 ? 190 : n <= 9 ? 140 : 105;
  const diffCap = n <= 6 ? 115 : n <= 9 ? 85 : 65;
  const matCap = n <= 6 ? 140 : 100;
  const showTimeline = Boolean(options.timelineSvg) && n <= 9;

  const metaBadges = [
    `⏱ ${validation.dauerMin} min`,
    `${n} Phasen`,
    options.didaktischerAnsatz || '',
    options.lehrkraefteInfo || '1 Lehrkraft',
    totalLearners ? `${totalLearners} Lernende` : ''
  ]
    .filter(Boolean)
    .join(' · ');

  const goalsLine = options.lernziele?.trim()
    ? `<div class="goals"><strong>Lernziele:</strong> ${renderInlineMarkdownHtml(clipCompact(options.lernziele, 260), 'mathml')}</div>`
    : '';

  const udlPrintBoxHtml = (() => {
    if (activeGroups.length < 2) return '';
    const synth = computeMultiGroupSynthesis(
      activeGroups.map((g) => ({
        id: g.id,
        label: g.label,
        count: g.count,
        personaId: g.personaId,
        selectedValues: g.matrixValues
      })),
      {
        maxTechnik: options.maxTechnik,
        ohneInternet: options.ohneInternet,
        ohneKI: options.ohneKI
      }
    );
    const udlList = synth.udlBasis.slice(0, 3).map((u) => `${escHtml(u.name)}`).join(' · ');
    const conflictNote = synth.konflikte[0]
      ? ` &nbsp;|&nbsp; <strong>Konflikt-Lösung (${escHtml(synth.konflikte[0].measureName)}):</strong> ${escHtml(clipCompact(synth.konflikte[0].aufloesungsstrategie, 130))}`
      : '';
    if (!udlList && !conflictNote) return '';
    return `<div class="goals"><strong>UDL-Basis (${activeGroups.length} Gruppen):</strong> ${udlList}${conflictNote}</div>`;
  })();

  const allOer = scenarioRows.flatMap((r) =>
    safeOerList(r.oerResources).map((o) => ({
      phase: `${r.orderLabel} · ${r.methodName}`,
      title: o.title,
      href: o.wwwurl || o.url || '',
      license: o.license || ''
    }))
  );
  const uniqueOer = allOer.filter((o, i, arrO) => arrO.findIndex((x) => x.href === o.href) === i);

  const sourceItemsHtml: string[] = [];
  if (genMats.length > 0) {
    for (const [mi, m] of genMats.entries()) {
      const scRow = scenarioRows.find((r) => r.key === m.stepKey);
      sourceItemsHtml.push(
        `<li><strong>Anlage ${mi + 1} (eigene Druckseite):</strong> ${escHtml(m.title)}${scRow ? ` <em>(${escHtml(scRow.orderLabel)} · ${escHtml(scRow.methodName)})</em>` : ''}</li>`
      );
    }
  }
  for (const o of uniqueOer.slice(0, 6)) {
    sourceItemsHtml.push(
      `<li><strong>WLO-OER (${escHtml(o.phase)}):</strong> ${escHtml(o.title)}${o.license ? ` (${escHtml(o.license)})` : ''}${o.href ? ` — <a href="${escHtml(o.href)}">${escHtml(o.href)}</a>` : ''}</li>`
    );
  }
  const sourcesBoxHtml = sourceItemsHtml.length
    ? `<section class="sources-box"><h2>Materialien, Anlagen &amp; WLO-OER-Quellen</h2><ul>${sourceItemsHtml.join('')}</ul></section>`
    : '';

  // Optional isolated printable pages for attached generated materials (Page 2+)
  const materialPagesHtml = genMats
    .map(
      (mat, idx) =>
        `<section class="material-page"><div class="material-page-header">Anlage ${idx + 1} (Arbeitsblatt / Zusatzmaterial) · ${escHtml(title)}</div><h1>${escHtml(mat.title)}</h1>${markdownToCleanHtml(mat.content)}</section>`
    )
    .join('\n');

  const rowsHtml = rows
    .map((r) => {
      const roleParts = [
        r.teacher ? `<div><strong>LK:</strong> ${renderInlineMarkdownHtml(clipCompact(r.teacher, roleCap), 'mathml')}</div>` : '',
        r.learner ? `<div><strong>SuS:</strong> ${renderInlineMarkdownHtml(clipCompact(r.learner, roleCap), 'mathml')}</div>` : ''
      ]
        .filter(Boolean)
        .join('');
      const diffHtml = r.diffLines.length
        ? r.diffLines
          .map((dl) => `<div class="diff-line">${renderInlineMarkdownHtml(clipCompact(dl, diffCap), 'mathml')}</div>`)
          .join('')
        : '–';
      return `<tr>
        <td class="col-num"><strong>${escHtml(r.orderLabel)}</strong><div class="dur">${r.durationMin}′</div></td>
        <td class="col-method"><div class="phase-lbl">${escHtml(clipCompact(r.phaseLabel, 54))}</div><strong>${escHtml(r.methodName)}</strong></td>
        <td class="col-flow">
          <div class="proc">${renderInlineMarkdownHtml(clipCompact(r.procedure, procCap), 'mathml')}</div>
          ${roleParts ? `<div class="roles">${roleParts}</div>` : ''}
        </td>
        <td class="col-diff">
          ${diffHtml}
          ${r.material && r.material !== '–' ? `<div class="mat-line"><strong>Material:</strong> ${renderInlineMarkdownHtml(clipCompact(r.material, matCap), 'mathml')}</div>` : ''}
        </td>
      </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>Kurzablauf (1 A4) – ${escHtml(title)}</title>
  <style>
    @page { size: A4 portrait; margin: 9mm 10mm; }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; color: #14212E; font-family: "Segoe UI", Arial, sans-serif; }
    .one-page-sheet {
      width: 100%;
      max-width: 190mm;
      max-height: 277mm;
      margin: 0 auto;
      padding: 6px 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      overflow: hidden;
    }
    .sheet-head {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      gap: 8px;
      flex-wrap: wrap;
      border-bottom: 2px solid #2C5D8A;
      padding-bottom: 4px;
    }
    .sheet-head h1 {
      margin: 0;
      font-family: "Barlow Semi Condensed", "Segoe UI", Arial, sans-serif;
      font-size: 13.5pt;
      color: #14212E;
    }
    .sheet-meta {
      font-size: 8pt;
      color: #3B4A57;
    }
    .goals {
      font-size: 8pt;
      line-height: 1.32;
      color: #243442;
      background: #F4F7F5;
      border-left: 3px solid #2C5D8A;
      padding: 3px 7px;
    }
    .mini-svg {
      border: 1px solid #D3DCD6;
      border-radius: 4px;
      padding: 4px 6px;
      background: #FAFBFA;
      flex-shrink: 0;
      overflow: hidden;
    }
    .mini-svg svg {
      width: 100%;
      height: auto;
      max-height: 76px;
      display: block;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
      font-size: ${fontPt}pt;
      line-height: 1.28;
    }
    th, td {
      border: 1px solid #C6D0C9;
      padding: ${cellPad};
      vertical-align: top;
      text-align: left;
      overflow-wrap: break-word;
    }
    th {
      background: #EEF2EE;
      font-family: "Barlow Semi Condensed", "Segoe UI", Arial, sans-serif;
      font-weight: 700;
      font-size: ${Math.max(fontPt, 7.5)}pt;
    }
    tr { break-inside: avoid; page-break-inside: avoid; }
    .col-num { width: 7%; text-align: center; white-space: nowrap; }
    .col-num .dur { font-size: ${Math.max(fontPt - 0.5, 6.2)}pt; color: #2C5D8A; font-weight: 700; }
    .col-method { width: 20%; }
    .phase-lbl { font-size: ${Math.max(fontPt - 0.8, 6)}pt; color: #4A5864; margin-bottom: 1px; }
    .col-flow { width: 41%; }
    .col-flow .proc { margin-bottom: 3px; }
    .col-flow .roles { border-top: 1px dashed #D5DDD8; padding-top: 2px; color: #243442; }
    .col-diff { width: 32%; }
    .diff-line { margin-bottom: 2px; }
    .mat-line { margin-top: 3px; padding-top: 2px; border-top: 1px dashed #D5DDD8; color: #1B466E; }
    .sources-box {
      border: 1px solid #C6D0C9;
      border-radius: 4px;
      background: #FAFBFA;
      padding: 5px 8px;
      font-size: 7.4pt;
      line-height: 1.3;
    }
    .sources-box h2 {
      margin: 0 0 3px;
      font-family: "Barlow Semi Condensed", Arial, sans-serif;
      font-size: 8.5pt;
      color: #2C5D8A;
      text-transform: uppercase;
      letter-spacing: 0.03em;
    }
    .sources-box ul { margin: 0; padding-left: 15px; }
    .sources-box li { margin: 1.5px 0; word-break: break-word; }
    .sheet-foot {
      margin-top: auto;
      padding-top: 3px;
      border-top: 1px solid #D3DCD6;
      font-size: 6.8pt;
      color: #4A5864;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    a { color: #2C5D8A; text-decoration: none; }
    .math-inline math { font-size: 1em; }
    .material-page {
      max-width: 190mm;
      margin: 18px auto 0;
      padding: 12px 8px 0;
      border-top: 2px dashed #2C5D8A;
      font-family: Georgia, "Times New Roman", serif;
      font-size: 10.5pt;
      line-height: 1.5;
      break-before: page;
      page-break-before: always;
      break-after: page;
      page-break-after: always;
    }
    .material-page h1 { font-family: "Barlow Semi Condensed", Arial, sans-serif; font-size: 17pt; border-bottom: 2px solid #2C5D8A; padding-bottom: 4px; margin: 4px 0 10px; }
    .material-page h2 { font-family: "Barlow Semi Condensed", Arial, sans-serif; font-size: 12.5pt; color: #2C5D8A; margin: 12px 0 4px; }
    .material-page-header { font-family: "Barlow Semi Condensed", Arial, sans-serif; font-size: 8.5pt; color: #4A5864; text-transform: uppercase; letter-spacing: 0.04em; }
    @media print {
      .one-page-sheet { padding: 0; max-width: none; max-height: 277mm; }
      .material-page { margin: 0; padding: 0; border-top: none; max-width: none; }
      a { color: #14212E; }
    }
  </style>
</head>
<body>
  <div class="one-page-sheet">
    <header class="sheet-head">
      <h1>Kurzablauf · ${escHtml(title)}</h1>
      <div class="sheet-meta">${escHtml(metaBadges)}</div>
    </header>
    ${goalsLine}
    ${udlPrintBoxHtml}
    ${showTimeline ? `<div class="mini-svg">${options.timelineSvg}</div>` : ''}
    <table>
      <thead>
        <tr>
          <th class="col-num"># / Zeit</th>
          <th class="col-method">Phase &amp; FMT-Methode</th>
          <th class="col-flow">Methodisches Vorgehen · Lehrkraft &amp; Lernende</th>
          <th class="col-diff">Binnendifferenzierung &amp; Material</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
    ${sourcesBoxHtml}
    <footer class="sheet-foot">
      <span><strong>FMT-Kurzablauf (Pultvorlage, 1 A4-Seite${genMats.length ? ` + ${genMats.length} Material-Anlagen ab S. 2` : ''})</strong></span>
      <span>FMT · Jan Schachtschabel · CC BY 4.0</span>
    </footer>
  </div>
${materialPagesHtml}
</body>
</html>`;
}
