import { describe, expect, it } from "vitest";
import { data, sp } from "./testGameData";
import { fromSpeech, parseQuick, speciesMatcher } from "./quickEntry";

const match = speciesMatcher(data);
const q = (line: string, last = null as ReturnType<typeof sp> | null) => parseQuick(line, match, last);

describe("species matching", () => {
  it("finds names in any order, prefixes and misspellings", () => {
    expect(match("machop")?.id).toBe("machop");
    expect(match("Mach")?.id).toBe("machop");
    expect(match("alolan raichu")?.id).toBe("raichu_alolan");
    expect(match("raichu")?.id).toBe("raichu");
    expect(match("mr mime")?.id).toBe("mr_mime");
    expect(match("farfetchd")?.id).toBe("farfetchd");
    expect(match("machpo")?.id).toBe("machop");
    expect(match("#66")?.id).toBe("machop");
  });
});

describe("parseQuick", () => {
  it("reads species, CP and appraisal", () => {
    expect(q("machop 1056 15 14 13")).toMatchObject({ cp: 1056, iv: [15, 14, 13], errors: [] });
    expect(q("machop 1056 151413").iv).toEqual([15, 14, 13]);
    expect(q("machop 1056 15/14/13").iv).toEqual([15, 14, 13]);
    expect(q("machop 1056")).toMatchObject({ iv: null, errors: [] });
  });

  it("reuses the last species when the line starts with a number", () => {
    const r = q("1120 0 15 15", sp("medicham"));
    expect(r.species?.id).toBe("medicham");
    expect(r.iv).toEqual([0, 15, 15]);
  });

  it("reads HP, flags and tags", () => {
    const r = q("shiny alolan raichu 1650 hp120 151413 l #PvP #trade");
    expect(r.species?.id).toBe("raichu_alolan");
    expect(r).toMatchObject({ hp: 120, flags: { shiny: true, lucky: true }, tags: ["PvP", "trade"], errors: [] });
    expect(q("machop 900 d 10 10 10").flags.variant).toBe("shadow");
    expect(q("machop 900 hp 80").hp).toBe(80);
  });

  it("explains problems", () => {
    expect(q("blorpmon 900").errors[0]).toMatch(/No Pokémon/);
    expect(q("machop").errors).toContain("Add the CP.");
    expect(q("machop 900 16 2 3").errors[0]).toMatch(/0 to 15/);
    expect(q("machop 900 1 2").errors[0]).toMatch(/three numbers/);
  });
});

describe("fromSpeech", () => {
  it("turns number words into digits", () => {
    expect(fromSpeech("machop one thousand fifty six fifteen fourteen thirteen")).toEqual({
      line: "machop 1056 15 14 13",
      submit: false,
    });
    expect(fromSpeech("Machop 1056 15-14-13 add")).toEqual({ line: "machop 1056 15 14 13", submit: true });
    expect(fromSpeech("twelve hundred zero fifteen fifteen").line).toBe("1200 0 15 15");
    expect(fromSpeech("pikachu 500 HP 60 shiny next")).toEqual({ line: "pikachu 500 hp60 shiny", submit: true });
  });
});
