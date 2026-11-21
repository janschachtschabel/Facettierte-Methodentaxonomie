import { useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Arrangement,
  ArrangementNode,
  Baustein,
  CatalogBundle,
  FmtSearch,
  ReplacementCandidate,
  WiederkehrNode
} from '@fmt/core';
import { MethodPictogram } from './MethodPictogram.js';
import { ProfileRadarSvg } from './ProfileRadarSvg.js';
import { EvidenceBadge } from './EvidenceBadge.js';
import {
  appendBlockToArrangement,
  getMainSequence,
  moveStep,
  removeStep,
  replaceNodeAtPath,
  setParallelBlock,
  setRecurrence,
  setSlotBlock,
  unwrapAlternative,
  updateAlternativeOption,
  updateStepBlock,
  updateStepDuration,
  wrapStepInAlternative
} from '../planner/arrangementOps.js';

interface Props {
  arrangement: Arrangement;
  onChange: (next: Arrangement) => void;
  bundle: CatalogBundle;
  blocksById: Map<string, Baustein>;
  search: FmtSearch;
  registry: Map<string, Arrangement>;
  labelOf: (scheme: string, code: string) => string;
}

function guidanceClass(b?: Baustein): string {
  if (!b) return '';
  const a = b.anleitung || [];
  if (a.includes('offen') && a.includes('explizit')) return 'guidance-mixed';
  if (a.includes('offen')) return 'guidance-offen';
  if (a.includes('geleitet')) return 'guidance-geleitet';
  return '';
}

