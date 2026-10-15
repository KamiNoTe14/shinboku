// Transfer and keep recommendations.
//
// The rule of thumb: Shinboku only suggests transferring a Pokémon when you have
// a better copy of the same species and nothing about this one is special. Every
// suggestion carries a plain-language reason, and nothing happens automatically.

import type { GameData, Species } from "./go/gamedata";
import type { Row } from "./bagRows";
import { calcCP, matchingLevels } from "./go/stats";
import { LEAGUES, LEAGUE_KEYS, pvpRank, type League, type PvpRank } from "./go/pvp";

/** A species counts for a league if it's in PvPoke's top this-many for that league. */
export const META_TOP = 200;
/** IV ranks at or better than this are worth keeping for that league. */
export const GOOD_IV_RANK = 100;
/** Wild catches top out at level 35, so anything higher has been powered up. */
export const INVESTED_LEVEL = 35;
/** Tag added by "Keep it", which stops future transfer suggestions. */
export const KEEP_TAG = "Keep";

export type PvpPick = PvpRank & { league: League; target: Species; metaRank: number; xl: boolean };

export type Assessment = {
  row: Row;
  level: number | null;
  /** League ranks for this Pokémon and its evolutions in leagues where they matter, best first. */
  pvp: PvpPick[];
  keep: string[];
  /** Why it's safe to transfer, or null if it should stay. */
  transfer: string | null;
  /** The copy of this species Shinboku suggests keeping. */
  best: Row | null;
  /** True when the keeper's IVs are equal or better in every stat. */
  dominated: boolean;
  /** Its best (but not good enough) league rank, if its line matters in a league. */
  leagueNote: string | null;
};

export type Recommendations = {
  all: Assessment[];
  transfer: Assessment[];
  pvp: Assessment[];
  unappraised: number;
};

const fmt = (n: number) => n.toLocaleString("en-US");

/** The species itself plus everything it can evolve into (not Mega Evolutions). */
export function evolutionLine(sp: Species, data: GameData): Species[] {
  const out: Species[] = [];
  const seen = new Set<string>();
  const queue = [sp];
  while (queue.length) {
    const s = queue.shift()!;
    if (seen.has(s.id) || s.mega) continue;
    seen.add(s.id);
    out.push(s);
    for (const id of s.evolutions ?? []) {
      const next = data.byId.get(id);
      if (next) queue.push(next);
    }
  }
  return out;
}

/** The Pokémon's level: as entered, or worked out from CP, HP and IVs. */
export function levelOf(row: Row): number | null {
  if (row.level) return row.level;
  if (!row.iv) return null;
  const iv = { atk: row.iv[0], def: row.iv[1], sta: row.iv[2] };
  const levels = matchingLevels(row.sp, iv, row.cp, row.hp);
  return levels.length ? Math.min(...levels) : null;
}

function pvpPicks(row: Row, level: number, data: GameData): PvpPick[] {
  if (!row.iv) return [];
  const iv = { atk: row.iv[0], def: row.iv[1], sta: row.iv[2] };
  const shadow = row.variant === "shadow";
  const picks: PvpPick[] = [];
  for (const target of evolutionLine(row.sp, data)) {
    for (const league of LEAGUE_KEYS) {
      const metaRank = (shadow ? target.metaShadow?.[league] : undefined) ?? target.meta?.[league];
      if (!metaRank || metaRank > META_TOP) continue;
      // Pokémon can't be powered down, so it has to fit under the cap at its current level.
      if (calcCP(target, iv, level) > LEAGUES[league].cap) continue;
      const r = pvpRank(target, iv, league, shadow);
      if (r) picks.push({ ...r, league, target, metaRank, xl: r.level > 40 });
    }
  }
  return picks.sort((a, b) => a.rank - b.rank);
}

export function describePick(p: PvpPick, sp: Species): string {
  const as = p.target.id === sp.id ? "" : ` as ${p.target.name}`;
  return `${LEAGUES[p.league].name} rank #${fmt(p.rank)}${as}`;
}

