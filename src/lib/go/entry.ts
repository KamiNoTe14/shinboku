// Understanding what a trainer typed into the entry row.

import type { Species } from "./gamedata";
import { appraisalStars, ivPercent, matchingLevels, type IVs } from "./stats";

/** "15 14 13", "15/14/13", "15.14.13", "15-14-13" or "151413" → [15, 14, 13]. Blank → null. */
export function parseAppraisal(text: string): [number, number, number] | null | "invalid" {
  const t = text.trim();
  if (!t) return null;
  // Six digits ("151413") or any separator, including the "." on phone number pads.
  const parts = /^\d{6}$/.test(t) ? [t.slice(0, 2), t.slice(2, 4), t.slice(4)] : t.split(/[\s/,.\-]+/).filter(Boolean);
  if (parts.length !== 3 || !parts.every((p) => /^\d{1,2}$/.test(p))) return "invalid";
  const nums = parts.map(Number) as [number, number, number];
  return nums.every((n) => n >= 0 && n <= 15) ? nums : "invalid";
}

export function parseWholeNumber(text: string): number | null | "invalid" {
  const t = text.trim().replace(/,/g, "");
  if (!t) return null;
  return /^\d+$/.test(t) ? Number(t) : "invalid";
}

export type EntryCheck =
  | { status: "empty" }
  | { status: "error"; message: string; canForce: boolean }
  | {
      status: "ok";
      level?: number;
      note: string;
      ivPercent?: number;
      stars?: 0 | 1 | 2 | 3;
    };

/**
 * Checks an entry and works out the level. Errors with canForce=true can still
 * be saved with Ctrl+Enter (for example if the game data is a patch behind).
 */
export function checkEntry(
  species: Species | null,
  cpText: string,
  hpText: string,
  ivText: string,
  shadowVariant: boolean,
): EntryCheck {
  if (!species && !cpText.trim() && !ivText.trim()) return { status: "empty" };
  if (!species) return { status: "error", message: "Choose a species.", canForce: false };

  const cp = parseWholeNumber(cpText);
  if (cp === null) return { status: "error", message: "Enter the CP.", canForce: false };
  if (cp === "invalid" || cp < 10) return { status: "error", message: "CP should be a whole number, 10 or more.", canForce: false };

  const hp = parseWholeNumber(hpText);
  if (hp === "invalid" || (hp !== null && hp < 10))
    return { status: "error", message: "HP should be a whole number, 10 or more.", canForce: false };

  const iv = parseAppraisal(ivText);
  if (iv === "invalid")
    return { status: "error", message: "Type the appraisal as three numbers from 0 to 15, like 15 14 13.", canForce: false };

  if (shadowVariant && !species.shadow) {
    return { status: "error", message: `${species.name} isn't available as a Shadow or Purified Pokémon.`, canForce: true };
  }

  if (!iv) {
    return { status: "ok", note: "Add the appraisal to work out the level and IVs." };
  }

  const ivs: IVs = { atk: iv[0], def: iv[1], sta: iv[2] };
  const levels = matchingLevels(species, ivs, cp, hp ?? undefined);
  const extra = { ivPercent: ivPercent(ivs), stars: appraisalStars(ivs) };

  if (levels.length === 0) {
    return {
      status: "error",
      message: `No ${species.name} with this appraisal has ${cp} CP${hp !== null ? ` and ${hp} HP` : ""}. Check the numbers.`,
      canForce: true,
    };
  }
  if (levels.length === 1) {
    return { status: "ok", level: levels[0], note: `Level ${levels[0]}`, ...extra };
  }
  return {
    status: "ok",
    note: `Level ${levels.join(" or ")}. Add the HP to tell them apart.`,
    ...extra,
  };
}

/** Flag letters typed in the entry row. */
export const FLAG_KEYS = {
  s: "shiny",
  l: "lucky",
  d: "shadow",
  p: "purified",
  f: "favorite",
} as const;
export type FlagName = (typeof FLAG_KEYS)[keyof typeof FLAG_KEYS];