export function PartiturView({ arrangement, onChange, bundle, blocksById, search, registry, labelOf }: Props) {
  const [swapTarget, setSwapTarget] = useState<{ pfad: string; candidates: ReplacementCandidate[] } | null>(null);
  const { seq, prefix } = getMainSequence(arrangement);
  const kette = arrangement.zieltyp ? bundle.ketten.find((k) => k.id === arrangement.zieltyp) : null;
  const sortedBlocks = [...bundle.bausteine].sort((a, b) => a.name.localeCompare(b.name, 'de'));
  const rangMap = new Map((bundle.schemes.find((s) => s.id === 'reichweite')?.werte || []).map((w) => [w.id, w.rang ?? 0]));

  const openSwap = (pfad: string) => {
    if (swapTarget?.pfad === pfad) {
      setSwapTarget(null);
      return;
    }
    try {
      const candidates = search.ersatz(arrangement, pfad, registry);
      setSwapTarget({ pfad, candidates });
    } catch {
      setSwapTarget({ pfad, candidates: [] });
    }
  };

  const applySwap = (pfad: string, cand: ReplacementCandidate) => {
    onChange(replaceNodeAtPath(arrangement, pfad, cand.baustein, cand.dauerMin));
    setSwapTarget(null);
  };

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
          <p className="muted">Der Ablauf ist aktuell leer. Fügen Sie unten einen Baustein hinzu oder laden Sie eine Vorlage.</p>
        </div>
      )}

      {mainSteps.map((node, visIdx) => {
        const realIdx = stepIndexOf(node);
        const pfad = `${prefix}/teile/${realIdx}`;
        const chainStep = node.kettenschritt && kette ? kette.schritte.find((s) => s.id === node.kettenschritt) : null;
        const produced = [...new Set(statesOfNode(node))];

        return (
          <div key={`${realIdx}-${visIdx}`}>
            {node.typ === 'Einsatz' && (() => {
              const b = blocksById.get(node.baustein);
              const slots = b?.slot || [];
              const candsForStep = chainStep
                ? sortedBlocks.filter(
                    (cand) => (rangMap.get(cand.reichweite) ?? 0) <= 3 && cand.lernfunktion.some((f) => chainStep.funktion.includes(f))
                  )
                : sortedBlocks;

              return (
                <article className={`step-card ${guidanceClass(b)}`}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="range-badge">{visIdx + 1}</span>
                      {b && <MethodPictogram type={b.piktogramm} size={32} />}
                      <div>
                        {chainStep && (
                          <div style={{ fontFamily: 'var(--display)', fontSize: 12.5, fontWeight: 700, color: 'var(--ink-2)' }}>
                            {chainStep.id.toUpperCase()} · {chainStep.label} (Ziel: {labelOf('lernzustand', chainStep.ziel)})
                          </div>
                        )}
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
                          </select>
                          <label style={{ fontFamily: 'var(--display)', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number"
                              min={0}
                              style={{ width: 68 }}
                              value={node.dauerMin ?? b?.dauerMin ?? 15}
                              onChange={(e) => onChange(updateStepDuration(arrangement, realIdx, Number(e.target.value) || 0))}
                            />
                            min
                          </label>
                          {b && <EvidenceBadge grade={search.bestGrade(b)} />}
                          {b && (
                            <Link to={`/methoden/${b.kennung}`} className="btn btn-sm btn-ghost">
                              Profil ↗
                            </Link>
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
                          const alt = sortedBlocks.find((x) => x.kennung !== node.baustein) || b;
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
                    <div className="slot-pockets">
                      {slots.map((sl) => {
                        const bel = (node.belegung || []).find((x) => x.slotKennung === sl.kennung);
                        const innerId = bel && bel.inhalt.typ === 'Einsatz' ? bel.inhalt.baustein : '';
                        const parentR = rangMap.get(b.reichweite) ?? 3;
                        const slotR = rangMap.get(sl.reichweite) ?? 2;
                        const slotCands = sortedBlocks.filter(
                          (c) =>
                            (rangMap.get(c.reichweite) ?? 0) < parentR &&
                            (rangMap.get(c.reichweite) ?? 0) <= slotR &&
                            c.lernfunktion.some((f) => sl.lernfunktion.includes(f))
                        );
                        return (
                          <div key={sl.kennung} className="slot-pocket">
                            <div style={{ fontFamily: 'var(--display)', fontSize: 13, fontWeight: 700, marginBottom: 4 }}>
                              Slot „{sl.name}“{' '}
                              <span className="muted">
                                (bis {sl.reichweite.toUpperCase()}
                                {sl.pflicht ? ', Pflicht' : ', optional'})
                              </span>
                            </div>
                            <select
                              style={{ width: '100%' }}
                              value={innerId}
                              onChange={(e) => {
                                const chosen = e.target.value ? blocksById.get(e.target.value) || null : null;
                                onChange(setSlotBlock(arrangement, realIdx, sl.kennung, chosen));
                              }}
                            >
                              <option value="">– Slot leer –</option>
                              {slotCands.map((c) => (
                                <option key={c.kennung} value={c.kennung}>
                                  {c.name} ({c.reichweite.toUpperCase()})
                                </option>
                              ))}
                            </select>
                          </div>
                        );
                      })}
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
                          {sortedBlocks.map((cand) => (
                            <option key={cand.kennung} value={cand.kennung}>
                              {cand.name} ({cand.reichweite.toUpperCase()})
                            </option>
                          ))}
                        </select>
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
            {sortedBlocks.map((b) => (
              <option key={b.kennung} value={b.kennung}>
                {b.name} ({b.reichweite.toUpperCase()})
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontFamily: 'var(--display)', fontWeight: 700, fontSize: 14, marginBottom: 6 }}>
            ═ Begleitstrang (Parallel)
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <select
              style={{ flex: 1 }}
              value={parBlockId}
              onChange={(e) => onChange(setParallelBlock(arrangement, e.target.value ? blocksById.get(e.target.value) || null : null, parDuration))}
            >
              <option value="">– kein Begleitstrang –</option>
              {sortedBlocks
                .filter((b) => (rangMap.get(b.reichweite) ?? 0) <= 3)
                .map((b) => (
                  <option key={b.kennung} value={b.kennung}>
                    {b.name}
                  </option>
                ))}
            </select>
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
                  onChange(setRecurrence(arrangement, { baustein: b.kennung, anzahl: wkNode?.anzahl || 3, abstand: wkNode?.abstand || 'P2D', dauerMin: b.dauerMin }));
                }
              }}
            >
              <option value="">– keine Wiederkehr –</option>
              {sortedBlocks
                .filter((b) => b.reichweite === 'r1' && b.lernfunktion.includes('konsolidierung'))
                .map((b) => (
                  <option key={b.kennung} value={b.kennung}>
                    {b.name}
                  </option>
                ))}
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
                      dauerMin: wkNode.dauerMin || 6
                    })
                  )
                }
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