function keepReasons(row: Row, pvp: PvpPick[], level: number | null, data: GameData): string[] {
  const out: string[] = [];
  if (row.favorite) out.push("Favorite");
  if (row.tags?.includes(KEEP_TAG)) out.push("You marked it Keep");
  else if (row.tags?.length) out.push(`Tagged ${row.tags.map((t) => `#${t}`).join(", ")}`);
  if (row.shiny) out.push("Shiny");
  if (row.lucky) out.push("Lucky");
  if (row.variant === "shadow") out.push("Shadow");
  if (row.sp.tags?.includes("legendary")) out.push("Legendary");
  if (row.sp.tags?.includes("mythical")) out.push("Mythical");
  if (row.sp.tags?.includes("ultrabeast")) out.push("Ultra Beast");
  if (row.ivPct === 100) out.push("100% IVs");
  if (level && level > INVESTED_LEVEL) out.push(`Powered up to level ${level}`);
  if (row.charged2) out.push("Has a second charged move");
  for (const m of [row.fast, row.charged, row.charged2]) {
    if (m && (row.sp.elite?.includes(m) || row.sp.legacy?.includes(m))) {
      out.push(`Knows ${data.moves[m]?.name ?? m}, which needs an Elite TM`);
    }
  }
  if (row.nickname) out.push(`Nicknamed “${row.nickname}”`);
  for (const p of pvp) if (p.rank <= GOOD_IV_RANK) out.push(describePick(p, row.sp));
  return out;
}

const better = (a: Row, b: Row) => (a.ivPct ?? -1) - (b.ivPct ?? -1) || a.cp - b.cp;

export function recommend(rows: Row[], data: GameData): Recommendations {
  const all: Assessment[] = rows.map((row) => {
    const level = levelOf(row);
    const pvp = level ? pvpPicks(row, level, data) : [];
    return {
      row, level, pvp, keep: keepReasons(row, pvp, level, data),
      transfer: null, best: null, dominated: false, leagueNote: null,
    };
  });

  // Shadows and regular Pokémon fill different roles, so they're compared separately.
  const groups = new Map<string, Assessment[]>();
  for (const a of all) {
    if (!a.row.iv) continue;
    const key = `${a.row.species}|${a.row.variant === "shadow" ? "shadow" : "regular"}`;
    groups.set(key, [...(groups.get(key) ?? []), a]);
  }

  for (const group of groups.values()) {
    const best = group.reduce((x, y) => (better(y.row, x.row) > 0 ? y : x));
    for (const a of group) {
      a.best = best.row;
      if (a === best) {
        a.keep.push(`Your best ${a.row.sp.name}`);
        continue;
      }
      if (a.keep.length) continue;
      const b = best.row;
      const dominated = a.row.iv!.every((v, i) => b.iv![i] >= v);
      a.dominated = dominated;
      if (a.pvp.length) {
        a.leagueNote = `Best league rank #${fmt(a.pvp[0].rank)} (${describePick(a.pvp[0], a.row.sp).replace(/ rank #[\d,]+/, "")})`;
      }
      let why = dominated
        ? `Your ${fmt(b.cp)} CP ${b.sp.name} has equal or better IVs in every stat (${b.ivPct}% vs ${a.row.ivPct}%).`
        : `Your ${fmt(b.cp)} CP ${b.sp.name} has better IVs overall (${b.ivPct}% vs ${a.row.ivPct}%).`;
      if (a.leagueNote) why += ` ${a.leagueNote}.`;
      a.transfer = why;
    }
  }

  const transfer = all
    .filter((a) => a.transfer)
    .sort((a, b) => a.row.sp.dex - b.row.sp.dex || a.row.sp.name.localeCompare(b.row.sp.name) || b.row.cp - a.row.cp);
  const pvp = all
    .filter((a) => a.pvp.some((p) => p.rank <= GOOD_IV_RANK))
    .sort((a, b) => a.pvp[0].rank - b.pvp[0].rank || a.pvp[0].metaRank - b.pvp[0].metaRank);

  return { all, transfer, pvp, unappraised: rows.filter((r) => !r.iv).length };
}
