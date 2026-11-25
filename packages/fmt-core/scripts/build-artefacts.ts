import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadFmtData } from '../src/load-data.js';
import { createValidator } from '../src/validate.js';
import { createMatcher } from '../src/zuordnung.js';
import { FMT_RULES } from '../src/rules.js';
import type { Arrangement, Baustein, CatalogBundle, FmtData, Scheme, VocabValue } from '../src/types.js';

export const VOCAB_PROPS: Array<[string, string, boolean]> = [
  ['reichweite', 'reichweite', false],
  ['beschreibungsstufe', 'beschreibungsstufe', false],
  ['lernfunktion', 'lernfunktion', true],
  ['engagement', 'engagement', true],
  ['weltbezug', 'weltbezug', true],
  ['anleitung', 'anleitung', true],
  ['adaptivitaet', 'adaptivitaet', true],
  ['feedback', 'feedback', true],
  ['interaktion', 'interaktion', true],
  ['repraesentation', 'repraesentation', true],
  ['raumzeit', 'raumzeit', true],
  ['rolle', 'agentenrolle', true],
  ['aufgabe', 'aufgabenstruktur', true],
  ['sequenz', 'sequenzlogik', true],
  ['vorbedingung', 'lernzustand', true],
  ['nachbedingung', 'lernzustand', true],
  ['geeignetBeiVorwissen', 'vorwissen', true],
  ['vorwissen', 'vorwissen', false],
  ['ungeeignetBeiStufe', 'bildungsstufe', true],
  ['bildungsstufe', 'bildungsstufe', false],
  ['technik', 'technikbedarf', false],
  ['zieltyp', 'funktionskette', false],
  ['grad', 'evidenzgrad', false],
  ['ansatz', 'ansatz', true],
  ['fachbereich', 'fachbereich', true],
  ['fachbereichUngeeignet', 'fachbereich', true]
];

const STEUERUNG_DIMS = ['organisation', 'lernweg', 'inhalt', 'sozial', 'bewertung'];
const MATCHES = ['closeMatch', 'relatedMatch', 'broadMatch'] as const;

const lit = (s: string) => '"' + String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n') + '"';
const allValues = (s: Scheme): VocabValue[] => s.werte || (s.gruppen || []).flatMap((g) => g.werte);
const json = (o: unknown) => JSON.stringify(o, null, 2) + '\n';

function prefixes(NS: string) {
  return `@prefix skos: <http://www.w3.org/2004/02/skos/core#> .
@prefix dct: <http://purl.org/dc/terms/> .
@prefix owl: <http://www.w3.org/2002/07/owl#> .
@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .
@prefix fmt: <${NS}ns#> .
`;
}

