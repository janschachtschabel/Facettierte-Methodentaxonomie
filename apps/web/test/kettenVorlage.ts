import type { Arrangement, ArrangementNode, CatalogBundle, EinsatzNode } from '@fmt/core';

// Test fixture only: fixed flows per chain for component and export tests. The Baukasten never builds a flow this
// way; examples and the chain select ask the core (matcher) for a proposal.

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

  if (zieltyp === 'kondition-training') {
    return {
      ...base,
      kontext: { bildungsstufe: 'sek1', vorwissen: 'mittel', zeitbudgetMin: 60 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('aufwaermen', 10, { kettenschritt: 't1' }),
          E('dauer-intervallmethode', 25, { kettenschritt: 't2' }),
          E('spielform-zielspiel', 15, { kettenschritt: 't3' }),
          E('cool-down-auswertung', 8, { kettenschritt: 't4' })
        ]
      }
    };
  }

  if (zieltyp === 'vollstaendige-handlung') {
    return {
      ...base,
      kontext: { bildungsstufe: 'berufsbildung', vorwissen: 'mittel', zeitbudgetMin: 180 },
      ablauf: {
        typ: 'Sequenz',
        teile: [
          E('ankerfall', 20, { kettenschritt: 'h1' }),
          E('erfindungsaufgabe', 35, { kettenschritt: 'h2' }),
          E('vier-stufen-methode', 45, { kettenschritt: 'h3' }),
          E('praxisauftrag-arbeitsplatz', 30, { kettenschritt: 'h3' }),
          E('fall-simulation-osce', 30, { kettenschritt: 'h4' }),
          E('reflexionsprompt', 10, { kettenschritt: 'h5' })
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
