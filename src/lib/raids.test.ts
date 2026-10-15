import { data, sp } from "./go/testGameData";
import { describe, expect, it } from "vitest";
import type { Row } from "./bagRows";
import { recommend } from "./recommend";
import { bagTeam, counters, evolutionPath, evolveSuggestions, powerUpPlan, relativeStrength, requirements, typeRank } from "./raids";


let n = 0;
const row = (species: string, cp: number, iv?: [number, number, number], extra: Partial<Row> = {}): Row => ({
  id: `r${n++}`, added: 0, species, cp, iv, sp: sp(species),
  ivPct: iv ? Math.round(((iv[0] + iv[1] + iv[2]) / 45) * 100) : null, ...extra,
});

describe("counters", () => {
  it("puts Fighting types near the top against Tyranitar", () => {
    const top = counters(sp("tyranitar"), null, data).slice(0, 15);
    expect(top.some((c) => c.sp.id === "terrakion")).toBe(true);
    const strong = ["Fighting", "Water", "Ground", "Grass", "Steel", "Fairy", "Bug"];
    expect(top.every((c) => strong.includes(data.moves[c.charged].type))).toBe(true);
  });
});

describe("bagTeam", () => {
  it("ranks a Machamp above a Pidgey against Tyranitar and uses its real level", () => {
    const team = bagTeam([row("pidgey", 500, [15, 15, 15]), row("machamp", 3056, [15, 15, 15])], sp("tyranitar"), null, data);
    expect(team[0].row.species).toBe("machamp");
    expect(team[0].level).toBe(40);
    expect(team[0].assumedMoves).toBe(true);
    expect(data.moves[team[0].charged].type).toBe("Fighting");
  });

  it("uses the moves a Pokémon actually knows", () => {
    const team = bagTeam([row("machamp", 3056, [15, 15, 15], { fast: "KARATE_CHOP", charged: "HEAVY_SLAM" })], sp("tyranitar"), null, data);
    expect(team[0]).toMatchObject({ fast: "KARATE_CHOP", charged: "HEAVY_SLAM", assumedMoves: false });
  });

  it("estimates unappraised Pokémon", () => {
    const team = bagTeam([row("machamp", 2500)], sp("tyranitar"), null, data);
    expect(team[0].estimatedIv).toBe(true);
    expect(team[0].level).toBeGreaterThan(25);
  });
});

describe("type rankings", () => {
  it("puts well-known attackers near the top of their type", () => {
    expect(typeRank(sp("rampardos"), false, "Rock", data)).toBeLessThanOrEqual(5);
    expect(typeRank(sp("rampardos"), true, "Rock", data)).toBeLessThanOrEqual(5);
    expect(typeRank(sp("pidgey"), false, "Fighting", data)).toBeNull();
  });
});

describe("powerUpPlan", () => {
  it("prices the climb to level 40", () => {
    const plan = powerUpPlan([row("machamp", 2000, [15, 15, 15], { level: 30 })], data);
    const fighting = plan.find((g) => g.type === "Fighting")!;
    expect(fighting.picks[0].cost.stardust).toBeGreaterThan(100_000);
    expect(fighting.picks[0].pct).toBeGreaterThan(50);
    expect(fighting.picks[0].pct).toBeLessThan(100);
  });
});

describe("evolve", () => {
  it("finds multi-step paths and sums their candy", () => {
    const path = evolutionPath(sp("gastly"), sp("gengar"), data)!;
    expect(path.map((s) => s.to.id)).toEqual(["haunter", "gengar"]);
    expect(requirements(path)).toContain("Free if it was traded (for Gengar)");
  });

  it("suggests evolving for a new Pokédex entry and for raids", () => {
    const rows = [row("machop", 500, [15, 14, 13]), row("machop", 400, [1, 2, 3])];
    const s = evolveSuggestions(recommend(rows, data).all, data);
    const ids = s.map((x) => `${x.row.id}>${x.target.id}`);
    expect(ids).toContain(`${rows[0].id}>machoke`);
    expect(ids.some((x) => x.startsWith(rows[1].id))).toBe(false);
    const machamp = s.find((x) => x.target.id === "machamp");
    expect(machamp?.candy).toBe(125);
    expect(machamp?.reasons.some((r) => r.kind === "raid")).toBe(true);
  });

  it("gives relative strength on a readable scale", () => {
    expect(relativeStrength(0.9 ** 4, 1)).toBe(90);
  });
});