export function schemeTtl(D: FmtData, s: Scheme): string {
  const NS = D.NS;
  const schemeIri = (id: string) => `<${NS}vocab/${id}/>`;
  const conceptIri = (scheme: string, code: string) => `<${NS}vocab/${scheme}/${code}>`;

  const conceptTtl = (scheme: string, w: VocabValue, broader?: string) => {
    const lines = [
      `${conceptIri(scheme, w.id)} a skos:Concept`,
      `  skos:prefLabel ${lit(w.label)}@de`,
      `  skos:notation ${lit(w.id)}`,
      `  skos:inScheme ${schemeIri(scheme)}`
    ];
    if (broader) lines.push(`  skos:broader ${conceptIri(scheme, broader)}`);
    else lines.push(`  skos:topConceptOf ${schemeIri(scheme)}`);
    if (w.definition) lines.push(`  skos:definition ${lit(w.definition)}@de`);
    (w.alt || []).forEach((x) => lines.push(`  skos:altLabel ${lit(x)}@de`));
    MATCHES.forEach((m) => {
      const vals = w[m];
      if (!vals) return;
      (Array.isArray(vals) ? vals : [vals]).forEach((iri) => lines.push(`  skos:${m} <${iri}>`));
    });
    if (w.rang != null) lines.push(`  fmt:rang ${w.rang}`);
    (w.impliziert || []).forEach((x) => lines.push(`  fmt:impliziert ${conceptIri(scheme, x)}`));
    return lines.join(' ;\n') + ' .\n';
  };

  const tops = s.werte ? s.werte.map((w) => w.id) : (s.gruppen || []).map((gr) => gr.id);
  let out =
    prefixes(NS) +
    `\n${schemeIri(s.id)} a skos:ConceptScheme ;\n` +
    `  dct:title ${lit(s.titel)}@de ;\n` +
    `  dct:description ${lit(s.beschreibung)}@de ;\n` +
    `  dct:creator ${lit(D.creator)} ;\n` +
    `  dct:license <${D.license}> ;\n` +
    `  owl:versionInfo ${lit(D.VERSION)} ;\n` +
    `  skos:hasTopConcept ${tops.map((t) => conceptIri(s.id, t)).join(', ')} .\n\n`;

  if (s.werte) {
    s.werte.forEach((w) => {
      out += conceptTtl(s.id, w) + '\n';
    });
  } else {
    (s.gruppen || []).forEach((gr) => {
      out +=
        conceptTtl(s.id, { id: gr.id, label: gr.label }).replace(
          / \.\n$/,
          ` ;\n  skos:narrower ${gr.werte.map((w) => conceptIri(s.id, w.id)).join(', ')} .\n`
        ) + '\n';
      gr.werte.forEach((w) => {
        out += conceptTtl(s.id, w, gr.id) + '\n';
      });
    });
  }
  return out;
}

export function chainTtl(D: FmtData): string {
  const NS = D.NS;
  const schemeIri = (id: string) => `<${NS}vocab/${id}/>`;
  const conceptIri = (scheme: string, code: string) => `<${NS}vocab/${scheme}/${code}>`;

  let out =
    prefixes(NS) +
    `\n${schemeIri('funktionskette')} a skos:ConceptScheme ;\n` +
    `  dct:title "Funktionskette"@de ;\n` +
    `  dct:description "Zieltypen mit geordneten Lernfunktionen und Zielzuständen (nach Oser & Baeriswyl)."@de ;\n` +
    `  dct:creator ${lit(D.creator)} ;\n` +
    `  dct:license <${D.license}> ;\n` +
    `  owl:versionInfo ${lit(D.VERSION)} ;\n` +
    `  skos:hasTopConcept ${D.ketten.map((k) => conceptIri('funktionskette', k.id)).join(', ')} .\n\n`;

  D.ketten.forEach((k) => {
    const matchLines = MATCHES.flatMap((m) => {
      const vals = k[m];
      if (!vals) return [];
      return (Array.isArray(vals) ? vals : [vals]).map((iri) => `  skos:${m} <${iri}> ;\n`);
    }).join('');
    out +=
      `${conceptIri('funktionskette', k.id)} a skos:Concept ;\n` +
      `  skos:prefLabel ${lit(k.label)}@de ;\n` +
      `  skos:notation ${lit(k.id)} ;\n` +
      `  skos:inScheme ${schemeIri('funktionskette')} ;\n` +
      `  skos:topConceptOf ${schemeIri('funktionskette')} ;\n` +
      matchLines +
      `  skos:narrower ${k.schritte.map((s) => conceptIri('funktionskette', s.id)).join(', ')} .\n\n`;

    k.schritte.forEach((s, i) => {
      out +=
        `${conceptIri('funktionskette', s.id)} a skos:Concept ;\n` +
        `  skos:prefLabel ${lit(s.label)}@de ;\n` +
        `  skos:notation ${lit(s.id)} ;\n` +
        `  skos:inScheme ${schemeIri('funktionskette')} ;\n` +
        `  skos:broader ${conceptIri('funktionskette', k.id)} ;\n` +
        `  fmt:position ${i + 1} ;\n` +
        s.funktion.map((f) => `  fmt:lernfunktion ${conceptIri('lernfunktion', f)} ;\n`).join('') +
        `  fmt:zielzustand ${conceptIri('lernzustand', s.ziel)} .\n\n`;
    });
  });
  return out;
}

