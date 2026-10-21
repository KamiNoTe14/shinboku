import { describe, expect, it } from "vitest";
import { data, sp } from "./go/testGameData";
import { blankRow, checkDraft, parseFlags, suggestMoves, toInput, type DraftRow } from "./batch";
import { calcCP, calcHP } from "./go/stats";

const row = (r: Partial<DraftRow>): DraftRow => ({ ...blankRow(), ...r });
const iv = { atk: 15, def: 14, sta: 13 };
const cp = calcCP(sp("machop"), iv, 20);
const hp = calcHP(sp("machop"), iv, 20);

describe("parseFlags", () => {
  it("reads letters, runs of letters and words", () => {
    expect(parseFlags("sl").flags).toEqual({ shiny: true, lucky: true });
    expect(parseFlags("shiny d").flags).toEqual({ shiny: true, variant: "shadow" });
    expect(parseFlags("x").unknown).toEqual(["x"]);
  });
});

describe("checkDraft", () => {
  it("ignores blank rows and needs species and CP", () => {
    expect(checkDraft(blankRow(), data).status).toBe("empty");
    expect(checkDraft(row({ cp: "500" }), data)).toMatchObject({ status: "error", message: "Choose a species." });
    expect(checkDraft(row({ species: "machop" }), data)).toMatchObject({ status: "error", message: "Enter the CP." });
  });

  it("checks CP and HP agree", () => {
    expect(checkDraft(row({ species: "machop", cp: String(cp), hp: String(hp) }), data).status).toBe("ok");
    expect(checkDraft(row({ species: "machop", cp: String(cp), hp: "500" }), data).status).toBe("error");
  });

  it("rejects shadow flags on species that can't be Shadow", () => {
    expect(checkDraft(row({ species: "mew", cp: "1000", flags: "d" }), data).status).toBe("error");
  });
});

describe("toInput", () => {
  it("builds a bag entry", () => {
    const input = toInput(row({ species: "machop", cp: "1,056", hp: "120", fast: "KARATE_CHOP", charged: "CROSS_CHOP", flags: "s", tags: "PvP, PvP, Raid", caught: "2026-10-21" }));
    expect(input).toMatchObject({ species: "machop", cp: 1056, hp: 120, fast: "KARATE_CHOP", shiny: true, tags: ["PvP", "Raid"], caught: "2026-10-21" });
  });
});

describe("suggestMoves", () => {
  it("prefers this batch, then the bag's newest", () => {
    const bag = [
      { id: "a", added: 1, species: "machop", cp: 1, fast: "LOW_KICK", charged: "BRICK_BREAK" },
      { id: "b", added: 2, species: "machop", cp: 1, fast: "KARATE_CHOP", charged: "CROSS_CHOP" },
    ];
    expect(suggestMoves("machop", [], bag)).toEqual({ fast: "KARATE_CHOP", charged: "CROSS_CHOP" });
    expect(suggestMoves("machop", [row({ species: "machop", fast: "ROCK_SMASH", charged: "LOW_SWEEP" })], bag)).toEqual({ fast: "ROCK_SMASH", charged: "LOW_SWEEP" });
    expect(suggestMoves("pidgey", [], bag)).toBeNull();
  });
});
