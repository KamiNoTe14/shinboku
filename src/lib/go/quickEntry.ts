// Quick entry: one line per Pokémon, typed or spoken.
//
//   machop 1056 15 14 13          species, CP, appraisal
//   1120 15/15/14                 same species as last time
//   shiny alolan raichu 1650 hp120 151413 #pvp
//
// Species come first (and can be left out to reuse the last one). After the
// CP: the appraisal as three numbers, "15/14/13" or "151413"; HP as "hp120";
// flags as words (shiny, lucky, shadow, purified, favorite) or letters
// (s, l, d, p, f); tags as #words.

import type { GameData, Species } from "./gamedata";

export type QuickFlags = { shiny?: boolean; lucky?: boolean; favorite?: boolean; variant?: "shadow" | "purified" };

export type QuickParse = {
  /** Text before the CP, if any. */
  speciesText: string;
  species: Species | null;
  cp: number | null;
  hp: number | null;
  iv: [number, number, number] | null;
  flags: QuickFlags;
  tags: string[];
  /** Problems worth showing; the entry can't be added while there are any. */
  errors: string[];
};

const FLAG_WORDS: Record<string, keyof QuickFlags | "shadow" | "purified"> = {
  shiny: "shiny",
  s: "shiny",
  lucky: "lucky",
  l: "lucky",
  shadow: "shadow",
  d: "shadow",
  purified: "purified",
  p: "purified",
  favorite: "favorite",
  favourite: "favorite",
  fav: "favorite",
  f: "favorite",
};
/** Flag words that can appear anywhere, even before the species. */
const LEADING_FLAGS = new Set(["shiny", "lucky", "shadow", "purified", "favorite", "favourite"]);

const words = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'.:]/g, "")
    .split(/[^a-z0-9♀♂]+/)
    .filter(Boolean);

const key = (ws: string[]) => [...ws].sort().join(" ");

