import { nurMethoden } from './eintragsart.js';
import type { Baustein, FmtData, Scheme, VocabValue } from './types.js';

export type ScaleName = 'ansatz' | 'lernfunktion' | 'anleitung' | 'engagement' | 'interaktion' | 'reichweite';

export interface ScalePrototype {
  scale: ScaleName;
  code: string;
  label: string;
  text: string;
}

export interface ScaleHit {
  code: string;
  label: string;
  score: number;
}

export interface SemanticScaleClassification {
  engine: 'bm25-trigram' | 'model2vec';
  dauerMs: number;
  scales: Record<ScaleName, ScaleHit[]>;
}

export interface SemanticMethodHit {
  kennung: string;
  name: string;
  score: number;
}

// Clean German everyday teacher vocabulary supplementing the formal SKOS labels & definitions
// (avoids English loanwords that bias static multilingual embeddings toward tech/digital tokens)
const SCALE_EXTRA_HINTS: Record<ScaleName, Record<string, string>> = {
  ansatz: {
    instruktion: 'erklären vormachen lehrervortrag demonstrieren einführen darbietend direkt anleiten tafelbild schrittweise zeigen beispiel vorrechnen',
    kooperativ: 'kooperativ zusammenarbeiten austauschen gemeinsam erarbeiten gegenseitig erklären miteinander lernen tandem wirbelgruppe',
    forschend: 'forschen entdecken experimentieren untersuchen hypothesen prüfen phänomen beobachten problemorientiert knobeln forschungsfrage',
    offen: 'selbstständig frei wählen stationen werkstatt wochenplan projekt eigenverantwortlich interessengeleitet freiarbeit',
    diskurs: 'diskutieren debattieren argumentieren streitgespräch pro und contra meinung begründen stellung beziehen perspektiven abwägen',
    kreativ: 'ideen sammeln kreativ erfinden gestalten entwerfen zeichnen geschichten schreiben produkt erstellen fantasie',
    visualisierung: 'visualisieren zeichnen skizzieren schaubild plakat diagramm strukturlegen grafisch darstellen ordnen veranschaulichen',
    uebung: 'üben trainieren wiederholen festigen automatisieren rechenaufgaben rechenverfahren abrufen einprägen routine sicher beherrschen',
    'diagnose-feedback': 'diagnose lernstand prüfen testen abfragen kurztest rückmeldung einschätzen fehlvorstellungen erkennen verständnis überprüfen',
    reflexion: 'reflektieren lernprozess nachdenken lerntagebuch bilanzieren selbsteinschätzung eigenes vorgehen fehler auswerten ziele überprüfen',
    'spiel-simulation': 'spielen rollenspiel planspiel simulation spielerisch szenisch nachstellen schlüpfen wettbewerb rätsel',
    'digital-ki': 'digital tablet computer internet künstliche intelligenz lernsoftware wiki lernvideo hörbeitrag medienproduktion'
  },
  lernfunktion: {
    orientierung: 'einstieg motivieren neugier wecken vorwissen aktivieren überblick ankommen thema öffnen ideen sammeln austausch zum start',
    erwerb: 'neu einführen kennenlernen grundlagen vermitteln erstkontakt aneignen vortrag vormachen beispiel zeigen informationen aufnehmen',
    verstehen: 'verstehen durchdringen zusammenhänge begreifen erklären deuten konzept klären schaubild diskutieren argumentieren fehlvorstellung auflösen',
    problemloesen: 'problem lösen forschungsfrage untersuchen hypothesen testen knobeln strategie entwickeln herausforderung erforschen experimentieren',
    konsolidierung: 'üben festigen wiederholen sichern vertiefen trainieren rechenverfahren einprägen abrufen dauerhaft behalten',
    anwendung: 'anwenden übertragen transfer alltag praxisbeispiel projekt produkt gestalten erstellen produzieren rollenspiel umsetzen',
    metakognition: 'reflektieren lernweg eigenes vorgehen fehler nachdenken strategie bewerten selbststeuerung rückblick lerntagebuch',
    diagnose: 'prüfen testen lernstand feststellen kontrollieren ob alle verstanden haben kurzabfrage einschätzen feedback einholen'
  },
  anleitung: {
    explizit: 'kleinschrittig genau anleiten vormachen schritt für schritt klare vorgaben direkt erklären stark geführt',
    geleitet: 'begleitet mit leitfragen hilfekarten gerüst angeleitet strukturiert erkunden',
    offen: 'frei selbstständig offen entdecken eigene fragestellung ohne enge vorgaben eigenverantwortlich'
  },
  engagement: {
    passiv: 'zuhören zuschauen anschauen lesen film ansehen vortrag folgen aufnehmen',
    aktiv: 'markieren notieren abschreiben auswählen sortieren bewegen ankreuzen nachmachen',
    konstruktiv: 'selbst erstellen formulieren begründen skizzieren vergleichen zusammenfassen eigene lösung entwickeln',
    interaktiv: 'miteinander diskutieren gegenseitig erklären aushandeln gemeinsam lösen gespräch rückmeldung geben'
  },
  interaktion: {
    einzel: 'einzeln stillarbeit allein für sich individuell selbstständig am platz',
    partner: 'zu zweit partnerarbeit tandem nachbar austausch paarweise',
    'kleingruppe-kooperativ': 'kleingruppe team arbeitsteilig rollen gemeinsam puzzle tischgruppe',
    'kleingruppe-unstrukturiert': 'freie gruppe gruppenphase offen zusammenarbeiten',
    'plenum-lehrergeleitet': 'plenum ganze klasse gemeinsam gespräch tafel frontal unterrichtsgespräch',
    'plenum-lernendengeleitet': 'schüler moderieren klassenrat debatte fischbowl plenum selbstgeleitet'
  },
  reichweite: {
    r1: 'kurz schnell einstieg 5 minuten 10 minuten zwischendurch abschluss auflockerung impuls',
    r2: 'einzelstunde doppelstunde 45 minuten 90 minuten arbeitsphase hauptphase unterrichtsstunde',
    r3: 'unterrichtsreihe sequenz mehrstündig mehrere stunden wochenprojekt einheit thema über wochen',
    r4: 'kurs halbjahr schuljahr lehrgang langfristig modul curriculum'
  }
};

