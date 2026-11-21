import {
  locate,
  type AlternativeNode,
  type Arrangement,
  type ArrangementNode,
  type Baustein,
  type CatalogBundle,
  type EinsatzNode,
  type SequenzNode,
  type ValidationResult,
  type WiederkehrNode
} from '@fmt/core';

const clone = <T>(o: T): T => JSON.parse(JSON.stringify(o)) as T;

const defaultDuration = (b: Baustein) =>
  Math.max(b.dauerMin, Math.min(b.dauerMax, Math.round((b.dauerMin + b.dauerMax) / 2 / 5) * 5));

export function getMainSequence(arr: Arrangement): { seq: SequenzNode; prefix: string } {
  if (arr.ablauf.typ === 'Parallel') {
    if (arr.ablauf.haupt.typ === 'Sequenz') return { seq: arr.ablauf.haupt, prefix: '/ablauf/haupt' };
    return { seq: { typ: 'Sequenz', teile: [arr.ablauf.haupt] }, prefix: '/ablauf/haupt' };
  }
  if (arr.ablauf.typ === 'Sequenz') return { seq: arr.ablauf, prefix: '/ablauf' };
  return { seq: { typ: 'Sequenz', teile: [arr.ablauf] }, prefix: '/ablauf' };
}

function withMainSequence(arr: Arrangement, updater: (teile: ArrangementNode[]) => ArrangementNode[]): Arrangement {
  const next = clone(arr);
  if (next.ablauf.typ === 'Parallel') {
    const cur = next.ablauf.haupt.typ === 'Sequenz' ? next.ablauf.haupt.teile : [next.ablauf.haupt];
    next.ablauf.haupt = { typ: 'Sequenz', teile: updater(cur) };
  } else if (next.ablauf.typ === 'Sequenz') {
    next.ablauf.teile = updater(next.ablauf.teile);
  } else {
    next.ablauf = { typ: 'Sequenz', teile: updater([next.ablauf]) };
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
        begleitend: [E('lerntagebuch', 20)]
      }
    };
  }

  if (zieltyp === 'prozedur') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'gering', zeitbudgetMin: 180 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('tps', 8, { kettenschritt: 'p1' }),
          E('vortrag-prompts', 25, { kettenschritt: 'p2' }),
          E('loesungsbeispiele', 35, { kettenschritt: 'p3' }),
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
    const nextBel = block
      ? [...rest, { slotKennung, inhalt: { typ: 'Einsatz' as const, baustein: block.kennung, dauerMin: defaultDuration(block) } }]
      : rest;
    copy[stepIndex] = { ...cur, belegung: nextBel.length ? nextBel : undefined };
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
  spec: { baustein: string; anzahl: number; abstand: string; dauerMin: number } | null
): Arrangement {
  return withMainSequence(arr, (teile) => {
    const without = teile.filter((t) => t.typ !== 'Wiederkehr');
    if (!spec || !spec.baustein || spec.anzahl <= 0) return without;
    const wk: WiederkehrNode = {
      typ: 'Wiederkehr',
      baustein: spec.baustein,
      anzahl: spec.anzahl,
      abstand: spec.abstand || 'P2D',
      dauerMin: spec.dauerMin
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

export function importArrangementJson(
  raw: string
): { ok: true; arrangement: Arrangement } | { ok: false; fehler: string } {
  try {
    const parsed = JSON.parse(raw) as Partial<Arrangement>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, fehler: 'JSON muss ein Objekt sein.' };
    }
    if (parsed.typ !== 'Arrangement' || !parsed.ablauf || typeof parsed.ablauf !== 'object') {
      return { ok: false, fehler: 'Erwartet wird ein FMT-Arrangement mit typ: "Arrangement" und Feld "ablauf".' };
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
        kontext: parsed.kontext || {},
        ablauf: parsed.ablauf
      }
    };
  } catch (e) {
    return { ok: false, fehler: 'Ungültiges JSON: ' + (e instanceof Error ? e.message : String(e)) };
  }
}

export function exportArrangementMarkdown(
  arr: Arrangement,
  blocksById: Map<string, Baustein>,
  validation: ValidationResult
): string {
  const { seq } = getMainSequence(arr);
  const lines: string[] = [
    `# ${arr.name}`,
    '',
    `- **Reichweite:** ${arr.reichweite.toUpperCase()}`,
    `- **Zieltyp:** ${arr.zieltyp || 'Freier Ablauf'}`,
    `- **Gesamtdauer:** ${validation.dauerMin} min${arr.kontext?.zeitbudgetMin ? ` (Budget: ${arr.kontext.zeitbudgetMin} min)` : ''}`,
    `- **Prüfstatus:** ${validation.gueltig ? 'Gültig' : 'Ungültig'} (${validation.meldungen.filter((m) => m.schwere === 'Fehler').length} Fehler, ${validation.meldungen.filter((m) => m.schwere === 'Warnung').length} Warnungen)`,
    '',
    '## Ablauf'
  ];

  if (!seq.teile.length) {
    lines.push('_Noch keine Bausteine enthalten._');
  } else {
    seq.teile.forEach((node, idx) => {
      if (node.typ === 'Einsatz') {
        const b = blocksById.get(node.baustein);
        lines.push(`${idx + 1}. **${b?.name || node.baustein}** (${node.dauerMin ?? '?'} min)`);
        (node.belegung || []).forEach((bel) => {
          const inner = bel.inhalt.typ === 'Einsatz' ? blocksById.get(bel.inhalt.baustein)?.name || bel.inhalt.baustein : bel.inhalt.typ;
          lines.push(`   - Slot \`${bel.slotKennung}\`: ${inner}`);
        });
      } else if (node.typ === 'Alternative') {
        lines.push(`${idx + 1}. **Alternative** (${node.kriterium || 'Verzweigung'})`);
        node.optionen.forEach((opt, oi) => {
          const name = opt.typ === 'Einsatz' ? blocksById.get(opt.baustein)?.name || opt.baustein : opt.typ;
          lines.push(`   - Option ${oi + 1}: ${name}`);
        });
      } else if (node.typ === 'Wiederkehr') {
        const b = blocksById.get(node.baustein);
        lines.push(`${idx + 1}. **Wiederkehr:** ${b?.name || node.baustein} (${node.anzahl}×, Abstand ${node.abstand || 'P2D'}, je ${node.dauerMin ?? '?'} min)`);
      } else if (node.typ === 'Verweis') {
        lines.push(`${idx + 1}. **Verweis:** ${node.arrangement}`);
      }
    });
  }

  if (arr.ablauf.typ === 'Parallel' && arr.ablauf.begleitend.length) {
    lines.push('', '## Begleitstrang (Parallel)');
    arr.ablauf.begleitend.forEach((n) => {
      if (n.typ === 'Einsatz') {
        const b = blocksById.get(n.baustein);
        lines.push(`- **${b?.name || n.baustein}** (${n.dauerMin ?? '?'} min)`);
      }
    });
  }

  if (validation.meldungen.length) {
    lines.push('', '## Prüfmeldungen (R-00 bis R-12)');
    validation.meldungen.forEach((m) => {
      lines.push(`- **${m.regel} (${m.schwere}, Grundlage: ${m.grundlage}):** ${m.meldung}`);
    });
  }

  lines.push(
    '',
    '---',
    '_Erstellt mit der Facettierten Methodentaxonomie (FMT), Jan Schachtschabel, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)._'
  );
  return lines.join('\n');
}
