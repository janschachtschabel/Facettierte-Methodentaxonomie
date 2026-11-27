import type {
  Baustein,
  FmtData,
  Grundlage,
  KettenSchritt,
  MatchRequest,
  MerkmalAntwort,
  RegelSituation,
  Richtung,
  TeilgruppenRegelsatz,
  VocabValue
} from './types.js';
import type { Situation } from './situation.js';
import type { erstelleRegeln } from './regeln.js';
import { mehrTechnikAls, raumFehlt, schriftFehlt, ungedeckterBedarf } from './bedarf.js';
import { traegtWissensart, wissensartenVon } from './zielart.js';
import { DIFF_MATRIX_VARIABLES } from './differentiationMatrix.js';

export interface TeilgruppenProfil {
  id: string;
  label: string;
  /** Matrix values of the group (category id → value id). */
  selectedValues: Record<string, string>;
  ohneSchrift?: Array<'lesen' | 'schreiben'>;
  ohneBewegung?: boolean;
}

export interface TeilgruppenEntscheidung {
  antwort: 'passt' | 'hilfe' | 'tausch';
  /** Row of the table that decided; undefined for 'passt'. */
  merkmal?: string;
  richtung?: Richtung;
  /** Plain German, names the trait and the source. */
  grund: string;
  grundlage?: Grundlage;
  quelle?: string;
  /** Traits on the blocklist the group named. */
  gesperrt: string[];
}

export interface Gleichwertigkeit {
  ok: boolean;
  gruende: string[];
}

/** Directions that read a formal need of the group (literacy, movement) rather than the guidance of the method. */
const FORMAL: Partial<Record<Richtung, true>> = { 'ohne-lesen': true, 'ohne-schreiben': true, 'ohne-bewegung': true };
const FLAECHEN = ['stellflaeche', 'bewegungsflaeche'];

/** "Category: value" of a matrix value, as the matrix names it; the id when the matrix does not know it. */
const MATRIX_LABEL: Map<string, string> = new Map(
  DIFF_MATRIX_VARIABLES.flatMap((o) => o.kategorien.flatMap((k) => k.auspraegungen.map((a) => [a.id, `${k.name}: ${a.name}`] as const)))
);
const merkmalLabel = (wert: string) => MATRIX_LABEL.get(wert) ?? wert;

const nurUniform = (b: Pick<Baustein, 'adaptivitaet'>) => {
  // A method without B3 counts as uniform, so a missing value never turns a swap into a help.
  const a = b.adaptivitaet || [];
  return !a.length || a.every((x) => x === 'uniform');
};

/** Whether the method fulfils the direction of a swap (a replacement has to). */
export function erfuelltRichtung(b: Baustein, r: Richtung): boolean {
  const anleitung = b.anleitung || [];
  switch (r) {
    case 'mehr-anleitung':
      return anleitung.includes('explizit') || anleitung.includes('geleitet');
    case 'weniger-anleitung':
      return anleitung.includes('offen') || anleitung.includes('geleitet');
    case 'explizit-mit-strategie':
      return anleitung.includes('explizit');
    case 'ohne-lesen':
      return !(b.schriftbedarf || []).includes('liest');
    case 'ohne-schreiben':
      return !(b.schriftbedarf || []).includes('schreibt');
    case 'ohne-bewegung':
      return !(b.raumbedarf || []).some((x) => FLAECHEN.includes(x));
  }
}

/** Whether the planned method sets off the swap row's reason (step 3 of the decision). */
function loestAus(b: Baustein, r: Richtung): boolean {
  const anleitung = b.anleitung || [];
  if (r === 'weniger-anleitung') return anleitung.length > 0 && anleitung.every((x) => x === 'explizit');
  return !erfuelltRichtung(b, r);
}

const zeileVon = (t: TeilgruppenRegelsatz, wert: string): MerkmalAntwort | undefined =>
  t.merkmale.find((m) => m.auspraegungen.includes(wert));

/**
 * Removes the blocked categories from the profile and remembers them; swap rows with a formal direction that the
 * group carries (e.g. foerderbedarf-koerperlich-deutlich → ohne-bewegung) become the group's own statements
 * (ohneBewegung, ohneSchrift), so the equivalence check reads them from the profile alone. Idempotent.
 */
