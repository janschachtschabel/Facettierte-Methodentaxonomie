import type { FmtData, Merkmal } from './types.js';

/** The attribute for a field at the method, if the W-grid has one. */
export function merkmalFuer(data: FmtData, feld: string): Merkmal | undefined {
  return data.merkmale.find((m) => m.feld === feld);
}

/** Attributes grouped by W-field, in the order of the W-fields; a W-field without attributes maps to []. */
export function merkmaleNachWFeld(data: FmtData): Map<string, Merkmal[]> {
  const out = new Map<string, Merkmal[]>(data.wfelder.map((w) => [w.id, []]));
  for (const m of data.merkmale) out.get(m.wfeld)?.push(m);
  return out;
}