export function ontologyTtl(D: FmtData): string {
  const NS = D.NS;
  const classes: Array<[string, string]> = [
    ['Baustein', 'Benannte Methode auf Beschreibungsstufe Muster, mit Facettenprofil und typisierter Schnittstelle'],
    ['Slot', 'Benannte Stelle in einem Baustein, die ein Baustein kleinerer Reichweite füllt'],
    ['Kernkomponente', 'Unverzichtbarer Bestandteil eines Bausteins'],
    ['Evidenzaussage', 'Befund mit Evidenzgrad und Quelle'],
    ['Quelle', 'Quellenangabe eines Bausteins (freie Quelle oder Fachliteratur)'],
    ['Steuerungsprofil', 'Steuerungsträger je Steuerungsdimension'],
    ['Arrangement', 'Komposition von Bausteinen für ein Lehr-Lern-Setting'],
    ['Kontext', 'Bedingungsraum eines Arrangements'],
    ['Knoten', 'Element im Ablaufbaum eines Arrangements'],
    ['Belegung', 'Füllung eines Slots mit einem Knoten']
  ];
  const nodeTypes: Array<[string, string]> = [
    ['Einsatz', 'Verwendung eines Bausteins'],
    ['Sequenz', 'Geordnete Folge'],
    ['Parallel', 'Hauptablauf mit Begleitsträngen'],
    ['Wiederkehr', 'Verteilt wiederkehrender Baustein'],
    ['Alternative', 'Adaptive Verzweigung'],
    ['Verweis', 'Einbindung eines Arrangements']
  ];

  let out =
    prefixes(NS) +
    '@prefix rdf: <http://www.w3.org/1999/02/22-rdf-syntax-ns#> .\n' +
    '@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .\n' +
    `\n<${NS}ns#> a owl:Ontology ;\n` +
    `  dct:title "Facettierte Methodentaxonomie (FMT)"@de ;\n` +
    `  dct:creator ${lit(D.creator)} ;\n` +
    `  dct:license <${D.license}> ;\n` +
    `  owl:versionInfo ${lit(D.VERSION)} .\n\n`;

  classes.forEach(([c, d]) => {
    out += `fmt:${c} a rdfs:Class ;\n  rdfs:label ${lit(c)}@de ;\n  rdfs:comment ${lit(d)}@de .\n\n`;
  });
  nodeTypes.forEach(([c, d]) => {
    out += `fmt:${c} a rdfs:Class ;\n  rdfs:subClassOf fmt:Knoten ;\n  rdfs:label ${lit(c)}@de ;\n  rdfs:comment ${lit(d)}@de .\n\n`;
  });
  VOCAB_PROPS.forEach(([p, s]) => {
    out += `fmt:${p} a rdf:Property ;\n  rdfs:label ${lit(p)}@de ;\n  rdfs:range skos:Concept ;\n  rdfs:comment ${lit('Werte aus ' + NS + 'vocab/' + s + '/')}@de .\n\n`;
  });
  STEUERUNG_DIMS.forEach((d) => {
    out += `fmt:steuerung_${d} a rdf:Property ;\n  rdfs:domain fmt:Steuerungsprofil ;\n  rdfs:range skos:Concept ;\n  rdfs:label ${lit('Steuerung ' + d)}@de .\n\n`;
  });
  const objProps: Array<[string, string, string]> = [
    ['slot', 'Baustein', 'Slot'],
    ['kernkomponente', 'Baustein', 'Kernkomponente'],
    ['evidenz', 'Baustein', 'Evidenzaussage'],
    ['steuerung', 'Baustein', 'Steuerungsprofil'],
    ['kontext', 'Arrangement', 'Kontext'],
    ['ablauf', 'Arrangement', 'Knoten'],
    ['baustein', 'Knoten', 'Baustein'],
    ['belegung', 'Einsatz', 'Belegung'],
    ['inhalt', 'Belegung', 'Knoten'],
    ['teile', 'Sequenz', 'rdf:List'],
    ['haupt', 'Parallel', 'Knoten'],
    ['begleitend', 'Parallel', 'Knoten'],
    ['optionen', 'Alternative', 'Knoten'],
    ['arrangement', 'Verweis', 'Arrangement']
  ];
  objProps.forEach(([p, dom, rng]) => {
    out += `fmt:${p} a rdf:Property ;\n  rdfs:domain fmt:${dom} ;\n  rdfs:range ${rng.includes(':') ? rng : 'fmt:' + rng} .\n\n`;
  });
  out += `fmt:status a rdf:Property ;\n  rdfs:domain fmt:Baustein ;\n  rdfs:range xsd:string .\n\n`;
  out += `fmt:quelltyp a rdf:Property ;\n  rdfs:domain fmt:Quelle ;\n  rdfs:range xsd:string .\n\n`;
  return out;
}