export function foldDe(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

function stripNegatedClauses(text: string): string {
  return foldDe(text).replace(
    /\b(?:ohne|kein(?:e|en|er|es)?)\s+(?:internet|wlan|netz|ki|gerate|technik|computer|tablets?|laptops?|digital\w*|online\w*|vorbereitung)\b/g,
    ' '
  );
}

// Lightweight German stemmer (strips common inflectional suffixes so "erklären"/"erklärt"/"Erklärung" share stems)
function stemDe(word: string): string {
  if (word.length <= 4) return word;
  return word.replace(/(?:ungen|ung|heit|keit|schaft|ieren|ende|enden|endes|ern|eln|en|er|es|em|et|te|st|e|n|s)$/, '');
}

function tokenizeDe(text: string): string[] {
  const raw = foldDe(text)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);
  const out: string[] = [];
  for (const w of raw) {
    out.push(w);
    const st = stemDe(w);
    if (st.length >= 3 && st !== w) out.push(st);
  }
  return out;
}

function charTrigrams(text: string): Set<string> {
  const clean = foldDe(text).replace(/[^a-z0-9]+/g, ' ').trim();
  const grams = new Set<string>();
  for (const word of clean.split(/\s+/)) {
    if (word.length < 3) continue;
    const padded = `_${word}_`;
    for (let i = 0; i <= padded.length - 3; i++) {
      grams.add(padded.slice(i, i + 3));
    }
  }
  return grams;
}

export function buildScalePrototypes(data: FmtData): ScalePrototype[] {
  const scales: ScaleName[] = ['ansatz', 'lernfunktion', 'anleitung', 'engagement', 'interaktion', 'reichweite'];
  const out: ScalePrototype[] = [];
  for (const scale of scales) {
    const scheme: Scheme | undefined = data.schemes.find((s) => s.id === scale);
    if (!scheme) continue;
    const vals: VocabValue[] = scheme.werte || (scheme.gruppen || []).flatMap((g) => g.werte);
    for (const v of vals) {
      if (scale === 'reichweite' && v.id === 'r5') continue;
      const extra = SCALE_EXTRA_HINTS[scale]?.[v.id] || '';
      const text = [v.label, ...(v.alt || []), v.definition || '', extra].filter(Boolean).join(' ');
      out.push({ scale, code: v.id, label: v.label, text });
    }
  }
  return out;
}

interface IndexedDoc<T> {
  item: T;
  tf: Map<string, number>;
  len: number;
  trigrams: Set<string>;
}

