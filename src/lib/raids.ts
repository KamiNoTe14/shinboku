// Raid counters, raid teams from the bag, and power-up and evolve suggestions
// that build on the raid model in ./go/raid.ts.

import type { Row } from "./bagRows";
import { ALL_TYPES, type EvolutionCost, type GameData, type PokemonType, type Species } from "./go/gamedata";
import { powerUpCost, type Cost } from "./go/powerup";
import { asTarget, bestMoveset, raidPerformance, type Performance, type Target, type Weather } from "./go/raid";
import { calcCP, matchingLevels, type IVs } from "./go/stats";
import { evolutionLine, GOOD_IV_RANK, levelOf, type Assessment, type PvpPick } from "./recommend";

const HUNDO: IVs = { atk: 15, def: 15, sta: 15 };
/** What Shinboku assumes for a Pokémon that hasn't been appraised. */
export const ASSUMED_IV: IVs = { atk: 10, def: 10, sta: 10 };
/** Counters and power-up targets are compared at this level. */
export const RAID_LEVEL = 40;
export const TEAM_SIZE = 6;

const ivOf = (row: Row): IVs | null => (row.iv ? { atk: row.iv[0], def: row.iv[1], sta: row.iv[2] } : null);

/** The base form a Mega or Primal Evolution comes from, e.g. "charizard" for "charizard_mega_x". */
export const megaBase = (sp: Species) => sp.id.replace(/_(mega|primal)(_[xy])?$/, "");

const usable = (sp: Species) => !sp.unreleased;

/**
 * Scores are DPS³ × TDO, so a straight ratio exaggerates gaps (90% as fast reads
 * as 66%). The fourth root turns it back into "about this strong", in percent.
 */
export const relativeStrength = (score: number, best: number) =>
  best > 0 ? Math.round(Math.pow(score / best, 0.25) * 100) : 0;

// ---------------------------------------------------------------- counters

export type Counter = {
  sp: Species;
  shadow: boolean;
  fast: string;
  charged: string;
  elite: boolean;
  perf: Performance;
};

/** Every released Pokémon (and Shadow form) with its best moveset against a boss, best first. */
export function counters(boss: Species, weather: Weather, data: GameData): Counter[] {
  const target = asTarget(boss);
  const out: Counter[] = [];
  for (const sp of data.species) {
    if (!usable(sp)) continue;
    for (const shadow of sp.shadow ? [false, true] : [false]) {
      const pick = bestMoveset(sp, HUNDO, RAID_LEVEL, shadow, target, weather, data);
      if (pick) out.push({ sp, shadow, ...pick });
    }
  }
  return out.sort((a, b) => b.perf.score - a.perf.score);
}

// ---------------------------------------------------------------- bag team

export type TeamMember = {
  row: Row;
  level: number;
  fast: string;
  charged: string;
  perf: Performance;
  /** No appraisal, so 10/10/10 was assumed. */
  estimatedIv: boolean;
  /** Moves weren't entered, so the best moveset without Elite TMs was assumed. */
  assumedMoves: boolean;
};

/** A level for Pokémon without a usable appraisal: the one whose CP is closest at the assumed IVs. */
function estimateLevel(row: Row): number {
  const exact = matchingLevels(row.sp, ASSUMED_IV, row.cp);
  if (exact.length) return exact[0];
  let best = 1;
  for (let l = 1; l <= 50; l += 0.5) {
    if (Math.abs(calcCP(row.sp, ASSUMED_IV, l) - row.cp) < Math.abs(calcCP(row.sp, ASSUMED_IV, best) - row.cp)) best = l;
  }
  return best;
}

/** How a bag Pokémon does against a target, using what's known about it. */
function bagPerformance(
  row: Row,
  level: number,
  target: Target,
  weather: Weather,
  data: GameData,
  chargedType?: PokemonType,
): Omit<TeamMember, "row" | "level"> | null {
  const iv = ivOf(row) ?? ASSUMED_IV;
  const shadow = row.variant === "shadow";
  const estimatedIv = !row.iv;
  if (row.fast && row.charged) {
    let best: Omit<TeamMember, "row" | "level"> | null = null;
    for (const charged of [row.charged, row.charged2]) {
      if (!charged || (chargedType && data.moves[charged]?.type !== chargedType)) continue;
      const perf = raidPerformance({ species: row.sp, iv, level, shadow, fast: row.fast, charged }, target, weather, data);
      if (perf && (!best || perf.score > best.perf.score)) {
        best = { fast: row.fast, charged, perf, estimatedIv, assumedMoves: false };
      }
    }
    return best;
  }
  const pick = bestMoveset(
    row.sp, iv, level, shadow, target, weather, data, false,
    chargedType ? (t) => t === chargedType : undefined,
  );
  return pick && { fast: pick.fast, charged: pick.charged, perf: pick.perf, estimatedIv, assumedMoves: true };
}

