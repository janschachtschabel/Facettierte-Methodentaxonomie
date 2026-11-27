import type { MethodAdjustment, Passungsregel, PhasenAntwort } from '@fmt/core';
import { belegOhneQuelle, belegZeile, hilfeUebernommen, sichtbareHilfen, type TeilgruppenPruefung } from '../planner/differentiationFlow.js';
import { nenntMerkmale } from '../planner/gruppen.js';
import { regelZeile } from '../planner/regelmeldung.js';
import type { GeneratedMaterialItem, LearnerGroup, ScenarioPhaseRow, SubgroupMethodMap } from '../planner/scenarioModel.js';

interface Props {
  subgroups: LearnerGroup[];
  /** Without it the page only shows the decision: no boxes for what a group cannot do yet. */
  onGroupChange?: (id: string, patch: Partial<LearnerGroup>) => void;
  /** Result of the last check; null while there is none or it is out of date (no cards then). */
  pruefung: TeilgruppenPruefung | null;
  rows: Array<Pick<ScenarioPhaseRow, 'key' | 'orderLabel' | 'methodName'>>;
  subgroupMethods: SubgroupMethodMap;
  generatedMaterials: GeneratedMaterialItem[];
  regeln?: Passungsregel[];
  /** Without the four handlers the cards show no buttons (read-only view, e.g. the page Binnendifferenzierung). */
  onTauschUebernehmen?: (a: MethodAdjustment) => void;
  onTauschZuruecknehmen?: (a: MethodAdjustment) => void;
  onHilfeUebernehmen?: (a: PhasenAntwort, phaseLabel: string) => void;
  onHilfeZuruecknehmen?: (a: PhasenAntwort) => void;
}

/** Shown in a help card when the table names no help the teacher can use as it stands. */
/** Shown on a group that has only a persona: nothing it names can be adapted to. */
export const KEINE_MERKMALE_TEXT =
  'Diese Gruppe nennt keine Merkmale. Wähle Merkmale, damit der Baukasten Hilfen oder eine andere Methode vorschlagen kann.';

export const KEINE_HILFE_TEXT = 'Für diese Gruppe ist hier keine belegte Hilfe hinterlegt. Prüfe selbst, was sie in dieser Methode braucht.';

/** Title of a decision card; the page Binnendifferenzierung uses the same words. */
export const ANTWORT_TITEL: Record<PhasenAntwort['antwort'], string> = {
  passt: 'Passt so',
  hilfe: 'Hilfe in dieser Methode',
  tausch: 'Andere Methode für diese Gruppe'
};

/** Toggles one of 'lesen' / 'schreiben' in a group's list of what it cannot do yet. */
function toggleSchrift(g: LearnerGroup, was: 'lesen' | 'schreiben', an: boolean): Array<'lesen' | 'schreiben'> | undefined {
  const rest = (g.ohneSchrift || []).filter((x) => x !== was);
  const next = an ? (['lesen', 'schreiben'] as const).filter((x) => x === was || rest.includes(x)) : rest;
  return next.length ? [...next] : undefined;
}

/**
 * Step 3: per subgroup what it cannot do yet, and per phase one of three cards (Passt so, Hilfe in dieser Methode,
 * Andere Methode für diese Gruppe). A help comes before a swap; nothing is taken over until the teacher clicks.
 */
