/**
 * Order of the technology vocabulary (data/vocab.json, scheme technikbedarf, field rang).
 * One table for all filters, so a limit such as "Geräte je Gruppe" means the same everywhere.
 */
export const TECH_RANK: Readonly<Record<string, number>> = Object.freeze({
  't-keine': 0,
  't-projektion': 1,
  't-geteilt': 2,
  't-einzeln': 3
});

/** Highest rank; used when no limit is set. */
export const TECH_RANK_MAX = 3;

/** Rank of a limit; an unknown value sets no limit. */
export const techLimitRank = (maxTechnik?: string): number =>
  maxTechnik && maxTechnik in TECH_RANK ? TECH_RANK[maxTechnik] : TECH_RANK_MAX;