/** The best Pokémon in the bag against a boss, at their current levels. */
export function bagTeam(rows: Row[], boss: Species, weather: Weather, data: GameData, size = TEAM_SIZE): TeamMember[] {
  const target = asTarget(boss);
  const out: TeamMember[] = [];
  for (const row of rows) {
    const level = levelOf(row) ?? estimateLevel(row);
    const p = bagPerformance(row, level, target, weather, data);
    if (p) out.push({ row, level, ...p });
  }
  return out.sort((a, b) => b.perf.score - a.perf.score).slice(0, size);
}

// ---------------------------------------------------------------- attackers by type

/**
 * A stand-in boss for ranking attackers of one type: an average Legendary's
 * defense, weak to that type and neutral to everything else.
 */
export const typeTarget = (type: PokemonType): Target => ({
  def: 200,
  types: [],
  mult: (t) => (t === type ? 1.6 : 1),
});

export type TypeRanking = { sp: Species; shadow: boolean; score: number }[];

const rankingCache = new WeakMap<GameData, Map<PokemonType, TypeRanking>>();

/** Every released, non-Mega Pokémon ranked as an attacker of one type (level 40, 15/15/15). */
export function typeRanking(type: PokemonType, data: GameData): TypeRanking {
  let byType = rankingCache.get(data);
  if (!byType) rankingCache.set(data, (byType = new Map()));
  let ranking = byType.get(type);
  if (!ranking) {
    const target = typeTarget(type);
    ranking = [];
    for (const sp of data.species) {
      if (!usable(sp) || sp.mega) continue;
      for (const shadow of sp.shadow ? [false, true] : [false]) {
        const pick = bestMoveset(sp, HUNDO, RAID_LEVEL, shadow, target, null, data, true, (t) => t === type);
        if (pick) ranking.push({ sp, shadow, score: pick.perf.score });
      }
    }
    ranking.sort((a, b) => b.score - a.score);
    byType.set(type, ranking);
  }
  return ranking;
}

/**
 * Where a species sits among attackers of a type (1 = best), compared with
 * Shadow Pokémon if it's a Shadow and with regular Pokémon otherwise. Null if it
 * can't attack with that type.
 */
export function typeRank(sp: Species, shadow: boolean, type: PokemonType, data: GameData): number | null {
  const i = typeRanking(type, data)
    .filter((e) => e.shadow === shadow)
    .findIndex((e) => e.sp.id === sp.id);
  return i === -1 ? null : i + 1;
}

// ---------------------------------------------------------------- power up

export type PowerUpPick = {
  row: Row;
  level: number;
  fast: string;
  charged: string;
  /** Damage score at level 40 as a share of the best attacker of this type in the game. */
  pct: number;
  cost: Cost;
  estimatedIv: boolean;
  assumedMoves: boolean;
};

export type PowerUpGroup = { type: PokemonType; picks: PowerUpPick[] };

/** Below this share of the best attacker, powering up isn't worth suggesting. */
export const POWER_UP_MIN = 50;

/**
 * Per type, the bag's best attackers once powered up to level 40, and what that
 * costs. Pokémon that can still evolve are left to the Evolve suggestions, since
 * powering them up first wastes stardust.
 */
