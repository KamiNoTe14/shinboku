// Tools for getting a big existing collection into Shinboku: a search string
// that finds Pokémon safe to transfer before entering anything, evolution
// families to work through one at a time, and which unappraised Pokémon are
// worth appraising.

import type { Row } from "./bagRows";
import { ALL_TYPES, type GameData, type Species } from "./go/gamedata";
import { evolutionLine, META_TOP } from "./recommend";
import { typeRanking } from "./raids";

/** A species counts for raids here if it's this high among all attackers of a type (Shadows included). */
export const RAID_RELEVANT = 15;

// ---------------------------------------------------------------- what matters

export type Importance = { reasons: string[] };

const cache = new WeakMap<GameData, Map<string, string[]>>();

/**
 * Species whose evolution line matters somewhere: in PvPoke's top 200 for
 * Great or Ultra League (regular or Shadow), or one of the top raid attackers
 * of a type.
 * Keyed by species ID; species that don't matter are absent.
 */
export function importantSpecies(data: GameData): Map<string, string[]> {
  const hit = cache.get(data);
  if (hit) return hit;

  // Raid rank per species among every attacker of the type, regular and Shadow together.
  const raid = new Map<string, string[]>();
  for (const type of ALL_TYPES) {
    typeRanking(type, data)
      .slice(0, RAID_RELEVANT)
      .forEach((e, i) => {
        const key = e.shadow ? `${e.sp.id}|shadow` : e.sp.id;
        raid.set(key, [...(raid.get(key) ?? []), `#${i + 1} ${type} raid attacker${e.shadow ? " (Shadow)" : ""}`]);
      });
  }

  const out = new Map<string, string[]>();
  for (const sp of data.species) {
    if (sp.mega) continue;
    const reasons: string[] = [];
    for (const t of evolutionLine(sp, data)) {
      const as = t.id === sp.id ? "" : ` as ${t.name}`;
      const gl = Math.min(t.meta?.gl ?? Infinity, t.metaShadow?.gl ?? Infinity);
      const ul = Math.min(t.meta?.ul ?? Infinity, t.metaShadow?.ul ?? Infinity);
      if (gl <= META_TOP) reasons.push(`Great League #${gl}${as}`);
      if (ul <= META_TOP) reasons.push(`Ultra League #${ul}${as}`);
      for (const r of [...(raid.get(t.id) ?? []), ...(raid.get(`${t.id}|shadow`) ?? [])]) reasons.push(`${r}${as}`);
    }
    if (reasons.length) out.set(sp.id, reasons);
  }
  cache.set(data, out);
  return out;
}

const special = (sp: Species) =>
  sp.tags?.some((t) => t === "legendary" || t === "mythical" || t === "ultrabeast") ?? false;

// ---------------------------------------------------------------- clean-up string

/** "1-5,7,10-12" from [1,2,3,4,5,7,10,11,12]. */
export function dexRanges(nums: number[]): string {
  const sorted = [...new Set(nums)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    while (sorted[i + 1] === sorted[i] + 1) i++;
    parts.push(start === sorted[i] ? String(start) : `${start}-${sorted[i]}`);
  }
  return parts.join(",");
}

/**
 * Pokémon GO search terms that rule out anything worth a second look.
 * Legendary, Mythical and Ultra Beast Pokémon need no term of their own: their
 * dex numbers are never in the search, which keeps each string shorter. Each
 * group is ANDed by the game; "!" means "not".
 */
export const KEEP_TERMS = [
  "!shiny",
  "!lucky",
  "!shadow",
  "!purified",
  "!costume",
  "!favorite",
  "!#",
  "!@special",
  "!dynamax",
  "!gigantamax",
  "!locationbackground",
  "!specialbackground",
];

/**
 * Species the game's search can't be trusted with. Shiny Zorua kept matching
 * "!shiny" in a trainer's tests while other shinies were excluded, so the search
 * seems to read Zorua's Illusion disguise rather than Zorua. Zorua and Zoroark
 * (all forms) are left out of clean-up searches to be checked by hand.
 */
export const UNRELIABLE_DEX = [570, 571];

export type CleanupOptions = { maxStars: 0 | 1 | 2 };

export type CleanupPart = { query: string; fromDex: number; toDex: number };

export type Cleanup = {
  /** Everything in one string. Long; the game may not honor all of it. */
  query: string;
  /** The same search as shorter strings, run one after another. */
  parts: CleanupPart[];
  junkSpecies: number;
  keptSpecies: number;
};