export function bereinigeProfil(p: TeilgruppenProfil, t: TeilgruppenRegelsatz): { profil: TeilgruppenProfil; gesperrt: string[] } {
  const gesperrt: string[] = [];
  const selectedValues: Record<string, string> = {};
  for (const [kategorie, wert] of Object.entries(p.selectedValues || {})) {
    if (t.gesperrt.includes(kategorie)) gesperrt.push(kategorie);
    else selectedValues[kategorie] = wert;
  }
  const ohneSchrift = new Set(p.ohneSchrift || []);
  let ohneBewegung = Boolean(p.ohneBewegung);
  for (const wert of Object.values(selectedValues)) {
    const r = zeileVon(t, wert)?.richtung;
    if (r === 'ohne-bewegung') ohneBewegung = true;
    if (r === 'ohne-lesen') ohneSchrift.add('lesen');
    if (r === 'ohne-schreiben') ohneSchrift.add('schreiben');
  }
  const profil: TeilgruppenProfil = { ...p, selectedValues };
  if (ohneSchrift.size) profil.ohneSchrift = [...ohneSchrift];
  if (ohneBewegung) profil.ohneBewegung = true;
  return { profil, gesperrt };
}

interface FormalerBedarf {
  merkmal: string;
  richtung: Richtung;
  grund: string;
}

/** Formal needs of the group the method does not cover (literacy, movement); in the order lesen, schreiben, bewegen. */
function formaleLuecken(b: Baustein, p: TeilgruppenProfil, t?: TeilgruppenRegelsatz): FormalerBedarf[] {
  const aus: FormalerBedarf[] = [];
  const ohne = p.ohneSchrift || [];
  // The table row with a formal direction names the trait; without one it is the group's own statement.
  const zeile = (r: Richtung) => t?.merkmale.find((m) => m.richtung === r && m.auspraegungen.some((a) => Object.values(p.selectedValues || {}).includes(a)));
  for (const [r, wert, eigen] of [
    ['ohne-lesen', 'lesen', 'kann-nicht-lesen'],
    ['ohne-schreiben', 'schreiben', 'kann-nicht-schreiben']
  ] as const) {
    if (!ohne.includes(wert) || erfuelltRichtung(b, r)) continue;
    const label = schriftFehlt(b, [wert])[0];
    aus.push({ merkmal: zeile(r)?.id ?? eigen, richtung: r, grund: `Die Gruppe kann nicht ${label}; ${b.name} verlangt ${label}.` });
  }
  if (p.ohneBewegung && !erfuelltRichtung(b, 'ohne-bewegung')) {
    aus.push({
      merkmal: zeile('ohne-bewegung')?.id ?? 'kann-sich-nicht-bewegen',
      richtung: 'ohne-bewegung',
      grund: `Die Gruppe kann sich nicht frei bewegen; ${b.name} braucht Stell- oder Bewegungsfläche.`
    });
  }
  return aus;
}

const mitQuelle = (m: Pick<MerkmalAntwort, 'quelle' | 'grundlage'>) =>
  m.quelle ? ` (Quelle: ${m.quelle})` : m.grundlage === 'U' ? ' (Grundlage ungeklärt)' : ' (Setzung der Redaktion)';

const ANLASS: Record<string, string> = {
  'mehr-anleitung': 'leitet nicht an',
  'weniger-anleitung': 'leitet nur eng an',
  'explizit-mit-strategie': 'leitet nicht explizit an'
};

/**
 * The answer for one subgroup and the planned method: it fits, it gets a help inside the method, or a parallel
 * method replaces it. Order: blocklist, formal needs, swap rows the method sets off, help rows (and values the table
 * does not name), otherwise it fits.
 */
