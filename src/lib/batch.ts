// Batch entry: a spreadsheet-style grid for logging many Pokémon in one pass
// (species, CP, HP, moves, flags, tags, date), saved to the bag together.
// Appraisals come in a second pass on the Catch up page.

import type { BagPokemon, PokemonInput } from "./bag";
import type { GameData, Species } from "./go/gamedata";
import { solveIVs } from "./go/stats";

export type DraftRow = {
  key: string;
  species: string | null;
  cp: string;
  hp: string;
  fast: string | null;
  charged: string | null;
  charged2: string | null;
  /** Flag letters or words: "s" shiny, "l" lucky, "d" shadow, "p" purified, "f" favorite. */
  flags: string;
  tags: string;
  caught: string;
};

let counter = 0;
export const newKey = () => `${Date.now().toString(36)}${(counter++).toString(36)}`;

export function blankRow(carry?: Pick<DraftRow, "tags" | "caught">): DraftRow {
  return {
    key: newKey(),
    species: null,
    cp: "",
    hp: "",
    fast: null,
    charged: null,
    charged2: null,
    flags: "",
    tags: carry?.tags ?? "",
    caught: carry?.caught ?? "",
  };
}

export type Flags = { shiny?: boolean; lucky?: boolean; favorite?: boolean; variant?: "shadow" | "purified" };

const FLAG_LETTERS: Record<string, keyof Flags | "shadow" | "purified"> = {
  s: "shiny",
  shiny: "shiny",
  l: "lucky",
  lucky: "lucky",
  d: "shadow",
  shadow: "shadow",
  p: "purified",
  purified: "purified",
  f: "favorite",
  fav: "favorite",
  favorite: "favorite",
};

/** "sl", "s l", "shiny lucky" or "shiny,d" → flags. Unknown letters are reported. */
export function parseFlags(text: string): { flags: Flags; unknown: string[] } {
  const flags: Flags = {};
  const unknown: string[] = [];
  const words = text.toLowerCase().split(/[\s,]+/).filter(Boolean);
  // A run of single letters like "sld" counts as separate flags.
  const tokens = words.flatMap((w) => (FLAG_LETTERS[w] ? [w] : /^[sldpf]+$/.test(w) ? [...w] : [w]));
  for (const t of tokens) {
    const f = FLAG_LETTERS[t];
    if (!f) unknown.push(t);
    else if (f === "shadow" || f === "purified") flags.variant = f;
    else flags[f as "shiny" | "lucky" | "favorite"] = true;
  }
  return { flags, unknown };
}

export const flagLabels = (flags: Flags) =>
  [flags.shiny && "Shiny", flags.lucky && "Lucky", flags.variant === "shadow" && "Shadow", flags.variant === "purified" && "Purified", flags.favorite && "Favorite"].filter(
    (x): x is string => !!x,
  );

export type DraftCheck =
  | { status: "empty" }
  | { status: "error"; message: string }
  | { status: "ok"; note?: string };

const isEmpty = (r: DraftRow) => !r.species && !r.cp.trim() && !r.hp.trim() && !r.fast && !r.charged;

const solveCache = new Map<string, number>();
/** How many IV and level combinations fit a CP and HP (cached; it's 400,000 checks). */
function spreadsFor(sp: Species, cp: number, hp: number): number {
  const k = `${sp.id}|${cp}|${hp}`;
  let n = solveCache.get(k);
  if (n === undefined) {
    n = solveIVs(sp, cp, hp).length;
    if (solveCache.size > 5000) solveCache.clear();
    solveCache.set(k, n);
  }
  return n;
}

export function checkDraft(row: DraftRow, data: GameData): DraftCheck {
  if (isEmpty(row)) return { status: "empty" };
  const sp = row.species ? data.byId.get(row.species) : undefined;
  if (!sp) return { status: "error", message: "Choose a species." };
  const cp = Number(row.cp.replace(/,/g, ""));
  if (!row.cp.trim()) return { status: "error", message: "Enter the CP." };
  if (!Number.isInteger(cp) || cp < 10) return { status: "error", message: "CP should be a whole number, 10 or more." };
  const { flags, unknown } = parseFlags(row.flags);
  if (unknown.length) return { status: "error", message: `Unknown flag “${unknown[0]}”. Use s l d p f.` };
  if (flags.variant && !sp.shadow) return { status: "error", message: `${sp.name} isn't available as a Shadow or Purified Pokémon.` };
  if (row.hp.trim()) {
    const hp = Number(row.hp);
    if (!Number.isInteger(hp) || hp < 10) return { status: "error", message: "HP should be a whole number, 10 or more." };
    if (spreadsFor(sp, cp, hp) === 0) {
      return { status: "error", message: `No ${sp.name} has ${cp} CP and ${hp} HP. Check the numbers.` };
    }
  }
  if (row.charged2 && row.charged2 === row.charged) return { status: "error", message: "The two charged moves are the same." };
  if (row.caught && !/^\d{4}-\d{2}-\d{2}$/.test(row.caught)) return { status: "error", message: "Check the date." };
  return { status: "ok" };
}

export function toInput(row: DraftRow): PokemonInput {
  const { flags } = parseFlags(row.flags);
  return {
    species: row.species!,
    cp: Number(row.cp.replace(/,/g, "")),
    hp: row.hp.trim() ? Number(row.hp) : undefined,
    fast: row.fast ?? undefined,
    charged: row.charged ?? undefined,
    charged2: row.charged ? (row.charged2 ?? undefined) : undefined,
    ...flags,
    tags: [...new Set(row.tags.split(",").map((t) => t.trim()).filter(Boolean))],
    caught: row.caught || undefined,
  };
}

/**
 * The moves to suggest for a species: the moveset used most recently for it in
 * this batch, else in the bag. Returns nothing when there's no history, rather
 * than guessing.
 */
export function suggestMoves(
  species: string,
  drafts: DraftRow[],
  bag: BagPokemon[],
): { fast: string | null; charged: string | null } | null {
  for (let i = drafts.length - 1; i >= 0; i--) {
    const d = drafts[i];
    if (d.species === species && d.fast && d.charged) return { fast: d.fast, charged: d.charged };
  }
  let best: BagPokemon | null = null;
  for (const p of bag) {
    if (p.species === species && p.fast && p.charged && (!best || p.added > best.added)) best = p;
  }
  return best ? { fast: best.fast!, charged: best.charged! } : null;
}