function buildBm25Index<T>(docs: Array<{ item: T; text: string }>) {
  const indexed: IndexedDoc<T>[] = [];
  const df = new Map<string, number>();
  let totalLen = 0;

  for (const d of docs) {
    const toks = tokenizeDe(d.text);
    const tf = new Map<string, number>();
    for (const t of toks) tf.set(t, (tf.get(t) || 0) + 1);
    for (const uniq of tf.keys()) df.set(uniq, (df.get(uniq) || 0) + 1);
    totalLen += toks.length;
    indexed.push({ item: d.item, tf, len: toks.length, trigrams: charTrigrams(d.text) });
  }
  const avgLen = indexed.length ? totalLen / indexed.length : 1;
  const N = Math.max(1, indexed.length);

  return (query: string) => {
    const qToks = [...new Set(tokenizeDe(query))];
    const qGrams = charTrigrams(query);
    const k1 = 1.4;
    const b = 0.65;

    const scored = indexed.map((doc) => {
      let bm25 = 0;
      for (const qt of qToks) {
        const f = doc.tf.get(qt) || 0;
        if (!f) continue;
        const nDoc = df.get(qt) || 0;
        const idf = Math.log(1 + (N - nDoc + 0.5) / (nDoc + 0.5));
        bm25 += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + b * (doc.len / avgLen))));
      }
      // Character-trigram recall handles German compound words ("Schülerexperiment", "Partnerarbeit", "Lernstandserhebung")
      let gramHits = 0;
      if (qGrams.size > 0) {
        for (const g of qGrams) {
          if (doc.trigrams.has(g)) gramHits++;
        }
      }
      const trigramRecall = qGrams.size > 0 ? gramHits / Math.sqrt(qGrams.size * Math.max(1, doc.trigrams.size)) : 0;
      const combined = bm25 + trigramRecall * 2.2;
      return { item: doc.item, score: combined };
    });

    scored.sort((a, b2) => b2.score - a.score);
    return scored;
  };
}

export interface FmtSemanticClassifier {
  prototypes: ScalePrototype[];
  classifyScales(text: string): SemanticScaleClassification;
  rankMethods(text: string, limit?: number): SemanticMethodHit[];
}

export function createSemanticClassifier(data: FmtData): FmtSemanticClassifier {
  const prototypes = buildScalePrototypes(data);
  const scales: ScaleName[] = ['ansatz', 'lernfunktion', 'anleitung', 'engagement', 'interaktion', 'reichweite'];

  const scaleSearchers = new Map<ScaleName, ReturnType<typeof buildBm25Index<ScalePrototype>>>();
  for (const s of scales) {
    const subset = prototypes.filter((p) => p.scale === s).map((p) => ({ item: p, text: p.text }));
    scaleSearchers.set(s, buildBm25Index(subset));
  }

  // Only methods: a help (eintragsart hilfe) is never a candidate, and in the index it would also take a slot of the
  // ranking and set the top score that normalizes the methods' relevance (Task D7).
  const methodSearcher = buildBm25Index<Baustein>(
    nurMethoden(data.bausteine).map((b) => ({
      item: b,
      text: [
        b.name,
        b.name,
        ...(b.alternativname || []),
        b.kurzbeschreibung,
        b.problem || '',
        ...(b.durchfuehrung || []),
        ...(b.kernkomponente || []).map((k) => k.name),
        ...(b.variante || [])
      ].join(' ')
    }))
  );

  return {
    prototypes,
    classifyScales(text: string): SemanticScaleClassification {
      const t0 = Date.now();
      const cleaned = stripNegatedClauses(text);
      const result = {} as Record<ScaleName, ScaleHit[]>;
      for (const s of scales) {
        const searcher = scaleSearchers.get(s)!;
        const ranked = searcher(cleaned);
        const topScore = ranked[0]?.score || 0;
        // Normalize relative confidence to 0..1 while keeping an absolute floor so noisy/empty queries stay empty
        result[s] = ranked
          .filter((r) => r.score >= 0.45 && (topScore <= 0 || r.score >= topScore * 0.55))
          .slice(0, 3)
          .map((r) => ({
            code: r.item.code,
            label: r.item.label,
            score: Math.round(Math.min(1, r.score / Math.max(2.5, topScore)) * 100) / 100
          }));
      }
      return { engine: 'bm25-trigram', dauerMs: Date.now() - t0, scales: result };
    },
    rankMethods(text: string, limit = 10): SemanticMethodHit[] {
      const ranked = methodSearcher(text);
      const topScore = ranked[0]?.score || 1;
      return ranked
        .filter((r) => r.score >= 0.5)
        .slice(0, limit)
        .map((r) => ({
          kennung: r.item.kennung,
          name: r.item.name,
          score: Math.round(Math.min(1, r.score / Math.max(3, topScore)) * 100) / 100
        }));
    }
  };
}
