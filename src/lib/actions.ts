// In-app power-ups and evolutions: what a Pokémon looks like after one, so the
// bag stays in step with the game without re-entering it.

import type { BagPokemon } from "./bag";
import type { GameData, Species } from "./go/gamedata";
import { powerUpCost, type Cost } from "./go/powerup";
import { calcCP, calcHP, matchingLevels, type IVs } from "./go/stats";

/** Highest level reachable by powering up (51 needs Best Buddy, which isn't a power-up). */
export const MAX_POWER_LEVEL = 50;

/** Fields a power-up or evolution changes. Null means "remove this field". */
export type Change = Partial<Record<"species" | "cp" | "hp" | "level" | "fast" | "charged" | "charged2", string | number | null>>;

const ivsOf = (p: BagPokemon): IVs | null => (p.iv ? { atk: p.iv[0], def: p.iv[1], sta: p.iv[2] } : null);

/** The Pokémon's level, as entered or worked out from CP, HP and IVs. */
export function currentLevel(p: BagPokemon, sp: Species): number | null {
  if (p.level) return p.level;
  const iv = ivsOf(p);
  if (!iv) return null;
  const levels = matchingLevels(sp, iv, p.cp, p.hp);
  return levels.length ? Math.min(...levels) : null;
}

export type PowerUpCheck =
  | { ok: true; level: number; next: number; cost: Cost }
  | { ok: false; reason: string };

export function canPowerUp(p: BagPokemon, sp: Species, data: GameData, to?: number): PowerUpCheck {
  if (!p.iv) return { ok: false, reason: "Add its appraisal first. CP after a power-up depends on its IVs." };
  const level = currentLevel(p, sp);
  if (level === null) return { ok: false, reason: "Its CP, HP and IVs don't match a level. Check them with Edit." };
  if (level >= MAX_POWER_LEVEL) return { ok: false, reason: "Already at the maximum level." };
  const next = Math.min(MAX_POWER_LEVEL, to ?? level + 0.5);
  if (next <= level) return { ok: false, reason: `Already at level ${level}.` };
  const cost = powerUpCost(level, next, data.upgrade, {
    shadow: p.variant === "shadow",
    purified: p.variant === "purified",
    lucky: p.lucky,
  });
  return { ok: true, level, next, cost };
}

/** The changes from powering up to a level (one step by default). */
export function powerUp(p: BagPokemon, sp: Species, data: GameData, to?: number): Change {
  const check = canPowerUp(p, sp, data, to);
  if (!check.ok) throw new Error(check.reason);
  const iv = ivsOf(p)!;
  return { cp: calcCP(sp, iv, check.next), hp: calcHP(sp, iv, check.next), level: check.next };
}

/**
 * The changes from evolving. Moves are rerolled in the game, so they're cleared.
 * Without an appraisal the new CP can't be worked out, so it has to be given.
 */
export function evolve(p: BagPokemon, from: Species, to: Species, newCp?: number): Change {
  const moves = { fast: null, charged: null, charged2: null };
  const iv = ivsOf(p);
  const level = currentLevel(p, from);
  if (iv && level !== null) {
    return { species: to.id, cp: calcCP(to, iv, level), hp: calcHP(to, iv, level), level, ...moves };
  }
  if (!newCp) throw new Error("Enter its new CP.");
  return { species: to.id, cp: newCp, hp: null, level: null, ...moves };
}

/** The fields to write to put a Pokémon back the way it was before a change. */
export function undoChange(before: BagPokemon, change: Change): Change {
  const out: Change = {};
  for (const key of Object.keys(change) as (keyof Change)[]) out[key] = (before[key] as string | number | undefined) ?? null;
  return out;
}