export function powerUpPlan(rows: Row[], data: GameData, perType = 3): PowerUpGroup[] {
  const groups: PowerUpGroup[] = [];
  for (const type of ALL_TYPES) {
    const top = typeRanking(type, data)[0];
    if (!top) continue;
    const target = typeTarget(type);
    const picks: PowerUpPick[] = [];
    for (const row of rows) {
      if (row.sp.mega || Object.keys(row.sp.evo ?? {}).length) continue;
      const level = levelOf(row) ?? estimateLevel(row);
      const p = bagPerformance(row, Math.max(level, RAID_LEVEL), target, null, data, type);
      if (!p) continue;
      const opts = { shadow: row.variant === "shadow", purified: row.variant === "purified", lucky: row.lucky };
      picks.push({
        row,
        level,
        fast: p.fast,
        charged: p.charged,
        pct: relativeStrength(p.perf.score, top.score),
        cost: powerUpCost(level, RAID_LEVEL, data.upgrade, opts),
        estimatedIv: p.estimatedIv,
        assumedMoves: p.assumedMoves,
      });
    }
    picks.sort((a, b) => b.pct - a.pct || a.cost.stardust - b.cost.stardust);
    // One copy per species and variant, so a type isn't filled with the same Pokémon.
    const seen = new Set<string>();
    const best = picks.filter((p) => {
      const key = `${p.row.species}|${p.row.variant ?? ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const strong = best.filter((p) => p.pct >= POWER_UP_MIN).slice(0, perType);
    if (strong.length) groups.push({ type, picks: strong });
  }
  return groups.sort((a, b) => b.picks[0].pct - a.picks[0].pct);
}

// ---------------------------------------------------------------- evolve

export type EvolveStep = { to: Species; cost: EvolutionCost };

/** The chain of evolutions from one species to another, or null if it can't get there. */
export function evolutionPath(from: Species, to: Species, data: GameData): EvolveStep[] | null {
  const queue: { sp: Species; path: EvolveStep[] }[] = [{ sp: from, path: [] }];
  const seen = new Set<string>();
  while (queue.length) {
    const { sp, path } = queue.shift()!;
    if (sp.id === to.id) return path;
    if (seen.has(sp.id)) continue;
    seen.add(sp.id);
    for (const [id, cost] of Object.entries(sp.evo ?? {})) {
      const next = data.byId.get(id);
      if (next) queue.push({ sp: next, path: [...path, { to: next, cost }] });
    }
  }
  return null;
}

export type EvolveReason =
  | { kind: "league"; pick: PvpPick }
  | { kind: "raid"; type: PokemonType; rank: number }
  | { kind: "new" };

export type EvolveSuggestion = {
  row: Row;
  target: Species;
  path: EvolveStep[];
  candy: number;
  reasons: EvolveReason[];
};

/** A type attacker this high in the rankings is worth evolving for raids. */
export const RAID_TOP = 20;

const betterCopy = (a: Row, b: Row) => (a.iv?.[0] ?? -1) - (b.iv?.[0] ?? -1) || (a.ivPct ?? -1) - (b.ivPct ?? -1) || a.cp - b.cp;

/**
 * Evolutions worth doing, for three reasons: good league IVs as the evolved
 * species, the evolution being one of the best raid attackers of a type, or
 * filling a new Pokédex entry. Raid and new-species reasons are only given to
 * the best copy of each species, so the list doesn't repeat itself.
 */
export function evolveSuggestions(assessments: Assessment[], data: GameData): EvolveSuggestion[] {
  const rows = assessments.map((a) => a.row);
  const owned = new Set(rows.map((r) => r.species));
  const best = new Map<string, Row>();
  for (const r of rows) {
    const key = `${r.species}|${r.variant === "shadow" ? "shadow" : ""}`;
    const cur = best.get(key);
    if (!cur || betterCopy(r, cur) > 0) best.set(key, r);
  }
  const bestAny = new Map<string, Row>();
  for (const r of rows) {
    const cur = bestAny.get(r.species);
    if (!cur || betterCopy(r, cur) > 0) bestAny.set(r.species, r);
  }

  const out = new Map<string, EvolveSuggestion>();
  const add = (row: Row, target: Species, reason: EvolveReason) => {
    const key = `${row.id}|${target.id}`;
    let s = out.get(key);
    if (!s) {
      const path = evolutionPath(row.sp, target, data);
      if (!path?.length) return;
      const purified = row.variant === "purified";
      const candy = path.reduce((n, st) => n + ((purified && st.cost.candyPurified) || st.cost.candy), 0);
      out.set(key, (s = { row, target, path, candy, reasons: [] }));
    }
    s.reasons.push(reason);
  };

  for (const a of assessments) {
    const { row } = a;
    if (!row.sp.evo || row.sp.mega) continue;
    for (const pick of a.pvp) {
      if (pick.rank <= GOOD_IV_RANK && pick.target.id !== row.sp.id) add(row, pick.target, { kind: "league", pick });
    }
    const shadow = row.variant === "shadow";
    if (best.get(`${row.species}|${shadow ? "shadow" : ""}`) === row) {
      for (const target of evolutionLine(row.sp, data)) {
        if (target.id === row.sp.id || !usable(target)) continue;
        for (const type of new Set(target.types)) {
          const rank = typeRank(target, shadow, type, data);
          if (rank && rank <= RAID_TOP) add(row, target, { kind: "raid", type, rank });
        }
      }
    }
    if (bestAny.get(row.species) === row) {
      for (const id of Object.keys(row.sp.evo)) {
        const target = data.byId.get(id);
        if (target && usable(target) && !owned.has(id)) add(row, target, { kind: "new" });
      }
    }
  }

  const weight = (s: EvolveSuggestion) =>
    Math.min(
      ...s.reasons.map((r) => (r.kind === "league" ? r.pick.rank : r.kind === "raid" ? 1000 + r.rank : 10_000)),
    );
  return [...out.values()].sort((a, b) => weight(a) - weight(b) || a.row.sp.dex - b.row.sp.dex);
}

/** Plain-language requirements for an evolution chain, beyond candy. */
export function requirements(path: EvolveStep[]): string[] {
  const out: string[] = [];
  for (const { to, cost } of path) {
    const of = path.length > 1 ? ` (for ${to.name})` : "";
    if (cost.item) out.push(`${cost.item}${of}`);
    if (cost.buddyKm) out.push(`Walk ${cost.buddyKm} km as your buddy${of}`);
    if (cost.time) out.push(`Evolve during the ${cost.time}${of}`);
    if (cost.quest) out.push(`Has a special evolution requirement${of}`);
    if (cost.tradeFree) out.push(`Free if it was traded${of}`);
  }
  return out;
}