export function entscheideTeilgruppe(geplant: Baustein, p: TeilgruppenProfil, t: TeilgruppenRegelsatz): TeilgruppenEntscheidung {
  // 1. Blocked categories never trigger anything.
  const { profil, gesperrt } = bereinigeProfil(p, t);

  // 2. Formal needs: the group cannot read, write or move freely and the method needs it.
  const formal = formaleLuecken(geplant, profil, t)[0];
  if (formal) return { antwort: 'tausch', merkmal: formal.merkmal, richtung: formal.richtung, grund: formal.grund, grundlage: 'formal', gesperrt };

  // Neutral values (average, typical, none) mean no need: ignored like not selected. Older bundles have no list.
  const neutral = new Set(t.neutral ?? []);
  const werte = Object.values(profil.selectedValues).filter((w) => Boolean(w) && !neutral.has(w));

  // 3. Swap rows of the group whose reason the method sets off; B3 decides between swap and help.
  const ausgeloest = t.merkmale
    .filter((m) => m.antwort === 'tausch' && m.richtung && !FORMAL[m.richtung])
    .map((m) => ({ m, wert: werte.find((w) => m.auspraegungen.includes(w)) }))
    .filter((x): x is { m: MerkmalAntwort; wert: string } => Boolean(x.wert) && loestAus(geplant, x.m.richtung!));
  if (ausgeloest.length) {
    const { m, wert } = ausgeloest[0];
    const anlass = `${merkmalLabel(wert)}: ${geplant.name} ${ANLASS[m.richtung!]}${mitQuelle(m)}.`;
    const quelle = m.quelle ? { quelle: m.quelle } : {};
    if (nurUniform(geplant)) {
      return { antwort: 'tausch', merkmal: m.id, richtung: m.richtung, grund: `${anlass} Tausch gegen: ${m.wohin}.`, grundlage: m.grundlage, ...quelle, gesperrt };
    }
    return {
      antwort: 'hilfe',
      merkmal: m.id,
      richtung: m.richtung,
      grund: `${anlass} Die Methode lässt sich anpassen; sie bleibt und bekommt: ${m.wohin}.`,
      grundlage: m.grundlage,
      ...quelle,
      gesperrt
    };
  }

  // 4. Values with a need for support: a help row, or a value the table does not name (sonst). B3 does not matter here.
  const swapWerte = new Set(t.merkmale.filter((m) => m.antwort === 'tausch').flatMap((m) => m.auspraegungen));
  const hilfe = t.merkmale.find((m) => m.antwort === 'hilfe' && werte.some((w) => m.auspraegungen.includes(w)));
  if (hilfe) {
    const wert = werte.find((w) => hilfe.auspraegungen.includes(w))!;
    return {
      antwort: 'hilfe',
      merkmal: hilfe.id,
      grund: `${merkmalLabel(wert)}: Hilfe in derselben Methode – ${hilfe.wohin}${mitQuelle(hilfe)}.`,
      grundlage: hilfe.grundlage,
      ...(hilfe.quelle ? { quelle: hilfe.quelle } : {}),
      gesperrt
    };
  }
  const ungenannt = werte.find((w) => !swapWerte.has(w) && !zeileVon(t, w));
  if (ungenannt) {
    return {
      antwort: 'hilfe',
      merkmal: 'sonst',
      grund: `${merkmalLabel(ungenannt)}: ${t.sonst.wohin.replace(/\.$/, '')}${mitQuelle(t.sonst)}.`,
      grundlage: t.sonst.grundlage,
      gesperrt
    };
  }

  // 5. Nothing to do.
  return { antwort: 'passt', grund: `${geplant.name} passt zur Teilgruppe ${profil.label}.`, gesperrt };
}

/** Learning states a method delivers, with every state they imply (vocab lernzustand, field impliziert). */
function huelle(data: Pick<FmtData, 'schemes'>, zustaende: string[]): Set<string> {
  const scheme = data.schemes.find((s) => s.id === 'lernzustand');
  const werte: VocabValue[] = scheme ? scheme.werte || (scheme.gruppen || []).flatMap((g) => g.werte) : [];
  const impliziert = new Map(werte.map((w) => [w.id, w.impliziert || []]));
  const set = new Set<string>();
  const stack = [...zustaende];
  while (stack.length) {
    const z = stack.pop()!;
    if (set.has(z)) continue;
    set.add(z);
    stack.push(...(impliziert.get(z) || []));
  }
  return set;
}

const lehrkraftGebunden = (b: Baustein) => b.steuerung?.organisation === 'lehrkraft' || (b.rolle || []).includes('instrukteur');
const RAHMEN_TEXT = { technik: 'mehr Technik', internet: 'Internet', ki: 'KI' } as const;

/** Situation the fit rules read for the subgroup: the request, with the prior knowledge from the profile. */
function regelLageDerGruppe(anfrage: MatchRequest, profil: TeilgruppenProfil): RegelSituation {
  const lage: RegelSituation = {};
  for (const feld of ['vorwissen', 'bildungsstufe', 'komplexitaet', 'sprachniveau', 'fachbereich'] as const) {
    const w = anfrage[feld];
    if (w != null && w !== '') lage[feld] = String(w);
  }
  const vorwissen = profil.selectedValues?.vorwissen;
  if (vorwissen?.startsWith('vorwissen-')) lage.vorwissen = vorwissen.slice('vorwissen-'.length);
  return lage;
}