export function buildContext(D: FmtData) {
  const NS = D.NS;
  const ctx: Record<string, unknown> = {
    '@version': 1.1,
    '@vocab': NS + 'ns#',
    dct: 'http://purl.org/dc/terms/',
    fmt: NS + 'ns#',
    skos: 'http://www.w3.org/2004/02/skos/core#',
    schema: 'https://schema.org/',
    xsd: 'http://www.w3.org/2001/XMLSchema#',
    typ: '@type',
    name: 'schema:name',
    kurzbeschreibung: 'schema:description',
    status: 'fmt:status',
    creator: 'dct:creator',
    license: { '@id': 'dct:license', '@type': '@id' },
    quellen: { '@id': 'dct:source', '@container': '@set' },
    titel: 'dct:title',
    url: { '@id': 'schema:url', '@type': '@id' },
    quelltyp: 'fmt:quelltyp',
    lizenz: 'dct:license',
    hinweis: 'fmt:hinweis',
    geltung: 'fmt:geltung',
    umstritten: 'fmt:umstritten',
    alternativname: { '@id': 'skos:altLabel', '@container': '@set' },
    problem: 'fmt:problem',
    raum: 'fmt:raum',
    durchfuehrung: { '@id': 'fmt:durchfuehrung', '@container': '@list' },
    material: { '@id': 'fmt:material', '@container': '@set' },
    variante: { '@id': 'fmt:variante', '@container': '@set' },
    kategorie: { '@id': 'dct:subject', '@type': '@id', '@container': '@set' },
    gruppeMin: { '@id': 'fmt:gruppeMin', '@type': 'xsd:integer' },
    gruppeMax: { '@id': 'fmt:gruppeMax', '@type': 'xsd:integer' },
    vorbereitungMin: { '@id': 'fmt:vorbereitungMin', '@type': 'xsd:integer' },
    internet: { '@id': 'fmt:internet', '@type': 'xsd:boolean' },
    teamMin: { '@id': 'fmt:teamMin', '@type': 'xsd:integer' },
    teamMax: { '@id': 'fmt:teamMax', '@type': 'xsd:integer' },
    komposit: { '@id': 'fmt:komposit', '@type': 'xsd:boolean' },
    kennung: 'fmt:kennung',
    befund: 'fmt:befund',
    quelle: 'fmt:quelle',
    stufe: 'fmt:stufe',
    fach: 'fmt:fach',
    kriterium: 'fmt:kriterium',
    kettenschritt: 'fmt:kettenschritt',
    slotKennung: 'fmt:slotKennung',
    dauerMin: { '@id': 'fmt:dauerMin', '@type': 'xsd:integer' },
    dauerMax: { '@id': 'fmt:dauerMax', '@type': 'xsd:integer' },
    anzahl: { '@id': 'fmt:anzahl', '@type': 'xsd:integer' },
    zeitbudgetMin: { '@id': 'fmt:zeitbudgetMin', '@type': 'xsd:integer' },
    pflicht: { '@id': 'fmt:pflicht', '@type': 'xsd:boolean' },
    nachKernphase: { '@id': 'fmt:nachKernphase', '@type': 'xsd:boolean' },
    abstand: { '@id': 'fmt:abstand', '@type': 'xsd:duration' },
    ausserhalbBudget: { '@id': 'fmt:ausserhalbBudget', '@type': 'xsd:boolean' },
    qualitaetsrisiko: { '@id': 'fmt:qualitaetsrisiko', '@container': '@set' },
    weggelassen: { '@id': 'fmt:weggelassen', '@container': '@set' },
    kernkomponente: { '@id': 'fmt:kernkomponente', '@container': '@set' },
    slot: { '@id': 'fmt:slot', '@container': '@set' },
    evidenz: { '@id': 'fmt:evidenz', '@container': '@set' },
    kontext: { '@id': 'fmt:kontext' },
    ablauf: { '@id': 'fmt:ablauf' },
    haupt: { '@id': 'fmt:haupt' },
    inhalt: { '@id': 'fmt:inhalt' },
    teile: { '@id': 'fmt:teile', '@container': '@list' },
    begleitend: { '@id': 'fmt:begleitend', '@container': '@set' },
    optionen: { '@id': 'fmt:optionen', '@container': '@set' },
    belegung: { '@id': 'fmt:belegung', '@container': '@set' },
    arrangement: { '@id': 'fmt:arrangement', '@type': '@id' },
    baustein: { '@id': 'fmt:baustein', '@type': '@vocab', '@context': { '@vocab': NS + 'baustein/' } },
    steuerung: {
      '@id': 'fmt:steuerung',
      '@context': Object.fromEntries(
        STEUERUNG_DIMS.map((d) => [
          d,
          { '@id': `fmt:steuerung_${d}`, '@type': '@vocab', '@context': { '@vocab': `${NS}vocab/steuerungstraeger/` } }
        ])
      )
    }
  };
  VOCAB_PROPS.forEach(([p, s, multi]) => {
    ctx[p] = Object.assign(
      { '@id': `fmt:${p}`, '@type': '@vocab', '@context': { '@vocab': `${NS}vocab/${s}/` } },
      multi ? { '@container': '@set' } : {}
    );
  });
  return { '@context': ctx };
}