function levenshtein(a: string, b: string): number {
  const d = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = d[0];
    d[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = d[j];
      d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return d[b.length];
}

export type SpeciesMatcher = (text: string) => Species | null;

/**
 * Finds a species from typed or spoken text: exact name in any word order
 * ("alolan raichu"), then the simplest form whose words start with what was
 * typed ("giratina", "mach"), then the closest spelling (for speech, "much op").
 */
export function speciesMatcher(data: GameData): SpeciesMatcher {
  const entries = data.species
    .filter((s) => !s.mega)
    .map((s) => ({ s, ws: words(s.name), joined: words(s.name).join("") }));
  const exact = new Map<string, Species>();
  for (const e of entries) if (!exact.has(key(e.ws))) exact.set(key(e.ws), e.s);

  return (text: string) => {
    const q = words(text);
    if (!q.length) return null;
    if (q.length === 1 && /^#?\d+$/.test(text.trim())) {
      const dex = Number(text.trim().replace("#", ""));
      return entries.find((e) => e.s.dex === dex)?.s ?? null;
    }
    const hit = exact.get(key(q));
    if (hit) return hit;
    const prefix = entries
      .filter((e) => q.every((w) => e.ws.some((x) => x.startsWith(w))))
      .sort((a, b) => a.ws.length - b.ws.length || a.joined.length - b.joined.length);
    if (prefix.length) return prefix[0].s;
    const joined = q.join("");
    if (joined.length < 4) return null;
    let best: { s: Species; d: number } | null = null;
    for (const e of entries) {
      const base = e.ws[0];
      const d = Math.min(levenshtein(joined, e.joined), levenshtein(joined, base));
      if (!best || d < best.d) best = { s: e.s, d };
    }
    return best && best.d <= Math.max(1, Math.floor(joined.length / 3)) ? best.s : null;
  };
}

const isIv = (n: number) => Number.isInteger(n) && n >= 0 && n <= 15;

/** "15/14/13", "15-14-13" or "151413" as one token. */
function compactIv(token: string): [number, number, number] | null {
  const parts = token.split(/[/\-:,.]/).filter(Boolean);
  if (parts.length === 3 && parts.every((p) => /^\d{1,2}$/.test(p))) {
    const n = parts.map(Number) as [number, number, number];
    return n.every(isIv) ? n : null;
  }
  if (/^\d{6}$/.test(token)) {
    const n = [token.slice(0, 2), token.slice(2, 4), token.slice(4, 6)].map(Number) as [number, number, number];
    return n.every(isIv) ? n : null;
  }
  return null;
}

export function parseQuick(line: string, match: SpeciesMatcher, lastSpecies: Species | null): QuickParse {
  const out: QuickParse = {
    speciesText: "",
    species: null,
    cp: null,
    hp: null,
    iv: null,
    flags: {},
    tags: [],
    errors: [],
  };
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  const setFlag = (f: string) => {
    if (f === "shadow" || f === "purified") out.flags.variant = f;
    else out.flags[f as "shiny" | "lucky" | "favorite"] = true;
  };

  // Species: everything before the first number, minus flag words and tags.
  const nameParts: string[] = [];
  let i = 0;
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    if (/^\d/.test(t) || /^hp\d/i.test(t)) break;
    if (t.startsWith("#") && t.length > 1 && !/^#\d+$/.test(t)) out.tags.push(t.slice(1));
    else if (LEADING_FLAGS.has(t.toLowerCase())) setFlag(FLAG_WORDS[t.toLowerCase()]);
    else nameParts.push(t);
  }
  out.speciesText = nameParts.join(" ");
  out.species = out.speciesText ? match(out.speciesText) : lastSpecies;
  if (out.speciesText && !out.species) out.errors.push(`No Pokémon called “${out.speciesText}”.`);

  const numbers: number[] = [];
  for (; i < tokens.length; i++) {
    const t = tokens[i];
    const lower = t.toLowerCase();
    const hp = /^hp(\d+)$/.exec(lower);
    if (hp) out.hp = Number(hp[1]);
    else if (lower === "hp" && /^\d+$/.test(tokens[i + 1] ?? "")) out.hp = Number(tokens[++i]);
    else if (t.startsWith("#") && t.length > 1) out.tags.push(t.slice(1));
    else if (FLAG_WORDS[lower]) setFlag(FLAG_WORDS[lower]);
    else if (out.cp !== null && !out.iv && compactIv(t)) out.iv = compactIv(t);
    else if (/^\d[\d,]*$/.test(t)) numbers.push(Number(t.replace(/,/g, "")));
    else out.errors.push(`Didn't understand “${t}”.`);
    if (out.cp === null && numbers.length) out.cp = numbers.shift()!;
  }

  if (numbers.length === 3 && !out.iv) {
    if (numbers.every(isIv)) out.iv = numbers as [number, number, number];
    else out.errors.push("The appraisal should be three numbers from 0 to 15.");
  } else if (numbers.length) {
    out.errors.push("After the CP, type the appraisal as three numbers, like 15 14 13.");
  }
  if (!out.species && !out.speciesText) out.errors.push("Start with the Pokémon's name.");
  if (out.cp === null) out.errors.push("Add the CP.");
  else if (out.cp < 10) out.errors.push("CP should be 10 or more.");
  out.tags = [...new Set(out.tags)];
  return out;
}

// ---------------------------------------------------------------- speech

const SMALL: Record<string, number> = {
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };

/** Words that end a spoken entry and add it. */
export const SUBMIT_WORDS = ["add", "save", "next", "enter", "done"];

/**
 * Tidies speech-to-text output into quick-entry syntax: number words become
 * digits ("fifteen fourteen thirteen" → "15 14 13", "one thousand fifty six"
 * → "1056"), "HP 120" stays as is, and a trailing "add" is reported.
 */
export function fromSpeech(text: string): { line: string; submit: boolean } {
  const raw = text
    .toLowerCase()
    .replace(/(\d)\s*[-–]\s*(?=\d)/g, "$1 ") // "15-14-13" → "15 14 13"
    .replace(/(\w)-(\w)/g, "$1 $2")
    .split(/\s+/)
    .filter(Boolean);
  let submit = false;
  while (raw.length && SUBMIT_WORDS.includes(raw[raw.length - 1])) {
    raw.pop();
    submit = true;
  }

  const out: string[] = [];
  let cur: { total: number; group: number; lastKind: "small" | "teen" | "tens" | "scale" } | null = null;
  const flush = () => {
    if (cur) out.push(String(cur.total + cur.group));
    cur = null;
  };
  for (const w of raw) {
    if (w in SMALL) {
      const n = SMALL[w];
      const kind = n >= 10 ? "teen" : "small";
      // Units can follow a tens word ("fifty six") or a scale ("thousand six").
      if (n > 0 && cur && ((kind === "small" && cur.lastKind === "tens" && cur.group % 10 === 0) || cur.lastKind === "scale")) {
        cur.group += n;
        cur.lastKind = kind;
      } else {
        flush();
        cur = { total: 0, group: n, lastKind: kind };
      }
    } else if (w in TENS) {
      if (cur && cur.lastKind === "scale") {
        cur.group += TENS[w];
        cur.lastKind = "tens";
      } else {
        flush();
        cur = { total: 0, group: TENS[w], lastKind: "tens" };
      }
    } else if ((w === "hundred" || w === "thousand") && cur) {
      if (w === "hundred") cur.group *= 100;
      else {
        cur.total += cur.group * 1000;
        cur.group = 0;
      }
      cur.lastKind = "scale";
    } else {
      flush();
      out.push(w === "hp" || w === "h.p." ? "hp" : w);
    }
  }
  flush();
  return { line: out.join(" ").replace(/\bhp (\d+)/g, "hp$1"), submit };
}
