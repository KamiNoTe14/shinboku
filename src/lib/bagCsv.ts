// Bag backups: exporting to CSV and reading a CSV back in.
//
// The file opens in Excel or Google Sheets. Rows can be edited there and imported
// again; a row whose ID matches a Pokémon in your bag updates it.

import type { PokemonInput, Variant } from "./bag";
import type { Row } from "./bagRows";
import type { GameData, Species } from "./go/gamedata";
import { matchingLevels } from "./go/stats";
import { parseCsv, toCsv } from "./csv";

export const MAX_IMPORT = 10_000;

const COLUMNS = [
  "id",
  "species",
  "name",
  "dex",
  "cp",
  "hp",
  "attack_iv",
  "defense_iv",
  "stamina_iv",
  "iv_percent",
  "level",
  "fast_move",
  "charged_move",
  "charged_move_2",
  "nickname",
  "shiny",
  "lucky",
  "shadow_or_purified",
  "favorite",
  "tags",
  "caught",
  "added",
] as const;

const yes = (b?: boolean) => (b ? "yes" : "");

export function bagToCsv(rows: Row[]): string {
  const sorted = [...rows].sort((a, b) => a.added - b.added);
  return (
    "﻿" + // lets Excel read "é" in Pokémon correctly
    toCsv([
      [...COLUMNS],
      ...sorted.map((r) => [
        r.id,
        r.species,
        r.sp.name,
        r.sp.dex,
        r.cp,
        r.hp,
        r.iv?.[0],
        r.iv?.[1],
        r.iv?.[2],
        r.ivPct,
        r.level,
        r.fast,
        r.charged,
        r.charged2,
        r.nickname,
        yes(r.shiny),
        yes(r.lucky),
        r.variant,
        yes(r.favorite),
        r.tags?.join("; "),
        r.caught,
        new Date(r.added).toISOString(),
      ]),
    ])
  );
}

export type ImportItem = { id?: string; added?: number; input: PokemonInput };
export type ImportResult = { items: ImportItem[]; errors: string[]; total: number };

const TRUE = new Set(["yes", "y", "true", "1", "x"]);
const FALSE = new Set(["", "no", "n", "false", "0"]);