export function exportBaustein(D: FmtData, b: Baustein, withContext = true): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (withContext) out['@context'] = D.NS + 'context.jsonld';
  out['@id'] = D.NS + 'baustein/' + b.kennung;
  out.typ = 'Baustein';
  out.beschreibungsstufe = 's2';
  out.creator = D.creator;
  out.license = D.license;
  for (const [key, val] of Object.entries(b)) {
    if (key === 'plot' || key === 'ki' || key === 'piktogramm') continue;
    if (key === 'slot' && Array.isArray(val)) out.slot = val.map((s) => Object.assign({ typ: 'Slot' }, s));
    else if (key === 'kernkomponente' && Array.isArray(val))
      out.kernkomponente = val.map((x) => Object.assign({ typ: 'Kernkomponente' }, x));
    else if (key === 'evidenz' && Array.isArray(val))
      out.evidenz = val.map((x) => Object.assign({ typ: 'Evidenzaussage' }, x));
    else if (key === 'quellen' && Array.isArray(val))
      out.quellen = val.map((x) => Object.assign({ typ: 'Quelle' }, x));
    else if (key === 'steuerung' && val && typeof val === 'object')
      out.steuerung = Object.assign({ typ: 'Steuerungsprofil' }, val);
    else out[key] = val;
  }
  return out;
}

export function exportArrangement(D: FmtData, a: Arrangement): Record<string, unknown> {
  return { '@context': D.NS + 'context.jsonld', creator: D.creator, license: D.license, ...a };
}