export function TeilgruppenEntscheidung({
  subgroups,
  onGroupChange,
  pruefung,
  rows,
  subgroupMethods,
  generatedMaterials,
  regeln,
  onTauschUebernehmen,
  onTauschZuruecknehmen,
  onHilfeUebernehmen,
  onHilfeZuruecknehmen
}: Props) {
  const rowByKey = new Map(rows.map((r) => [r.key, r]));
  return (
    <div className="tg-gruppen">
      {subgroups.map((g) => {
        const antworten = pruefung ? pruefung.antworten.filter((a) => a.groupId === g.id) : [];
        const hinweise = pruefung?.hinweise[g.id] || [];
        const kann = (
          [
            ['lesen', 'kann noch nicht lesen', Boolean(g.ohneSchrift?.includes('lesen'))],
            ['schreiben', 'kann noch nicht schreiben', Boolean(g.ohneSchrift?.includes('schreiben'))],
            ['bewegen', 'kann sich nicht frei bewegen', Boolean(g.ohneBewegung)]
          ] as const
        ).map(([id, text, checked]) => (
          <label key={id} className="tg-kann-option">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) =>
                onGroupChange?.(
                  g.id,
                  id === 'bewegen' ? { ohneBewegung: e.target.checked || undefined } : { ohneSchrift: toggleSchrift(g, id, e.target.checked) }
                )
              }
            />
            {text}
          </label>
        ));
        return (
          <section key={g.id} className="tg-gruppe" role="region" aria-label={`Entscheidung für ${g.label}`}>
            <div className="tg-gruppe-kopf">
              <strong>{g.label}</strong>
              {g.count ? <span className="muted"> · {g.count} Lernende</span> : null}
            </div>
            {onGroupChange && (
              <fieldset className="tg-kann">
                <legend className="sr-only">Was {g.label} noch nicht kann</legend>
                {kann}
              </fieldset>
            )}
            {g.personaId && !nenntMerkmale(g) && <p className="muted tg-klein">{KEINE_MERKMALE_TEXT}</p>}
            {antworten.length > 0 && (
              <ul className="tg-karten">
                {antworten.map((a) => {
                  const row = rowByKey.get(a.stepKey);
                  const phase = row ? `${row.orderLabel} · ${row.methodName}` : a.stepKey;
                  const vorschlag = pruefung?.vorschlaege.find((v) => v.stepKey === a.stepKey && v.groupId === a.groupId);
                  const tauschUebernommen = Boolean(vorschlag && subgroupMethods[a.stepKey]?.[a.groupId] === vorschlag.zuKennung);
                  const hilfeDa = hilfeUebernommen(generatedMaterials, a.stepKey, a.groupId);
                  return (
                    <li key={a.stepKey} className={`tg-karte tg-karte-${a.antwort}`}>
                      <span className="muted tg-karte-phase">Phase {phase}</span>
                      <strong className="tg-karte-titel">{ANTWORT_TITEL[a.antwort]}</strong>
                      {a.antwort === 'passt' && (
                        <>
                          <div className="muted tg-klein">{belegOhneQuelle(a.grund)}</div>
                          {a.grundlage && <div className="muted tg-klein">{belegZeile(a)}</div>}
                        </>
                      )}
                      {a.antwort === 'hilfe' && (
                        <>
                          {a.hilfen.length > 0 ? (
                            <ul className="tg-hilfen">
                              {sichtbareHilfen(a).map((h) => (
                                <li key={h.id}>
                                  <strong>{h.name}</strong>
                                  <div className="muted tg-klein">Wann die Hilfe entfällt: {h.abbau}</div>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <div className="tg-klein">{KEINE_HILFE_TEXT}</div>
                          )}
                          <div className="tg-klein">Beleg: {belegOhneQuelle(a.grund)}</div>
                          <div className="muted tg-klein">{belegZeile(a)}</div>
                          {a.hilfen.length > 0 &&
                            onHilfeUebernehmen &&
                            onHilfeZuruecknehmen &&
                            (hilfeDa ? (
                              <div className="tg-aktion">
                                <span className="tg-klein">Übernommen. Die Hilfe steht als Material in Schritt 4.</span>
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  aria-label={`Hilfe für ${g.label} in Phase ${phase} zurücknehmen`}
                                  onClick={() => onHilfeZuruecknehmen(a)}
                                >
                                  Zurücknehmen
                                </button>
                              </div>
                            ) : (
                              <div className="tg-aktion">
                                <button
                                  type="button"
                                  className="btn btn-sm"
                                  aria-label={`Hilfe für ${g.label} in Phase ${phase} übernehmen`}
                                  onClick={() => onHilfeUebernehmen(a, phase)}
                                >
                                  Übernehmen
                                </button>
                              </div>
                            ))}
                        </>
                      )}
                      {a.antwort === 'tausch' && vorschlag && (
                        <>
                          <div>
                            <strong>{vorschlag.zuName}</strong> statt {vorschlag.vonName}
                          </div>
                          <div className="tg-klein">Beleg: {belegOhneQuelle(a.grund)}</div>
                          <div className="muted tg-klein">{belegZeile(a)}</div>
                          {a.sonstHilfen && a.sonstHilfen.length > 0 && (
                            <div className="tg-klein">Sonst: Hilfe – {sichtbareHilfen({ hilfen: a.sonstHilfen }).map((h) => h.name).join('; ')}</div>
                          )}
                          {!onTauschUebernehmen || !onTauschZuruecknehmen ? null : tauschUebernommen ? (
                            <div className="tg-aktion">
                              <span className="tg-klein">
                                Übernommen: {g.label} arbeitet in dieser Phase mit {vorschlag.zuName}.
                              </span>
                              <button
                                type="button"
                                className="btn btn-sm"
                                aria-label={`Andere Methode für ${g.label} in Phase ${phase} zurücknehmen`}
                                onClick={() => onTauschZuruecknehmen(vorschlag)}
                              >
                                Zurücknehmen
                              </button>
                            </div>
                          ) : (
                            <div className="tg-aktion">
                              <button
                                type="button"
                                className="btn btn-sm"
                                aria-label={`Andere Methode für ${g.label} in Phase ${phase} übernehmen`}
                                onClick={() => onTauschUebernehmen(vorschlag)}
                              >
                                Übernehmen
                              </button>
                            </div>
                          )}
                        </>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {hinweise.length > 0 && (
              <ul className="tg-hinweise" aria-label={`Hinweise zu ${g.label}`}>
                {hinweise.map((m, i) => (
                  <li key={i}>
                    {m.text}
                    <div className="muted tg-klein">{regelZeile(m, regeln)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
