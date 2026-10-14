// Pokémon GO stat math: CP, HP, and working backward from what a trainer sees
// (CP, HP and the appraisal) to the Pokémon's exact level.

import { cpmAt, levels, MAX_LEVEL } from "./cpm";

export type BaseStats = { atk: number; def: number; sta: number };
export type IVs = { atk: number; def: number; sta: number };

export function calcCP(base: BaseStats, iv: IVs, level: number): number {
  const m = cpmAt(level);
  const cp = Math.floor(
    ((base.atk + iv.atk) * Math.sqrt(base.def + iv.def) * Math.sqrt(base.sta + iv.sta) * m * m) / 10,
  );
  return Math.max(10, cp);
}

export function calcHP(base: BaseStats, iv: IVs, level: number): number {
  return Math.max(10, Math.floor((base.sta + iv.sta) * cpmAt(level)));
}

export function ivPercent(iv: IVs): number {
  return Math.round(((iv.atk + iv.def + iv.sta) / 45) * 100);
}

/** The in-game appraisal: 0 to 3 stars based on total IVs. */
export function appraisalStars(iv: IVs): 0 | 1 | 2 | 3 {
  const total = iv.atk + iv.def + iv.sta;
  if (total >= 37) return 3;
  if (total >= 30) return 2;
  if (total >= 23) return 1;
  return 0;
}

export function isValidIV(n: number): boolean {
  return Number.isInteger(n) && n >= 0 && n <= 15;
}

/**
 * Levels at which a Pokémon with these base stats and IVs shows exactly this CP
 * (and this HP, if given). Usually one level; occasionally two adjacent half-levels
 * share a CP, in which case HP or stardust cost tells them apart.
 */
export function matchingLevels(base: BaseStats, iv: IVs, cp: number, hp?: number): number[] {
  return levels(1, MAX_LEVEL).filter(
    (l) => calcCP(base, iv, l) === cp && (hp === undefined || calcHP(base, iv, l) === hp),
  );
}

export type Candidate = { iv: IVs; level: number };

/**
 * Every IV spread and level consistent with a CP (and optionally HP). Used to
 * check entries where the appraisal wasn't given, or to flag a likely typo.
 */
export function solveIVs(base: BaseStats, cp: number, hp?: number, minIV = 0): Candidate[] {
  const out: Candidate[] = [];
  for (const level of levels(1, MAX_LEVEL)) {
    for (let atk = minIV; atk <= 15; atk++) {
      for (let def = minIV; def <= 15; def++) {
        for (let sta = minIV; sta <= 15; sta++) {
          const iv = { atk, def, sta };
          if (calcCP(base, iv, level) !== cp) continue;
          if (hp !== undefined && calcHP(base, iv, level) !== hp) continue;
          out.push({ iv, level });
        }
      }
    }
  }
  return out;
}

/** Highest CP this species can reach at a given level with given IVs. */
export function maxCP(base: BaseStats, iv: IVs = { atk: 15, def: 15, sta: 15 }, level = 50): number {
  return calcCP(base, iv, level);
}