export function buildSchema(D: FmtData) {
  const defs: Record<string, unknown> = {};
  D.schemes.forEach((s) => {
    defs['code_' + s.id] = { enum: allValues(s).map((w) => w.id) };
  });
  defs.code_funktionskette = { enum: D.ketten.map((k) => k.id) };
  defs.code_kettenschritt = { enum: D.ketten.flatMap((k) => k.schritte.map((s) => s.id)) };
  defs.code_baustein = { enum: D.bausteine.map((b) => b.kennung) };

  const arr = (ref: string) => ({ type: 'array', items: { $ref: '#/$defs/' + ref }, uniqueItems: true });
  const vocabProp: Record<string, unknown> = {};
  VOCAB_PROPS.forEach(([p, s, multi]) => {
    vocabProp[p] = multi ? arr('code_' + s) : { $ref: '#/$defs/code_' + s };
  });
  const ld = { '@context': {}, '@id': { type: 'string', format: 'uri' }, creator: { type: 'string' }, license: { type: 'string', format: 'uri' } };

  defs.Baustein = {
    type: 'object',
    additionalProperties: false,
    required: [
      'kennung',
      'name',
      'kurzbeschreibung',
      'status',
      'ansatz',
      'fachbereich',
      'quellen',
      'reichweite',
      'lernfunktion',
      'engagement',
      'anleitung',
      'interaktion',
      'raumzeit',
      'vorbedingung',
      'nachbedingung',
      'kernkomponente',
      'dauerMin',
      'dauerMax'
    ],
    properties: Object.assign({}, ld, {
      typ: { const: 'Baustein' },
      kennung: { type: 'string', pattern: '^[a-z0-9-]+$' },
      name: { type: 'string' },
      kurzbeschreibung: { type: 'string', minLength: 10 },
      status: { enum: ['kuratiert', 'entwurf'] },
      ansatz: Object.assign({ minItems: 1 }, vocabProp.ansatz),
      fachbereich: Object.assign({ minItems: 1 }, vocabProp.fachbereich),
      fachbereichUngeeignet: vocabProp.fachbereichUngeeignet,
      quellen: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['titel', 'quelltyp'],
          properties: {
            typ: { const: 'Quelle' },
            titel: { type: 'string', minLength: 2 },
            url: { type: 'string', format: 'uri' },
            quelltyp: { enum: ['wikipedia', 'oer', 'fachliteratur', 'institution'] },
            lizenz: { type: 'string' }
          }
        }
      },
      alternativname: { type: 'array', items: { type: 'string' }, uniqueItems: true },
      komposit: { type: 'boolean' },
      problem: { type: 'string' },
      raum: { type: 'string' },
      durchfuehrung: { type: 'array', items: { type: 'string' }, minItems: 2 },
      material: { type: 'array', items: { type: 'string' } },
      variante: { type: 'array', items: { type: 'string' } },
      kategorie: { type: 'array', items: { type: 'string', format: 'uri' }, uniqueItems: true },
      technik: vocabProp.technik,
      internet: { type: 'boolean' },
      teamMin: { type: 'integer', minimum: 1 },
      teamMax: { type: 'integer', minimum: 1 },
      gruppeMin: { type: 'integer', minimum: 1 },
      gruppeMax: { type: 'integer', minimum: 1 },
      vorbereitungMin: { type: 'integer', minimum: 0 },
      ungeeignetBeiStufe: vocabProp.ungeeignetBeiStufe,
      beschreibungsstufe: vocabProp.beschreibungsstufe,
      reichweite: vocabProp.reichweite,
      lernfunktion: Object.assign({ minItems: 1 }, vocabProp.lernfunktion),
      engagement: vocabProp.engagement,
      weltbezug: vocabProp.weltbezug,
      anleitung: Object.assign({ minItems: 1 }, vocabProp.anleitung),
      steuerung: {
        type: 'object',
        additionalProperties: false,
        properties: Object.assign(
          { typ: { const: 'Steuerungsprofil' } },
          Object.fromEntries(STEUERUNG_DIMS.map((d) => [d, { $ref: '#/$defs/code_steuerungstraeger' }]))
        )
      },
      adaptivitaet: vocabProp.adaptivitaet,
      feedback: vocabProp.feedback,
      interaktion: vocabProp.interaktion,
      repraesentation: vocabProp.repraesentation,
      raumzeit: vocabProp.raumzeit,
      rolle: vocabProp.rolle,
      aufgabe: vocabProp.aufgabe,
      sequenz: vocabProp.sequenz,
      vorbedingung: vocabProp.vorbedingung,
      nachbedingung: vocabProp.nachbedingung,
      geeignetBeiVorwissen: vocabProp.geeignetBeiVorwissen,
      kernkomponente: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kennung', 'name'],
          properties: { typ: { const: 'Kernkomponente' }, kennung: { type: 'string' }, name: { type: 'string' } }
        }
      },
      slot: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['kennung', 'name', 'lernfunktion', 'reichweite', 'pflicht'],
          properties: {
            typ: { const: 'Slot' },
            kennung: { type: 'string' },
            name: { type: 'string' },
            lernfunktion: vocabProp.lernfunktion,
            reichweite: vocabProp.reichweite,
            pflicht: { type: 'boolean' },
            nachKernphase: { type: 'boolean' }
          }
        }
      },
      dauerMin: { type: 'integer', minimum: 0 },
      dauerMax: { type: 'integer', minimum: 0 },
      hinweis: { type: 'string' },
      qualitaetsrisiko: { type: 'array', items: { type: 'string' } },
      evidenz: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['grad', 'befund', 'quelle'],
          properties: {
            typ: { const: 'Evidenzaussage' },
            grad: vocabProp.grad,
            befund: { type: 'string' },
            quelle: { type: 'string' },
            geltung: { type: 'string' },
            umstritten: { type: 'string' }
          }
        }
      }
    })
  };

  const knoten = { $ref: '#/$defs/Knoten' };
  const node = (typ: string, required: string[], props: Record<string, unknown>) => ({
    type: 'object',
    additionalProperties: false,
    required: ['typ', ...required],
    properties: Object.assign({ typ: { const: typ }, kettenschritt: { $ref: '#/$defs/code_kettenschritt' } }, props)
  });

  defs.Knoten = {
    oneOf: [
      node('Einsatz', ['baustein'], {
        baustein: { $ref: '#/$defs/code_baustein' },
        dauerMin: { type: 'integer', minimum: 0 },
        weggelassen: { type: 'array', items: { type: 'string' } },
        belegung: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['slotKennung', 'inhalt'],
            properties: { slotKennung: { type: 'string' }, inhalt: knoten }
          }
        }
      }),
      node('Sequenz', ['teile'], { teile: { type: 'array', items: knoten, minItems: 1 } }),
      node('Parallel', ['haupt', 'begleitend'], { haupt: knoten, begleitend: { type: 'array', items: knoten, minItems: 1 } }),
      node('Wiederkehr', ['baustein', 'anzahl'], {
        baustein: { $ref: '#/$defs/code_baustein' },
        anzahl: { type: 'integer', minimum: 1 },
        abstand: { type: 'string', pattern: '^P' },
        dauerMin: { type: 'integer', minimum: 0 },
        ausserhalbBudget: { type: 'boolean' }
      }),
      node('Alternative', ['optionen'], {
        kriterium: { type: 'string' },
        optionen: { type: 'array', items: knoten, minItems: 2 }
      }),
      node('Verweis', ['arrangement'], { arrangement: { type: 'string', format: 'uri' } })
    ]
  };

  defs.Arrangement = {
    type: 'object',
    additionalProperties: false,
    required: ['typ', 'name', 'reichweite', 'ablauf'],
    properties: Object.assign({}, ld, {
      typ: { const: 'Arrangement' },
      name: { type: 'string' },
      reichweite: vocabProp.reichweite,
      zieltyp: { $ref: '#/$defs/code_funktionskette' },
      kontext: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stufe: { type: 'string' },
          bildungsstufe: vocabProp.bildungsstufe,
          fach: { type: 'string' },
          vorwissen: vocabProp.vorwissen,
          zeitbudgetMin: { type: 'integer', minimum: 0 }
        }
      },
      ablauf: knoten
    })
  };

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: D.NS + 'fmt.schema.json',
    title: 'FMT Baustein oder Arrangement',
    oneOf: [{ $ref: '#/$defs/Baustein' }, { $ref: '#/$defs/Arrangement' }],
    $defs: defs
  };
}

