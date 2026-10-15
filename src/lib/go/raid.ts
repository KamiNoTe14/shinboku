// Raid counter math.
//
// A simplified version of the model community raid calculators use:
//   damage per hit = floor(0.5 × power × attack / defense × bonuses) + 1
// with a fast/charged move cycle, energy from both attacking and taking damage,
// and a generic boss that deals 900 / (your defense) damage per second. Attackers
// are ranked by DPS³ × TDO, which rewards speed while still counting staying power.
// It's an estimate for comparing Pokémon, not a battle simulator.

import { cpmAt } from "./cpm";
import type { GameData, PokemonType, Species } from "./gamedata";
import type { IVs } from "./stats";

/** Raid bosses from tier 5 (Legendary) up use this CP multiplier. */
export const BOSS_CPM = 0.79;
const BOSS_DPS_FACTOR = 900;

export type Weather = keyof GameData["weather"] | null;

export function effectiveness(moveType: PokemonType, defender: PokemonType[], data: GameData): number {
  return defender.reduce((m, t) => m * (data.typeChart[moveType]?.[t] ?? 1), 1);
}

/** Every attacking type's multiplier against a set of defending types. */
export function weaknesses(defender: PokemonType[], data: GameData): { type: PokemonType; mult: number }[] {
  return (Object.keys(data.typeChart) as PokemonType[])
    .map((type) => ({ type, mult: effectiveness(type, defender, data) }))
    .sort((a, b) => b.mult - a.mult);
}

export type Attacker = {
  species: Species;
  iv: IVs;
  level: number;
  shadow?: boolean;
  fast: string;
  charged: string;
};

export type Performance = { dps: number; tdo: number; score: number };

/** What's being attacked: a real boss, or a generic target used to rank attackers by type. */
export type Target = {
  def: number;
  types: PokemonType[];
  /** Overrides type effectiveness, e.g. "super effective against everything of type X". */
  mult?: (moveType: PokemonType) => number;
};

export const asTarget = (boss: Species): Target => ({ def: boss.def, types: boss.types });

export function raidPerformance(a: Attacker, boss: Target, weather: Weather, data: GameData): Performance | null {
  const fast = data.moves[a.fast];
  const charged = data.moves[a.charged];
  if (!fast?.pve || !charged?.pve || !fast.pve.durationMs || !charged.pve.durationMs) return null;
  if (fast.pve.energy <= 0 || charged.pve.energy >= 0) return null;

  const r = data.raid;
  const cpm = cpmAt(a.level);
  const atk = (a.species.atk + a.iv.atk) * cpm * (a.shadow ? r.shadowAtk : 1);
  const def = (a.species.def + a.iv.def) * cpm * (a.shadow ? r.shadowDef : 1);
  const hp = Math.max(10, Math.floor((a.species.sta + a.iv.sta) * cpm));
  const bossDef = (boss.def + 15) * BOSS_CPM;
  const boosted = new Set(weather ? data.weather[weather] : []);

  const hit = (m: typeof fast) =>
    Math.floor(
      0.5 *
        m.pve!.power *
        (atk / bossDef) *
        (a.species.types.includes(m.type) ? r.stab : 1) *
        (boss.mult ? boss.mult(m.type) : effectiveness(m.type, boss.types, data)) *
        (boosted.has(m.type) ? r.weatherBoost : 1),
    ) + 1;

  const fDmg = hit(fast);
  const cDmg = hit(charged);
  const fTime = fast.pve.durationMs / 1000;
  const cTime = charged.pve.durationMs / 1000;
  const fEnergy = fast.pve.energy;
  const cEnergy = -charged.pve.energy;

  const bossDps = BOSS_DPS_FACTOR / def;
  const fromDamage = r.energyPerHpLost * bossDps; // energy per second gained by being hit
  // Fast moves needed per charged move, counting energy from damage taken meanwhile.
  const fastPerCycle = Math.max(0, (cEnergy - fromDamage * cTime) / (fEnergy + fromDamage * fTime));
  const cycleDps = (fastPerCycle * fDmg + cDmg) / (fastPerCycle * fTime + cTime);
  const dps = Math.max(cycleDps, fDmg / fTime);
  const tdo = dps * (hp / bossDps);
  return { dps, tdo, score: dps ** 3 * tdo };
}

export type MovesetPick = { fast: string; charged: string; perf: Performance; elite: boolean };

/** Hidden Power's type is random per Pokémon, so it's only used when a Pokémon is known to have it. */
const isTypedHiddenPower = (move: string) => move.startsWith("HIDDEN_POWER_");

/** The species' best moveset against a boss, optionally leaving out Elite TM and Legacy moves. */
export function bestMoveset(
  sp: Species,
  iv: IVs,
  level: number,
  shadow: boolean,
  boss: Target,
  weather: Weather,
  data: GameData,
  allowElite = true,
  chargedFilter?: (moveType: PokemonType) => boolean,
): MovesetPick | null {
  const special = new Set([...(sp.elite ?? []), ...(sp.legacy ?? [])]);
  let best: MovesetPick | null = null;
  for (const fast of sp.fast) {
    if (isTypedHiddenPower(fast)) continue;
    for (const charged of sp.charged) {
      if (chargedFilter && !chargedFilter(data.moves[charged]?.type)) continue;
      const elite = special.has(fast) || special.has(charged);
      if (elite && !allowElite) continue;
      const perf = raidPerformance({ species: sp, iv, level, shadow, fast, charged }, boss, weather, data);
      if (perf && (!best || perf.score > best.perf.score)) best = { fast, charged, perf, elite };
    }
  }
  return best;
}
