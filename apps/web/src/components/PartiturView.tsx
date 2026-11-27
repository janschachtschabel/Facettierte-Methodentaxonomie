import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Arrangement,
  ArrangementNode,
  Baustein,
  CatalogBundle,
  FmtSearch,
  MatchRequest,
  ReplacementCandidate,
  WiederkehrNode
} from '@fmt/core';
import { nurMethoden } from '@fmt/core';
import { MethodPictogram } from './MethodPictogram.js';
import { ProfileRadarSvg } from './ProfileRadarSvg.js';
import { EvidenceBadge } from './EvidenceBadge.js';
import {
  appendBlockToArrangement,
  fitContainerDurationToSlots,
  getMainSequence,
  moveStep,
  removeStep,
  replaceNodeAtPath,
  setParallelBlock,
  setRecurrence,
  setSlotBlock,
  unwrapAlternative,
  updateAlternativeOption,
  updateAlternativeOptionDuration,
  updateSlotDuration,
  updateStepBlock,
  updateStepDuration,
  wrapStepInAlternative
} from '../planner/arrangementOps.js';
import type { ExplainedValidationMessage } from '../planner/validationHelpers.js';
import { schrittKandidaten, type WeitereRahmen } from '../planner/kandidaten.js';

interface Props {
  arrangement: Arrangement;
  onChange: (next: Arrangement) => void;
  bundle: CatalogBundle;
  blocksById: Map<string, Baustein>;
  search: FmtSearch;
  registry: Map<string, Arrangement>;
  labelOf: (schemeId: string, code: string) => string;
  explainedMessages?: ExplainedValidationMessage[];
  onOpenOerForStep?: (stepKey: string) => void;
  onOpenMaterialForStep?: (stepKey: string) => void;
  /** Situation of the plan (room, literacy, dates, time, technology); a replacement must cover its needs there. */
  situation?: MatchRequest;
  /** Frame of the page's pickers; with it the per-step and slot selects go through the core's candidate filter. */
  kandidaten?: WeitereRahmen;
}

/** Splits a select's methods by the core's check; without a frame every method counts as fitting (no situation known). */
const aufteilen = (cands: Baustein[], r: WeitereRahmen | undefined, schrittId?: string) =>
  r ? schrittKandidaten(cands, r, schrittId) : { passend: cands, ausgeschlossen: [] as Array<{ b: Baustein; grund: string }> };

/** Disabled entries for methods the core rejects here, each with its reason. */
function PasstHierNicht({ liste, aktuell }: { liste: Array<{ b: Baustein; grund: string }>; aktuell?: string }) {
  const rest = liste.filter((x) => x.b.kennung !== aktuell);
  if (!rest.length) return null;
  return (
    <optgroup label="Passt hier nicht">
      {rest.map(({ b, grund }) => (
        <option key={b.kennung} value={b.kennung} disabled>
          {b.name}: {grund}
        </option>
      ))}
    </optgroup>
  );
}

const RANGE_LABELS: Record<string, string> = {
  r1: 'R1 Interaktion',
  r2: 'R2 Szenario',
  r3: 'R3 Reihe / Container',
  r4: 'R4 Modul / Kurs'
};

function rangeBadgeStyle(r: string): React.CSSProperties {
  const bg =
    r === 'r3' || r === 'r4'
      ? 'var(--dD-soft)'
      : r === 'r2'
        ? 'var(--dA-soft)'
        : 'var(--dC-soft)';
  const border =
    r === 'r3' || r === 'r4'
      ? 'var(--dD)'
      : r === 'r2'
        ? 'var(--dA)'
        : 'var(--dC)';
  return {
    fontFamily: 'var(--display)',
    fontSize: 12,
    fontWeight: 700,
    padding: '2px 8px',
    borderRadius: 999,
    background: bg,
    border: `1px solid ${border}`,
    color: 'var(--ink)'
  };
}