function resolveOehLabels(dataDir: string, D: FmtData): Record<string, string> {
  interface OehConcept {
    id: string;
    prefLabel: { de: string };
    narrower?: OehConcept[];
  }
  const vocab = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'crosswalk', 'oeh-didacticPlanningTools.json'), 'utf8')
  ) as { id: string; hasTopConcept: OehConcept[] };

  const all = new Map<string, string>();
  const walk = (c: OehConcept) => {
    all.set(c.id, c.prefLabel.de);
    (c.narrower || []).forEach(walk);
  };
  vocab.hasTopConcept.forEach(walk);

  const used = new Set<string>();
  const take = (x?: string | string[]) => {
    if (!x) return;
    (Array.isArray(x) ? x : [x]).filter((iri) => iri.startsWith(vocab.id)).forEach((iri) => used.add(iri));
  };
  D.schemes.forEach((s) => allValues(s).forEach((w) => MATCHES.forEach((m) => take(w[m]))));
  D.ketten.forEach((k) => MATCHES.forEach((m) => take(k[m])));
  D.bausteine.forEach((b) => take(b.kategorie));

  const missing = [...used].filter((iri) => !all.has(iri));
  if (missing.length) throw new Error('Unbekannte OEH-Konzepte: ' + missing.join(', '));
  return Object.fromEntries([...used].sort().map((iri) => [iri, all.get(iri)!]));
}