export function csvToBag(text: string, data: GameData): ImportResult {
  const rows = parseCsv(text);
  if (rows.length === 0) return { items: [], errors: ["The file is empty."], total: 0 };

  const header = rows[0].map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (name: string) => header.indexOf(name);
  if (col("species") === -1 && col("name") === -1)
    return { items: [], errors: ["This doesn't look like a Shinboku backup: there's no species column."], total: 0 };
  if (col("cp") === -1) return { items: [], errors: ["The file has no cp column."], total: 0 };

  const byName = new Map(data.species.map((s) => [s.name.toLowerCase(), s]));
  const moveByName = new Map(Object.entries(data.moves).map(([id, m]) => [m.name.toLowerCase(), id]));
  const items: ImportItem[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();
  const body = rows.slice(1);

  if (body.length > MAX_IMPORT) {
    return { items: [], errors: [`The file has ${body.length.toLocaleString()} rows. The limit is ${MAX_IMPORT.toLocaleString()}.`], total: body.length };
  }

  body.forEach((cells, i) => {
    const line = i + 2; // spreadsheet row number, counting the header
    const get = (name: string) => {
      const c = col(name);
      const v = c === -1 ? "" : (cells[c] ?? "").trim();
      // Undo the apostrophe the export adds in front of values like "=..." or "@...".
      return /^'[=+\-@]/.test(v) ? v.slice(1) : v;
    };
    const problem = (msg: string) => errors.push(`Row ${line}: ${msg}`);

    const speciesText = get("species") || get("name");
    const sp: Species | undefined =
      data.byId.get(speciesText.toLowerCase()) ?? byName.get(speciesText.toLowerCase());
    if (!sp) return problem(speciesText ? `unknown species “${speciesText}”.` : "no species.");

    const int = (name: string, min: number, max: number): number | undefined | "bad" => {
      const v = get(name).replace(/,/g, "");
      if (v === "") return undefined;
      if (!/^\d+$/.test(v)) return "bad";
      const n = Number(v);
      return n < min || n > max ? "bad" : n;
    };

    const cp = int("cp", 10, 10_000);
    if (cp === undefined || cp === "bad") return problem(`CP should be a whole number from 10 to 10,000.`);
    const hp = int("hp", 10, 1_000);
    if (hp === "bad") return problem("HP should be a whole number from 10 to 1,000.");

    const ivCells = [int("attack_iv", 0, 15), int("defense_iv", 0, 15), int("stamina_iv", 0, 15)];
    let iv: [number, number, number] | undefined;
    if (ivCells.some((v) => v === "bad")) return problem("IVs should be whole numbers from 0 to 15.");
    if (ivCells.every((v) => typeof v === "number")) iv = ivCells as [number, number, number];
    else if (ivCells.some((v) => v !== undefined)) return problem("fill in all three IVs, or leave all three blank.");

    const flag = (name: string): boolean | "bad" => {
      const v = get(name).toLowerCase();
      if (TRUE.has(v)) return true;
      if (FALSE.has(v)) return false;
      return "bad";
    };
    const shiny = flag("shiny");
    const lucky = flag("lucky");
    const favorite = flag("favorite");
    if ([shiny, lucky, favorite].includes("bad")) return problem("shiny, lucky and favorite should be yes or blank.");

    const variantText = get("shadow_or_purified").toLowerCase();
    if (variantText && variantText !== "shadow" && variantText !== "purified")
      return problem("shadow_or_purified should be shadow, purified or blank.");

    const move = (name: string, kind: "fast" | "charged"): string | undefined | "bad" => {
      const v = get(name);
      if (!v) return undefined;
      const id = data.moves[v.toUpperCase()] ? v.toUpperCase() : moveByName.get(v.toLowerCase());
      if (!id) return "bad";
      // Moves the species can't learn are kept as typed (the data may be a patch behind),
      // but must at least be the right kind of move.
      const isFast = data.moves[id].pvp.energyGain !== undefined;
      return isFast === (kind === "fast") ? id : "bad";
    };
    const fast = move("fast_move", "fast");
    const charged = move("charged_move", "charged");
    const charged2 = move("charged_move_2", "charged");
    if (fast === "bad") return problem(`unknown fast move “${get("fast_move")}”.`);
    if (charged === "bad") return problem(`unknown charged move “${get("charged_move")}”.`);
    if (charged2 === "bad") return problem(`unknown charged move “${get("charged_move_2")}”.`);

    const caught = get("caught");
    if (caught && !/^\d{4}-\d{2}-\d{2}$/.test(caught)) return problem("caught should be a date like 2026-10-14.");

    let level: number | undefined;
    if (iv) {
      const levels = matchingLevels(sp, { atk: iv[0], def: iv[1], sta: iv[2] }, cp, hp);
      if (levels.length === 1) level = levels[0];
    }
    if (level === undefined) {
      const l = Number(get("level"));
      if (l >= 1 && l <= 51 && Number.isInteger(l * 2)) level = l;
    }

    const tags = [...new Set(get("tags").split(/[;,]/).map((t) => t.trim()).filter(Boolean))].slice(0, 20);

    let id: string | undefined = get("id").toLowerCase();
    if (!/^[a-z0-9]{6,32}$/.test(id) || seenIds.has(id)) id = undefined;
    if (id) seenIds.add(id);
    const addedText = get("added");
    const added = addedText ? Date.parse(addedText) : NaN;

    items.push({
      id,
      added: Number.isFinite(added) ? added : undefined,
      input: {
        species: sp.id,
        cp,
        hp,
        iv,
        level,
        fast,
        charged,
        charged2,
        nickname: get("nickname").slice(0, 30) || undefined,
        shiny: shiny === true,
        lucky: lucky === true,
        favorite: favorite === true,
        variant: (variantText || undefined) as Variant | undefined,
        tags,
        caught: caught || undefined,
      },
    });
  });

  return { items, errors, total: body.length };
}