function guidanceClass(b?: Baustein): string {
  if (!b) return '';
  const a = b.anleitung || [];
  if (a.includes('offen') && a.includes('explizit')) return 'guidance-mixed';
  if (a.includes('offen')) return 'guidance-offen';
  if (a.includes('geleitet')) return 'guidance-geleitet';
  return '';
}

export function PartiturView({
  arrangement,
  onChange,
  bundle,
  blocksById,
  search,
  registry,
  labelOf,
  explainedMessages = [],
  onOpenOerForStep,
  onOpenMaterialForStep,
  situation,
  kandidaten
}: Props) {
  const [swapTarget, setSwapTarget] = useState<{ pfad: string; candidates: ReplacementCandidate[] } | null>(null);
  const { seq, prefix } = getMainSequence(arrangement);
  const kette = arrangement.zieltyp ? bundle.ketten.find((k) => k.id === arrangement.zieltyp) : null;
  // Only methods can fill a phase or a slot; a help (eintragsart 'hilfe') is assigned to phases in step 3.
  const sortedBlocks = nurMethoden(bundle.bausteine).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const rangMap = new Map((bundle.schemes.find((s) => s.id === 'reichweite')?.werte || []).map((w) => [w.id, w.rang ?? 0]));

  const openSwap = (pfad: string) => {
    if (swapTarget?.pfad === pfad) {
      setSwapTarget(null);
      return;
    }
    try {
      // The core keeps methods only, binds the chain step's knowledge type and checks the needs in the situation.
      const candidates = search.ersatz(arrangement, pfad, registry, situation);
      setSwapTarget({ pfad, candidates });
    } catch {
      setSwapTarget({ pfad, candidates: [] });
    }
  };

  const applySwap = (pfad: string, cand: ReplacementCandidate) => {
    onChange(replaceNodeAtPath(arrangement, pfad, cand.baustein, cand.dauerMin));
    setSwapTarget(null);
  };

  // Pickers outside a chain step check the situation only.
  const anfuegWahl = aufteilen(sortedBlocks, kandidaten);
  const mainSteps = seq.teile.filter((t) => t && t.typ !== 'Wiederkehr');
  const wkNode = seq.teile.find((t): t is WiederkehrNode => Boolean(t) && t.typ === 'Wiederkehr') || null;
  const parBegleitend =
    arrangement.ablauf?.typ === 'Parallel' && Array.isArray(arrangement.ablauf.begleitend)
      ? arrangement.ablauf.begleitend
      : [];
  const parBlockId = parBegleitend[0]?.typ === 'Einsatz' ? parBegleitend[0].baustein : '';
  const parDuration = parBegleitend[0]?.typ === 'Einsatz' ? parBegleitend[0].dauerMin ?? 20 : 20;

  const stepIndexOf = (node: ArrangementNode) => seq.teile.indexOf(node);

  const statesOfNode = (node: ArrangementNode | undefined): string[] => {
    if (!node || typeof node !== 'object') return [];
    if (node.typ === 'Einsatz') {
      const b = blocksById.get(node.baustein);
      if (!b) return [];
      if (b.komposit) {
        return (Array.isArray(node.belegung) ? node.belegung : []).flatMap((bel) => statesOfNode(bel?.inhalt));
      }
      return b.nachbedingung || [];
    }
    if (node.typ === 'Alternative') {
      const opts = Array.isArray(node.optionen) ? node.optionen : [];
      const sets = opts.map((o) => new Set(statesOfNode(o)));
      if (!sets.length) return [];
      return [...sets[0]].filter((z) => sets.every((s) => s.has(z)));
    }
    return [];
  };

  return (
    <div className="partitur-track">
      {mainSteps.length === 0 && (
        <div className="card" style={{ padding: 20, textAlign: 'center' }}>
          <p className="muted">Der Ablauf ist aktuell leer. Füge unten einen Baustein hinzu oder lade eine Vorlage.</p>
        </div>
      )}

      {mainSteps.map((node, visIdx) => {
        const realIdx = stepIndexOf(node);
        const pfad = `${prefix}/teile/${realIdx}`;
        const chainStep = node.kettenschritt && kette ? kette.schritte.find((s) => s.id === node.kettenschritt) : null;
        const produced = [...new Set(statesOfNode(node))];
        // Options of an alternative fill the same chain step: the same core check applies.
        const altWahl = node.typ === 'Alternative' ? aufteilen(sortedBlocks, kandidaten, node.kettenschritt) : anfuegWahl;

        return (
          <div key={`${realIdx}-${visIdx}`}>
            {node.typ === 'Einsatz' && (() => {
              const b = blocksById.get(node.baustein);
              const slots = b?.slot || [];
              const vorauswahl = chainStep
                ? sortedBlocks.filter(
                    (cand) => (rangMap.get(cand.reichweite) ?? 0) <= 3 && cand.lernfunktion.some((f) => chainStep.funktion.includes(f))
                  )
                : sortedBlocks;
              // The core decides what fits here (needs in the situation, knowledge type of the chain step).
              const { passend: candsForStep, ausgeschlossen: passtNicht } = aufteilen(vorauswahl, kandidaten, node.kettenschritt);

              const stepMsgs = explainedMessages.filter((em) => em.stepIndex === realIdx);
              const hasErr = stepMsgs.some((em) => em.raw.schwere === 'Fehler');
              const usedSlotMin = (node.belegung || []).reduce(
                (acc, bel) => acc + (bel.inhalt.typ === 'Einsatz' ? bel.inhalt.dauerMin || 0 : 0),
                0
              );

              return (
                <article
                  className={`step-card ${guidanceClass(b)}`}
                  style={hasErr ? { borderColor: 'var(--err)', boxShadow: '0 0 0 1px var(--err)' } : undefined}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="range-badge">{visIdx + 1}</span>
                      {b && <MethodPictogram type={b.piktogramm} size={32} />}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 4 }}>
                          {b && <span style={rangeBadgeStyle(b.reichweite)}>{RANGE_LABELS[b.reichweite] || b.reichweite.toUpperCase()}</span>}
                          {slots.length > 0 && (
                            <span className="chip" style={{ fontSize: 11.5, padding: '1px 7px' }}>
                              ▣ Container mit {slots.length} {slots.length === 1 ? 'Slot' : 'Slots'}
                            </span>
                          )}
                          {chainStep && (
                            <span style={{ fontFamily: 'var(--display)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>
                              {chainStep.id.toUpperCase()} · {chainStep.label} (Ziel: {labelOf('lernzustand', chainStep.ziel)})
                            </span>
                          )}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <select
                            aria-label={`Baustein für Schritt ${visIdx + 1}`}
                            value={node.baustein}
                            onChange={(e) => {
                              const picked = blocksById.get(e.target.value);
                              if (picked) onChange(updateStepBlock(arrangement, realIdx, picked));
                            }}
                          >
                            {!candsForStep.some((c) => c.kennung === node.baustein) && b && (
                              <option value={b.kennung}>{b.name} ({b.reichweite.toUpperCase()})</option>
                            )}
                            {candsForStep.map((cand) => (
                              <option key={cand.kennung} value={cand.kennung}>
                                {cand.name} ({cand.reichweite.toUpperCase()})
                              </option>
                            ))}
                            <PasstHierNicht liste={passtNicht} aktuell={node.baustein} />
                          </select>
                          <label style={{ fontFamily: 'var(--display)', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number"
                              min={0}
                              style={{ width: 64 }}
                              value={node.dauerMin ?? b?.dauerMin ?? 15}
                              onChange={(e) => onChange(updateStepDuration(arrangement, realIdx, Number(e.target.value) || 0))}
                            />
                            min
                          </label>
                          {b && (
                            <span className="muted" style={{ fontSize: 12, fontFamily: 'var(--display)' }} title="Katalog-Orientierungswert (frei anpassbar)">
                              (Richtwert {b.dauerMin}–{b.dauerMax} min)
                            </span>
                          )}
                          {b && <EvidenceBadge grade={search.bestGrade(b)} />}
                          {b && (
                            <Link to={`/methoden/${b.kennung}`} className="btn btn-sm btn-ghost">
                              Profil ↗
                            </Link>
                          )}
                          {onOpenOerForStep && (
                            <button
                              type="button"
                              className="btn btn-sm btn-ghost"
                              title="In Schritt 3 wechseln: WLO-OER suchen oder Material per KI erstellen"
                              onClick={() => onOpenOerForStep(`step-${realIdx}`)}
                            >
                              🌐 OER / Material →
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      {b && <ProfileRadarSvg baustein={b} facetten={bundle.facetten} mode="mini" />}
                      <button type="button" className="btn btn-sm" onClick={() => openSwap(pfad)}>
                        ⇄ Ersatz prüfen
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        title="In adaptive Alternative (2 Zweige) umwandeln"
                        onClick={() => {
                          const alt = candsForStep.find((x) => x.kennung !== node.baustein) || sortedBlocks.find((x) => x.kennung !== node.baustein) || b;
                          if (alt) onChange(wrapStepInAlternative(arrangement, realIdx, alt));
                        }}
                      >
                        ⑂ Verzweigen
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={visIdx === 0}
                        onClick={() => {
                          const prevNode = mainSteps[visIdx - 1];
                          if (prevNode) onChange(moveStep(arrangement, realIdx, stepIndexOf(prevNode)));
                        }}
                        aria-label="Nach oben"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        disabled={visIdx === mainSteps.length - 1}
                        onClick={() => {
                          const nextNode = mainSteps[visIdx + 1];
                          if (nextNode) onChange(moveStep(arrangement, realIdx, stepIndexOf(nextNode)));
                        }}
                        aria-label="Nach unten"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => onChange(removeStep(arrangement, realIdx))}
                        aria-label="Schritt entfernen"
                      >
                        ✕
                      </button>
                    </div>
                  </div>

                  {/* Replacement Popover */}
                  {swapTarget?.pfad === pfad && (
                    <div
                      style={{
                        marginTop: 10,
                        padding: 12,
                        background: 'var(--paper)',
                        border: '1px solid var(--dA)',
                        borderRadius: 6
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <strong style={{ fontFamily: 'var(--display)' }}>
                          Formal gültige Ersatzkandidaten ({swapTarget.candidates.length})
                        </strong>
                        <button type="button" className="btn btn-sm" onClick={() => setSwapTarget(null)}>
                          Schließen
                        </button>
                      </div>
                      <p className="muted" style={{ fontSize: 13, marginBottom: 8 }}>
                        Hinweis: Ein Ersatz hält das Arrangement strukturell gültig – gleiche didaktische Wirkung ist damit nicht garantiert (Loibl et al. 2024).
                      </p>
                      {swapTarget.candidates.length === 0 ? (
                        <p className="muted" style={{ fontSize: 13.5, margin: 0 }}>
                          An dieser Stelle hält kein anderer Katalog-Baustein alle Vor- und Nachbedingungen gültig.
                        </p>
                      ) : (
                        <ul className="chips">
                          {swapTarget.candidates.slice(0, 12).map((c) => (
                            <li key={c.baustein}>
                              <button type="button" className="btn btn-sm" onClick={() => applySwap(pfad, c)}>
                                {c.name} ({c.dauerMin}m{c.warnungen.length ? `, ${c.warnungen.length} Warn.` : ''})
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}

                  {/* Embedded Slot Pockets (R3 -> R2 -> R1) */}
                  {slots.length > 0 && b && (
                    <div
                      className="slot-pockets"
                      style={{
                        marginTop: 12,
                        padding: 12,
                        background: 'var(--paper)',
                        border: '1px dashed var(--dD)',
                        borderRadius: 8
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: 8,
                          flexWrap: 'wrap',
                          marginBottom: 8,
                          fontFamily: 'var(--display)',
                          fontSize: 13
                        }}
                      >
                        <strong>
                          ▣ Teil-Blöcke innerhalb von „{b.name}“ ({b.reichweite.toUpperCase()} nimmt kleinere Reichweiten auf)
                        </strong>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <span className="muted">
                            Slot-Dauer: {usedSlotMin} / {node.dauerMin ?? b.dauerMin} min
                          </span>
                          {usedSlotMin > (node.dauerMin ?? b.dauerMin) && (
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={() => onChange(fitContainerDurationToSlots(arrangement, realIdx))}
                            >
                              ⏱ Container auf {usedSlotMin} min anpassen
                            </button>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 10 }}>
                        {slots.map((sl) => {
                          const bel = (node.belegung || []).find((x) => x.slotKennung === sl.kennung);
                          const innerId = bel && bel.inhalt.typ === 'Einsatz' ? bel.inhalt.baustein : '';
                          const innerBlock = innerId ? blocksById.get(innerId) : undefined;
                          const innerDur =
                            bel && bel.inhalt.typ === 'Einsatz'
                              ? bel.inhalt.dauerMin ?? innerBlock?.dauerMin ?? 10
                              : innerBlock?.dauerMin ?? 10;
                          const parentR = rangMap.get(b.reichweite) ?? 3;
                          const slotR = rangMap.get(sl.reichweite) ?? 2;
                          const { passend: slotCands, ausgeschlossen: slotPasstNicht } = aufteilen(
                            sortedBlocks.filter(
                              (c) =>
                                (rangMap.get(c.reichweite) ?? 0) < parentR &&
                                (rangMap.get(c.reichweite) ?? 0) <= slotR &&
                                c.lernfunktion.some((f) => sl.lernfunktion.includes(f))
                            ),
                            kandidaten
                          );
                          return (
                            <div
                              key={sl.kennung}
                              className="slot-pocket"
                              style={{
                                background: 'var(--surface)',
                                border: `1px solid ${!innerId && sl.pflicht ? 'var(--dB)' : 'var(--rule)'}`,
                                borderLeft: `3px solid ${innerBlock ? 'var(--dC)' : sl.pflicht ? 'var(--dB)' : 'var(--rule)'}`,
                                borderRadius: 6,
                                padding: 10
                              }}
                            >
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                <span style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700 }}>
                                  ↳ Teil von {b.name.replace(/ \(.*\)$/, '')}: Slot „{sl.name}“
                                </span>
                                <span style={{ fontFamily: 'var(--display)', fontSize: 11.5, color: sl.pflicht ? 'var(--dB)' : 'var(--ink-2)' }}>
                                  max. {sl.reichweite.toUpperCase()} · {sl.pflicht ? 'Pflicht' : 'optional'}
                                </span>
                              </div>
                              <select
                                aria-label={`Slot ${sl.name} in ${b.name}`}
                                style={{ width: '100%' }}
                                value={innerId}
                                onChange={(e) => {
                                  const chosen = e.target.value ? blocksById.get(e.target.value) || null : null;
                                  onChange(setSlotBlock(arrangement, realIdx, sl.kennung, chosen));
                                }}
                              >
                                <option value="">– Slot leer –</option>
                                {innerBlock && !slotCands.some((c) => c.kennung === innerId) && (
                                  <option value={innerBlock.kennung}>{innerBlock.name} ({innerBlock.reichweite.toUpperCase()})</option>
                                )}
                                {slotCands.map((c) => (
                                  <option key={c.kennung} value={c.kennung}>
                                    {c.name} ({c.reichweite.toUpperCase()})
                                  </option>
                                ))}
                                <PasstHierNicht liste={slotPasstNicht} aktuell={innerId} />
                              </select>
                              {innerBlock && (
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6, fontSize: 12.5 }}>
                                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--display)', fontWeight: 600 }}>
                                    <input
                                      type="number"
                                      min={0}
                                      aria-label={`Dauer für Slot ${sl.name}`}
                                      style={{ width: 58, padding: '2px 5px' }}
                                      value={innerDur}
                                      onChange={(e) =>
                                        onChange(updateSlotDuration(arrangement, realIdx, sl.kennung, Number(e.target.value) || 0, true))
                                      }
                                    />
                                    min
                                    <span className="muted" style={{ fontWeight: 400 }}>
                                      (Richtwert {innerBlock.dauerMin}–{innerBlock.dauerMax})
                                    </span>
                                  </label>
                                  <Link to={`/methoden/${innerBlock.kennung}`}>Profil ↗</Link>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Inline Plain-German Validation Messages + 1-Click Fixes */}
                  {stepMsgs.length > 0 && (
                    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {stepMsgs.map((em, mi) => (
                        <div
                          key={mi}
                          style={{
                            padding: '8px 10px',
                            borderRadius: 6,
                            fontSize: 13.5,
                            background: em.raw.schwere === 'Fehler' ? 'var(--dD-soft)' : 'var(--dB-soft)',
                            borderLeft: `4px solid ${em.raw.schwere === 'Fehler' ? 'var(--err)' : 'var(--dB)'}`
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <div>
                              <span className="basis-tag">
                                {em.raw.regel} · {em.raw.grundlage === 'formal' ? 'formal' : `[${em.raw.grundlage}]`}
                              </span>{' '}
                              <strong>{em.raw.schwere}:</strong> {em.raw.meldung}
                            </div>
                            {em.quickFix && (
                              <button
                                type="button"
                                className="btn btn-sm btn-primary"
                                onClick={() => onChange(em.quickFix!.apply(arrangement))}
                              >
                                ✦ {em.quickFix.label}
                              </button>
                            )}
                          </div>
                          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                            <strong>Hinweis:</strong> {em.howToFix}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })()}

            {node.typ === 'Alternative' && (
              <article className="step-card guidance-geleitet">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <span className="range-badge">{visIdx + 1}</span>{' '}
                    <strong style={{ fontFamily: 'var(--display)', fontSize: 17 }}>
                      ⑂ Adaptive Alternative {chainStep ? `· ${chainStep.label}` : ''}
                    </strong>
                    <div className="muted" style={{ fontSize: 13.5 }}>
                      Kriterium: {node.kriterium || 'Differenzierung nach Lernstand'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button type="button" className="btn btn-sm" onClick={() => onChange(unwrapAlternative(arrangement, realIdx, 0))}>
                      Zweig 1 übernehmen
                    </button>
                    <button type="button" className="btn btn-sm" onClick={() => onChange(removeStep(arrangement, realIdx))}>
                      ✕
                    </button>
                  </div>
                </div>
                <div className="alt-branches">
                  {(Array.isArray(node.optionen) ? node.optionen : []).map((opt, oi) => {
                    const optId = opt?.typ === 'Einsatz' ? opt.baustein : '';
                    const optB = optId ? blocksById.get(optId) : undefined;
                    const optDur = opt?.typ === 'Einsatz' ? opt.dauerMin ?? optB?.dauerMin ?? 15 : 15;
                    return (
                      <div key={oi} className="alt-branch">
                        <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                          Option {oi + 1}
                        </div>
                        <select
                          style={{ width: '100%' }}
                          value={optId}
                          onChange={(e) => {
                            const picked = blocksById.get(e.target.value);
                            if (picked) onChange(updateAlternativeOption(arrangement, realIdx, oi, picked));
                          }}
                        >
                          {optB && !altWahl.passend.some((c) => c.kennung === optId) && (
                            <option value={optB.kennung}>{optB.name} ({optB.reichweite.toUpperCase()})</option>
                          )}
                          {altWahl.passend.map((cand) => (
                            <option key={cand.kennung} value={cand.kennung}>
                              {cand.name} ({cand.reichweite.toUpperCase()})
                            </option>
                          ))}
                          <PasstHierNicht liste={altWahl.ausgeschlossen} aktuell={optId} />
                        </select>
                        {optB && (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, fontSize: 12.5 }}>
                            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--display)' }}>
                              <input
                                type="number"
                                min={0}
                                style={{ width: 58, padding: '2px 5px' }}
                                value={optDur}
                                onChange={(e) =>
                                  onChange(updateAlternativeOptionDuration(arrangement, realIdx, oi, Number(e.target.value) || 0))
                                }
                              />
                              min <span className="muted">({optB.dauerMin}–{optB.dauerMax})</span>
                            </label>
                            <Link to={`/methoden/${optB.kennung}`}>Profil ↗</Link>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </article>
            )}

            {node.typ === 'Verweis' && (
              <article className="step-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <div>
                  <strong style={{ fontFamily: 'var(--display)' }}>↗ Verweis auf eingebundenes Arrangement:</strong>{' '}
                  <code>{node.arrangement}</code>
                </div>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => onChange(removeStep(arrangement, realIdx))}
                  aria-label="Verweis entfernen"
                >
                  ✕
                </button>
              </article>
            )}

            {/* Learning-State Connector to next step */}
            {produced.length > 0 && (
              <div className="step-connector" aria-label="Erzeugte Lernzustände nach diesem Schritt">
                <span>↓ liefert:</span>
                <ul className="chips">
                  {produced.map((z) => (
                    <li key={z} className="chip chip-c">
                      {labelOf('lernzustand', z)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        );
      })}

      {/* Add Step + Parallel + Wiederkehr Controls */}
      <div className="card" style={{ padding: 14, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
        <div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            + Schritt anfügen (Sequenz)
          </div>
          <select
            aria-label="Schritt anfügen"
            style={{ width: '100%' }}
            defaultValue=""
            onChange={(e) => {
              const picked = blocksById.get(e.target.value);
              if (picked) {
                onChange(appendBlockToArrangement(arrangement, picked));
                e.target.value = '';
              }
            }}
          >
            <option value="">Baustein auswählen…</option>
            {anfuegWahl.passend.map((b) => (
              <option key={b.kennung} value={b.kennung}>
                {b.name} ({b.reichweite.toUpperCase()})
              </option>
            ))}
            <PasstHierNicht liste={anfuegWahl.ausgeschlossen} />
          </select>
        </div>

        <div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            ═ Begleitstrang (Parallel)
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {(() => {
              const recommendedParallelIds = new Set([
                'kompetenzraster-checkliste',
                'kanban-lernboard',
                'klassen-glossar',
                'beobachtungsbogen',
                'lesetagebuch',
                'schuelercoaching',
                'lerntagebuch',
                'lernportfolio',
                'cornell-methode',
                'sketchnotes',
                'collective-notebook',
                'karteikarten-leitner',
                'wiki-kollaboration',
                'e-portfolio-kurs'
              ]);
              const eligible = anfuegWahl.passend.filter((b) => (rangMap.get(b.reichweite) ?? 0) <= 3);
              const recommended = eligible.filter((b) => recommendedParallelIds.has(b.kennung));
              const others = eligible.filter((b) => !recommendedParallelIds.has(b.kennung));
              return (
                <select
                  style={{ flex: 1 }}
                  value={parBlockId}
                  onChange={(e) => onChange(setParallelBlock(arrangement, e.target.value ? blocksById.get(e.target.value) || null : null, parDuration))}
                >
                  <option value="">– kein Begleitstrang –</option>
                  <optgroup label="Empfohlene Begleitmethoden (analog &amp; digital)">
                    {recommended.map((b) => (
                      <option key={b.kennung} value={b.kennung}>
                        {b.name} [{b.technik === 't-keine' ? 'analog' : 'digital'}]
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Weitere Methodenbausteine (R1–R3)">
                    {others.map((b) => (
                      <option key={b.kennung} value={b.kennung}>
                        {b.name}
                      </option>
                    ))}
                  </optgroup>
                  {parBlockId && !eligible.some((b) => b.kennung === parBlockId) && blocksById.get(parBlockId) && (
                    <option value={parBlockId}>{blocksById.get(parBlockId)!.name}</option>
                  )}
                  <PasstHierNicht liste={anfuegWahl.ausgeschlossen.filter((x) => (rangMap.get(x.b.reichweite) ?? 0) <= 3)} aktuell={parBlockId} />
                </select>
              );
            })()}
            {parBlockId && (
              <input
                type="number"
                min={0}
                title="Dauer Begleitstrang (min)"
                style={{ width: 64 }}
                value={parDuration}
                onChange={(e) =>
                  onChange(setParallelBlock(arrangement, blocksById.get(parBlockId) || null, Math.max(0, Number(e.target.value) || 0)))
                }
              />
            )}
          </div>
        </div>

        <div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            ◆ Verteilte Wiederkehr (Regel R-07)
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <select
              style={{ flex: 1, minWidth: 150 }}
              value={wkNode?.baustein || ''}
              onChange={(e) => {
                if (!e.target.value) onChange(setRecurrence(arrangement, null));
                else {
                  const b = blocksById.get(e.target.value)!;
                  onChange(
                    setRecurrence(arrangement, {
                      baustein: b.kennung,
                      anzahl: wkNode?.anzahl || 3,
                      abstand: wkNode?.abstand || 'P2D',
                      dauerMin: b.dauerMin,
                      ausserhalbBudget: wkNode
                        ? Boolean(wkNode.ausserhalbBudget)
                        : (arrangement.kontext?.zeitbudgetMin ?? 0) > 0 && (arrangement.kontext?.zeitbudgetMin ?? 0) <= 180
                    })
                  );
                }
              }}
            >
              <option value="">– keine Wiederkehr –</option>
              {wkNode && !anfuegWahl.passend.some((b) => b.kennung === wkNode.baustein) && blocksById.get(wkNode.baustein) && (
                <option value={wkNode.baustein}>{blocksById.get(wkNode.baustein)!.name}</option>
              )}
              {anfuegWahl.passend
                .filter((b) => b.reichweite === 'r1' && b.lernfunktion.includes('konsolidierung'))
                .map((b) => (
                  <option key={b.kennung} value={b.kennung}>
                    {b.name}
                  </option>
                ))}
              <PasstHierNicht
                liste={anfuegWahl.ausgeschlossen.filter((x) => x.b.reichweite === 'r1' && x.b.lernfunktion.includes('konsolidierung'))}
                aktuell={wkNode?.baustein}
              />
            </select>
            {wkNode && (
              <input
                type="number"
                min={1}
                max={12}
                style={{ width: 62 }}
                title="Anzahl Durchgänge"
                value={wkNode.anzahl}
                onChange={(e) =>
                  onChange(
                    setRecurrence(arrangement, {
                      baustein: wkNode.baustein,
                      anzahl: Math.max(1, Number(e.target.value) || 1),
                      abstand: wkNode.abstand || 'P2D',
                      dauerMin: wkNode.dauerMin || 6,
                      ausserhalbBudget: Boolean(wkNode.ausserhalbBudget)
                    })
                  )
                }
              />
            )}
          </div>
          {wkNode && (
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, marginTop: 6 }}>
              <input
                type="checkbox"
                checked={Boolean(wkNode.ausserhalbBudget)}
                onChange={(e) =>
                  onChange(
                    setRecurrence(arrangement, {
                      baustein: wkNode.baustein,
                      anzahl: wkNode.anzahl,
                      abstand: wkNode.abstand || 'P2D',
                      dauerMin: wkNode.dauerMin || 6,
                      ausserhalbBudget: e.target.checked
                    })
                  )
                }
              />
              in Folgestunden (zählt nicht zum Zeitbudget)
            </label>
          )}
        </div>
      </div>
    </div>
  );
}