/**
 * Longest string to hand the game. A trainer's test showed shinies coming back
 * from a ~1,000-character string whose "!shiny" sat 835 characters in, so the
 * game appears to ignore part of very long searches. Short strings, with the
 * protective terms first, keep every exclusion in force.
 */
export const PART_LENGTH = 260;

/**
 * Search strings for low-IV Pokémon of species that don't matter in any league
 * or raid. Species that matter are left out entirely (by dex number), because
 * the best league IVs are often low-attack 1★ spreads. The exclusions and the
 * star filter come first and the dex numbers last, so if the game ever cuts a
 * string short it loses species to search, never a protection.
 */
export function cleanupSearch(data: GameData, opts: CleanupOptions): Cleanup {
  const important = importantSpecies(data);
  const keepDex = new Set<number>();
  const allDex = new Set<number>();
  for (const sp of data.species) {
    if (sp.mega || sp.unreleased) continue;
    allDex.add(sp.dex);
    if (important.has(sp.id) || special(sp)) keepDex.add(sp.dex);
  }
  const junk = [...allDex]
    .filter((d) => !keepDex.has(d) && !UNRELIABLE_DEX.includes(d))
    .sort((a, b) => a - b);
  const stars = Array.from({ length: opts.maxStars + 1 }, (_, i) => `${i}*`).join(",");
  const head = [...KEEP_TERMS, stars].join("&");
  const make = (dex: number[]): CleanupPart => ({
    query: `${head}&${dexRanges(dex)}`,
    fromDex: dex[0],
    toDex: dex[dex.length - 1],
  });

  const parts: CleanupPart[] = [];
  let chunk: number[] = [];
  for (const d of junk) {
    if (chunk.length && make([...chunk, d]).query.length > PART_LENGTH) {
      parts.push(make(chunk));
      chunk = [];
    }
    chunk.push(d);
  }
  if (chunk.length) parts.push(make(chunk));
  return {
    query: make(junk).query,
    parts,
    junkSpecies: junk.length,
    keptSpecies: keepDex.size,
  };
}

// ---------------------------------------------------------------- families

export type Family = {
  id: string;
  /** The first species of the line, used for the name and the "+name" search. */
  root: Species;
  members: Species[];
  /** How many of this family are in the bag. */
  count: number;
};

/** The in-game name to search with "+": the species name without its form. */
export const searchName = (sp: Species) =>
  sp.name
    .replace(/\s*\(.*\)\s*/g, "")
    .replace(/ Female$/, "♀")
    .replace(/ Male$/, "♂")
    .trim()
    .toLowerCase();

export function families(data: GameData, rows: Row[]): Family[] {
  const byFamily = new Map<string, Species[]>();
  for (const sp of data.species) {
    if (sp.mega || sp.unreleased) continue;
    // Regional forms usually share the base form's family; group by dex of the root.
    const id = sp.family ?? sp.id;
    byFamily.set(id, [...(byFamily.get(id) ?? []), sp]);
  }
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.species, (counts.get(r.species) ?? 0) + 1);

  // Merge families that share a search name (e.g. regional lines), since "+name" finds them all.
  const merged = new Map<string, Family>();
  for (const [id, members] of byFamily) {
    const root = [...members].sort((a, b) => a.dex - b.dex || a.name.length - b.name.length)[0];
    const name = searchName(root);
    const count = members.reduce((n, m) => n + (counts.get(m.id) ?? 0), 0);
    const existing = merged.get(name);
    if (existing) {
      existing.members.push(...members);
      existing.count += count;
      if (root.dex < existing.root.dex || (root.dex === existing.root.dex && root.name.length < existing.root.name.length)) {
        existing.root = root;
      }
    } else merged.set(name, { id, root, members: [...members], count });
  }
  return [...merged.values()].sort((a, b) => a.root.dex - b.root.dex);
}

// ---------------------------------------------------------------- appraisal queue

export type AppraisalItem = { row: Row; reasons: string[] };

/** Unappraised Pokémon whose IVs matter, most promising lines first. */
export function appraisalQueue(rows: Row[], data: GameData): AppraisalItem[] {
  const important = importantSpecies(data);
  return rows
    .filter((r) => !r.iv)
    .flatMap((row) => {
      const reasons = important.get(row.species);
      return reasons ? [{ row, reasons }] : [];
    })
    .sort((a, b) => a.row.sp.dex - b.row.sp.dex || b.row.cp - a.row.cp);
}
