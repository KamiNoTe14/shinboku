// Battle League IV ranks.
//
// In a league with a CP cap, the best IVs are the ones that give the highest
// "stat product" (attack × defense × HP) once the Pokémon is powered up as far
// as it can go without passing the cap. Low attack often wins here, which is why
// a 0/15/15 can rank far above a 15/15/15.

import { CPM } from "./cpm";
import type { BaseStats, IVs } from "./stats";

export const LEAGUES = {
  gl: { name: "Great League", short: "Great", cap: 1500 },
  ul: { name: "Ultra League", short: "Ultra", cap: 2500 },
} as const;
export type League = keyof typeof LEAGUES;
export const LEAGUE_KEYS = Object.keys(LEAGUES) as League[];

/** Ranks assume the normal level cap. A best buddy can go one level higher. */
export const RANK_MAX_LEVEL = 50;
const MAX_IDX = (RANK_MAX_LEVEL - 1) * 2;

// Shadow Pokémon hit 20% harder and take 20% more damage in battle.
const SHADOW_ATK = 6 / 5;
const SHADOW_DEF = 5 / 6;

const CPM2 = CPM.map((c) => c * c);

/** Highest level index (0 = level 1) at which CP stays at or under the cap, or -1. */
function bestIndex(cpBase: number, cap: number): number {
  if (Math.max(10, Math.floor(cpBase * CPM2[0])) > cap) return -1;
  let lo = 0;
  let hi = MAX_IDX;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (Math.max(10, Math.floor(cpBase * CPM2[mid])) <= cap) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

function statProduct(base: BaseStats, iv: IVs, idx: number, shadow: boolean): number {
  const m = CPM[idx];
  const atk = (base.atk + iv.atk) * m * (shadow ? SHADOW_ATK : 1);
  const def = (base.def + iv.def) * m * (shadow ? SHADOW_DEF : 1);
  const hp = Math.max(10, Math.floor((base.sta + iv.sta) * m));
  return atk * def * hp;
}

const cpBaseOf = (base: BaseStats, iv: IVs) =>
  ((base.atk + iv.atk) * Math.sqrt((base.def + iv.def) * (base.sta + iv.sta))) / 10;

type Table = { sorted: Float64Array; top: number };
const tables = new Map<string, Table | null>();

/** Stat products of all 4,096 IV spreads, best first. Cached per species, league and shadow. */
function tableFor(key: string, base: BaseStats, cap: number, shadow: boolean): Table | null {
  const cached = tables.get(key);
  if (cached !== undefined) return cached;
  const products: number[] = [];
  for (let a = 0; a <= 15; a++)
    for (let d = 0; d <= 15; d++)
      for (let s = 0; s <= 15; s++) {
        const iv = { atk: a, def: d, sta: s };
        const idx = bestIndex(cpBaseOf(base, iv), cap);
        if (idx >= 0) products.push(statProduct(base, iv, idx, shadow));
      }
  const table = products.length
    ? { sorted: Float64Array.from(products).sort().reverse(), top: Math.max(...products) }
    : null;
  tables.set(key, table);
  return table;
}

export type PvpRank = {
  rank: number; // 1 = best of 4,096
  pct: number; // stat product as a percent of rank 1
  level: number; // level to power up to
  cp: number; // CP at that level
};

/** League rank for one Pokémon's IVs as a given species. Null if it can't fit under the cap. */
export function pvpRank(
  species: BaseStats & { id: string },
  iv: IVs,
  league: League,
  shadow = false,
): PvpRank | null {
  const { cap } = LEAGUES[league];
  const table = tableFor(`${species.id}|${league}|${shadow ? 1 : 0}`, species, cap, shadow);
  if (!table) return null;
  const cpBase = cpBaseOf(species, iv);
  const idx = bestIndex(cpBase, cap);
  if (idx < 0) return null;
  const product = statProduct(species, iv, idx, shadow);

  // Count spreads with a strictly higher product (the table is sorted high to low).
  const eps = product * 1e-12;
  let lo = 0;
  let hi = table.sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (table.sorted[mid] > product + eps) lo = mid + 1;
    else hi = mid;
  }
  return {
    rank: lo + 1,
    pct: Math.round((product / table.top) * 1000) / 10,
    level: idx / 2 + 1,
    cp: Math.max(10, Math.floor(cpBase * CPM2[idx])),
  };
}
