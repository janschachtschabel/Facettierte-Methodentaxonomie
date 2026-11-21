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

function withMainSequence(arr: Arrangement, updater: (teile: ArrangementNode[]) => ArrangementNode[]): Arrangement {
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
  kiAusarbeitung?: string | null;
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
    `- **Granularität / Reichweite:** ${arr.reichweite.toUpperCase()}`,
    `- **Zieltyp / Kette:** ${arr.zieltyp || 'Freier Ablauf'}`,
    `- **Gesamtdauer:** ${validation.dauerMin} min${arr.kontext?.zeitbudgetMin ? ` (Budget: ${arr.kontext.zeitbudgetMin} min)` : ''}`,
    `- **Prüfstatus (R-00..R-12):** ${validation.gueltig ? 'Gültig' : 'Ungültig'} (${validation.meldungen.filter((m) => m.schwere === 'Fehler').length} Fehler, ${validation.meldungen.filter((m) => m.schwere === 'Warnung').length} Warnungen)`,
    '',
    '## 1. Strukturierter Phasenablauf'
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
          `${idx + 1}. **Verteilte Wiederkehr:** ${b?.name || node.baustein} (${node.anzahl}×, Abstand ${node.abstand || 'P2D'}, je ${node.dauerMin ?? '?'} min)`
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

  if (options.kiAusarbeitung && options.kiAusarbeitung.trim()) {
    lines.push('', '## 2. Ausformulierte Stunden- / Reihenbeschreibung (KI-Entwurf)', '', options.kiAusarbeitung.trim());
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

  lines.push(
    '',
    '---',
    '_Erstellt mit der Facettierten Methodentaxonomie (FMT), Jan Schachtschabel, CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/)._'
  );
  return lines.join('\n');
}

const escHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function exportArrangementHtmlHandout(
  arr: Arrangement,
  blocksById: Map<string, Baustein>,
  validation: ValidationResult,
  options: ExportOptions = {}
): string {
  const md = exportArrangementMarkdown(arr, blocksById, validation, options);
  const htmlBody = md
    .split('\n')
    .map((line) => {
      if (line.startsWith('### ')) return `<h3>${escHtml(line.slice(4))}</h3>`;
      if (line.startsWith('## ')) return `<h2>${escHtml(line.slice(3))}</h2>`;
      if (line.startsWith('# ')) return `<h1>${escHtml(line.slice(2))}</h1>`;
      if (line === '---') return '<hr />';
      if (!line.trim()) return '';
      const formatted = escHtml(line)
        .replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/_([^_]+)_/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
      if (/^\s*[-*]\s+/.test(line)) return `<li>${formatted.replace(/^\s*[-*]\s+/, '')}</li>`;
      if (/^\s*\d+\.\s+/.test(line)) return `<li>${formatted.replace(/^\s*\d+\.\s+/, '')}</li>`;
      return `<p>${formatted}</p>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <title>${escHtml(options.thema ? `${arr.name} – ${options.thema}` : arr.name)}</title>
  <style>
    body { font-family: Georgia, serif; color: #14212E; background: #fff; max-width: 820px; margin: 32px auto; padding: 0 24px; line-height: 1.6; }
    h1, h2, h3 { font-family: "Barlow Semi Condensed", Arial, sans-serif; color: #14212E; margin-top: 1.4em; }
    h1 { border-bottom: 2px solid #2C5D8A; padding-bottom: 8px; }
    h2 { border-bottom: 1px solid #C6D0C9; padding-bottom: 4px; color: #2C5D8A; }
    li { margin: 4px 0; }
    a { color: #2C5D8A; }
    code { background: #EEF2EE; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
    hr { border: none; border-top: 1px solid #C6D0C9; margin: 24px 0; }
    @media print { body { margin: 0; } }
  </style>
</head>
<body>
${htmlBody}
</body>
</html>`;
}