export function buildAllArtefacts(rootDir: string) {
  const dataDir = path.join(rootDir, 'data');
  const distDir = path.join(rootDir, 'dist-data');
  const D = loadFmtData(dataDir);
  const oeh = resolveOehLabels(dataDir, D);

  fs.rmSync(distDir, { recursive: true, force: true });
  const write = (rel: string, content: string) => {
    const p = path.join(distDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
  };

  D.schemes.forEach((s) => write(`vocabs/${s.id}.ttl`, schemeTtl(D, s)));
  write('vocabs/funktionskette.ttl', chainTtl(D));
  write('ontologie.ttl', ontologyTtl(D));
  write('context.jsonld', json(buildContext(D)));
  write('fmt.schema.json', json(buildSchema(D)));
  write('anfrage.schema.json', json(createMatcher(D, createValidator(D)).schema()));

  D.bausteine.forEach((b) => write(`bausteine/${b.kennung}.jsonld`, json(exportBaustein(D, b))));
  write(
    'bausteine/katalog.jsonld',
    json({
      '@context': D.NS + 'context.jsonld',
      creator: D.creator,
      license: D.license,
      '@graph': D.bausteine.map((b) => exportBaustein(D, b, false))
    })
  );
  D.beispiele.forEach((a) => {
    const id = (a['@id'] || a.name).split('/').pop()!;
    write(`beispiele/${id}.jsonld`, json(exportArrangement(D, a)));
  });

  const hashPayload = JSON.stringify({
    version: D.VERSION,
    schemes: D.schemes,
    facetten: D.facetten,
    ketten: D.ketten,
    bausteine: D.bausteine,
    beispiele: D.beispiele,
    oeh
  });
  const versionHash = crypto.createHash('sha256').update(hashPayload).digest('hex');

  const bundle: CatalogBundle = {
    version: D.VERSION,
    versionHash,
    builtAt: new Date().toISOString(),
    NS: D.NS,
    creator: D.creator,
    license: D.license,
    licenseName: D.licenseName || 'CC BY 4.0',
    repository: D.repository || 'https://github.com/janschachtschabel/Facettierte-Methodentaxonomie',
    schemes: D.schemes,
    facetten: D.facetten,
    ketten: D.ketten,
    bausteine: D.bausteine,
    beispiele: D.beispiele,
    oeh,
    rules: FMT_RULES
  };
  write('catalog.bundle.json', json(bundle));
  return { version: D.VERSION, versionHash, blocks: D.bausteine.length, schemes: D.schemes.length + 1 };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
  const res = buildAllArtefacts(rootDir);
  console.log(`Built dist-data/ (v${res.version}, ${res.blocks} blocks, ${res.schemes} SKOS schemes, hash ${res.versionHash.slice(0, 12)})`);
}