/**
 * Whether a parallel method may replace the planned one for a subgroup. All four conditions must hold; every failed
 * condition adds its own reason. Pass the table as ctx.t (or a profile already cleaned with bereinigeProfil), so
 * formal rows of the table count as the group's own statements.
 */
export function istGleichwertig(
  kandidat: Baustein,
  geplant: Baustein,
  ctx: {
    schritt?: Pick<KettenSchritt, 'ziel' | 'rolle' | 'wissensart'>;
    anfrage: MatchRequest;
    situation: Situation;
    dauerMin?: number;
    profil: TeilgruppenProfil;
    lehrende?: number;
    data: Pick<FmtData, 'schemes'>;
    regeln: ReturnType<typeof erstelleRegeln>;
    /** With the table, the profile is cleaned here (bereinigeProfil), so formal rows always count. */
    t?: TeilgruppenRegelsatz;
  }
): Gleichwertigkeit {
  const gruende: string[] = [];
  const { schritt, data } = ctx;
  const profil = ctx.t ? bereinigeProfil(ctx.profil, ctx.t).profil : ctx.profil;

  // 1. Same learning state for the same knowledge type.
  const liefert = huelle(data, kandidat.nachbedingung || []);
  const ziele = schritt ? [schritt.ziel] : geplant.nachbedingung || [];
  const fehlend = ziele.filter((z) => !liefert.has(z));
  if (fehlend.length) gruende.push(`Lernstand: ${kandidat.name} führt nicht zu ${fehlend.join(', ')}.`);
  const eigene = wissensartenVon(kandidat);
  const artPasst = schritt?.wissensart?.length
    ? traegtWissensart(kandidat, schritt)
    : (() => {
        const soll = wissensartenVon(geplant);
        return !soll.length || soll.some((w) => eigene.includes(w));
      })();
  if (!artPasst) gruende.push(`Wissensart: ${kandidat.name} trägt nicht dieselbe Wissensart wie ${schritt?.wissensart?.length ? 'der Schritt' : geplant.name}.`);

  // 2. Needs covered in the same room and time slot, no more devices, internet or AI than the planned method.
  const luecke = ungedeckterBedarf(kandidat, ctx.anfrage, ctx.situation, data);
  if (luecke) gruende.push(`Bedarf: ${kandidat.name} ${luecke.grund}.`);
  const raum = raumFehlt(kandidat, ctx.situation);
  if (raum.length && !(luecke && luecke.merkmal === 'raumbedarf')) gruende.push(`Bedarf: ${kandidat.name} braucht im Raum der Stunde: ${raum.join(', ')}.`);
  if (ctx.dauerMin != null && kandidat.dauerMin > ctx.dauerMin && !(luecke && luecke.merkmal === 'dauerMin')) {
    gruende.push(`Bedarf: ${kandidat.name} braucht ${kandidat.dauerMin} min, der Schritt hat ${ctx.dauerMin} min.`);
  }
  const mehr = mehrTechnikAls(kandidat, geplant);
  if (mehr) gruende.push(`Bedarf: ${kandidat.name} braucht ${RAHMEN_TEXT[mehr]}, ${geplant.name} nicht.`);

  // 3. Fits the subgroup: no formal exclusion, no new warning in the group's situation (one the planned method does
  // not get there as well, compared by rule id).
  for (const f of formaleLuecken(kandidat, profil)) gruende.push(`Teilgruppe: ${f.grund}`);
  const lage = regelLageDerGruppe(ctx.anfrage, profil);
  // warnungen includes the built-in rule evidenz-geltung, which pruefe does not know.
  const warnt = (b: Baustein) => ctx.regeln.warnungen(b, lage);
  const schonGeplant = new Set(warnt(geplant).map((m) => m.regel));
  for (const w of warnt(kandidat)) if (!schonGeplant.has(w.regel)) gruende.push(`Teilgruppe: neue Warnung – ${w.text}`);

  // 4. Both methods can run side by side: not both bind the teacher, unless there are two teachers.
  if (lehrkraftGebunden(kandidat) && lehrkraftGebunden(geplant) && (ctx.lehrende ?? 1) < 2) {
    gruende.push(`Nebeneinander: ${kandidat.name} und ${geplant.name} binden beide die Lehrkraft.`);
  }

  return { ok: gruende.length === 0, gruende };
}
