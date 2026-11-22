import fs from 'node:fs';
import path from 'node:path';
import {
  buildScalePrototypes,
  type FmtData,
  type ScaleHit,
  type ScaleName,
  type SemanticMethodHit,
  type SemanticScaleClassification
} from '@fmt/core';

// Precomputed IEEE-754 float16 -> float32 lookup table (65,536 entries, instant O(1) decode)
const F16_TO_F32 = new Float32Array(65536);
for (let h = 0; h < 65536; h++) {
  const s = (h >> 15) & 1;
  const e = (h >> 10) & 0x1f;
  const m = h & 0x3ff;
  let val: number;
  if (e === 0) val = (m / 1024) * Math.pow(2, -14);
  else if (e === 31) val = m === 0 ? Infinity : NaN;
  else val = (1 + m / 1024) * Math.pow(2, e - 15);
  F16_TO_F32[h] = s ? -val : val;
}

export interface Model2VecClassifier {
  modelId: string;
  dim: number;
  vocabSize: number;
  loadMs: number;
  encode(text: string): Float32Array;
  classifyScales(text: string): SemanticScaleClassification;
  rankMethods(text: string, limit?: number): SemanticMethodHit[];
}

function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

/**
 * Pure-Node.js loader & inference engine for Model2Vec static embeddings
 * (e.g., https://huggingface.co/JanSchachtschabel/m2v-qwen3-4b-256-edu, Apache-2.0).
 * Reads `tokenizer.json` + `model.safetensors` (float16) directly with zero Python/ONNX dependencies.
 */
export function loadModel2VecClassifier(modelDir: string, data: FmtData): Model2VecClassifier | null {
  const tokPath = path.join(modelDir, 'tokenizer.json');
  const stPath = path.join(modelDir, 'model.safetensors');
  if (!fs.existsSync(tokPath) || !fs.existsSync(stPath)) return null;

  const t0 = Date.now();
  const tokJson = JSON.parse(fs.readFileSync(tokPath, 'utf8')) as {
    model?: { vocab?: Record<string, number> };
    added_tokens?: Array<{ content?: string; id?: number }>;
  };

  const vocab = new Map<string, number>();
  for (const [k, id] of Object.entries(tokJson.model?.vocab || {})) {
    if (typeof id === 'number') vocab.set(k, id);
  }
  for (const at of tokJson.added_tokens || []) {
    if (typeof at.content === 'string' && typeof at.id === 'number') {
      vocab.set(at.content, at.id);
    }
  }

  const stBuf = fs.readFileSync(stPath);
  const headerLen = Number(stBuf.readBigUInt64LE(0));
  const header = JSON.parse(stBuf.subarray(8, 8 + headerLen).toString('utf8')) as {
    embeddings?: { dtype: string; shape: [number, number]; data_offsets: [number, number] };
  };
  if (!header.embeddings || header.embeddings.dtype !== 'F16') {
    throw new Error('Model2Vec safetensors benötigt F16-Tensor "embeddings".');
  }
  const [numRows, dim] = header.embeddings.shape;
  const dataStart = 8 + headerLen + header.embeddings.data_offsets[0];
  const f16View = new Uint16Array(stBuf.buffer, stBuf.byteOffset + dataStart, numRows * dim);

  const encode = (text: string): Float32Array => {
    const tokenIds: number[] = [];
    const words = (text || '').replace(/\s+/g, ' ').trim().split(' ');
    for (const rawWord of words) {
      const clean = rawWord.replace(/^[.,;:!?()[\]„“"']+|[.,;:!?()[\]„“"']+$/g, '');
      if (!clean) continue;
      // Direct lookup covers the education-enriched added vocabulary (inflected & base forms)
      const directCandidates = [clean, clean.toLowerCase(), `Ġ${clean}`, `Ġ${clean.toLowerCase()}`];
      let hit: number | undefined;
      for (const cand of directCandidates) {
        const id = vocab.get(cand);
        if (id !== undefined && id < numRows) {
          hit = id;
          break;
        }
      }
      if (hit !== undefined) {
        tokenIds.push(hit);
        continue;
      }
      // Greedy longest-subword fallback
      let pos = 0;
      const lower = clean.toLowerCase();
      while (pos < lower.length) {
        let bestId: number | undefined;
        let bestLen = 0;
        const maxEnd = Math.min(lower.length, pos + 20);
        for (let end = maxEnd; end > pos; end--) {
          const sub = lower.slice(pos, end);
          const id = (pos === 0 ? vocab.get(`Ġ${sub}`) : undefined) ?? vocab.get(sub);
          if (id !== undefined && id < numRows) {
            bestId = id;
            bestLen = end - pos;
            break;
          }
        }
        if (bestId !== undefined) {
          tokenIds.push(bestId);
          pos += bestLen;
        } else {
          pos += 1;
        }
      }
    }

    const vec = new Float32Array(dim);
    if (!tokenIds.length) return vec;
    for (const id of tokenIds) {
      const base = id * dim;
      for (let d = 0; d < dim; d++) vec[d] += F16_TO_F32[f16View[base + d]];
    }
    let norm = 0;
    for (let d = 0; d < dim; d++) norm += vec[d] * vec[d];
    norm = Math.sqrt(norm) || 1;
    for (let d = 0; d < dim; d++) vec[d] /= norm;
    return vec;
  };

  // Precompute normalized prototype vectors for all FMT scales & all methods once at startup
  const prototypes = buildScalePrototypes(data).map((p) => ({
    ...p,
    vec: encode(p.text)
  }));
  const scales: ScaleName[] = ['ansatz', 'lernfunktion', 'anleitung', 'engagement', 'interaktion', 'reichweite'];

  const methodVecs = data.bausteine.map((b) => ({
    kennung: b.kennung,
    name: b.name,
    vec: encode(
      [b.name, ...(b.alternativname || []), b.kurzbeschreibung, b.problem || '', ...(b.durchfuehrung || []).slice(0, 3)].join(
        ' '
      )
    )
  }));

  const loadMs = Date.now() - t0;

  return {
    modelId: path.basename(modelDir),
    dim,
    vocabSize: numRows,
    loadMs,
    encode,
    classifyScales(text: string): SemanticScaleClassification {
      const s0 = Date.now();
      const qv = encode(text);
      const out = {} as Record<ScaleName, ScaleHit[]>;
      for (const s of scales) {
        const scored = prototypes
          .filter((p) => p.scale === s)
          .map((p) => ({ code: p.code, label: p.label, score: Math.round(dot(qv, p.vec) * 100) / 100 }))
          .sort((a, b) => b.score - a.score);
        const top = scored[0]?.score ?? 0;
        out[s] = scored.filter((x) => x.score >= 0.22 && x.score >= top - 0.14).slice(0, 3);
      }
      return { engine: 'model2vec', dauerMs: Date.now() - s0, scales: out };
    },
    rankMethods(text: string, limit = 10): SemanticMethodHit[] {
      const qv = encode(text);
      return methodVecs
        .map((m) => ({ kennung: m.kennung, name: m.name, score: Math.round(dot(qv, m.vec) * 100) / 100 }))
        .sort((a, b) => b.score - a.score)
        .filter((x) => x.score >= 0.22)
        .slice(0, limit);
    }
  };
}
