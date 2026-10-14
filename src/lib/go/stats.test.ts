import { describe, expect, it } from "vitest";
import { appraisalStars, calcCP, calcHP, ivPercent, matchingLevels, solveIVs } from "./stats";

// Base stats as published in Pokémon GO's game data.
const machamp = { atk: 234, def: 159, sta: 207 };
const mewtwo = { atk: 300, def: 182, sta: 214 };
const dragonite = { atk: 263, def: 198, sta: 209 };
const perfect = { atk: 15, def: 15, sta: 15 };

describe("CP and HP", () => {
  // Reference values are the widely published max CPs for these species.
  it("matches known level 40 max CPs", () => {
    expect(calcCP(machamp, perfect, 40)).toBe(3056);
    expect(calcCP(mewtwo, perfect, 40)).toBe(4178);
    expect(calcCP(dragonite, perfect, 40)).toBe(3792);
  });

  it("matches the known level 50 max CP for Mewtwo", () => {
    expect(calcCP(mewtwo, perfect, 50)).toBe(4724);
  });

  it("matches the known level 40 max HP for Machamp", () => {
    expect(calcHP(machamp, perfect, 40)).toBe(175);
  });

  it("never goes below 10 CP or 10 HP", () => {
    const weak = { atk: 29, def: 85, sta: 85 };
    expect(calcCP(weak, { atk: 0, def: 0, sta: 0 }, 1)).toBe(10);
    expect(calcHP({ atk: 1, def: 1, sta: 1 }, { atk: 0, def: 0, sta: 0 }, 1)).toBe(10);
  });

  it("handles half levels", () => {
    const a = calcCP(machamp, perfect, 40);
    const b = calcCP(machamp, perfect, 40.5);
    const c = calcCP(machamp, perfect, 41);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

describe("appraisal", () => {
  it("converts IVs to percent", () => {
    expect(ivPercent(perfect)).toBe(100);
    expect(ivPercent({ atk: 0, def: 15, sta: 15 })).toBe(67);
  });

  it("matches the in-game star thresholds", () => {
    expect(appraisalStars({ atk: 15, def: 15, sta: 15 })).toBe(3);
    expect(appraisalStars({ atk: 15, def: 15, sta: 7 })).toBe(3); // 37
    expect(appraisalStars({ atk: 15, def: 15, sta: 6 })).toBe(2); // 36
    expect(appraisalStars({ atk: 10, def: 10, sta: 10 })).toBe(2); // 30
    expect(appraisalStars({ atk: 10, def: 10, sta: 9 })).toBe(1); // 29
    expect(appraisalStars({ atk: 8, def: 8, sta: 7 })).toBe(1); // 23
    expect(appraisalStars({ atk: 8, def: 7, sta: 7 })).toBe(0); // 22
  });
});

describe("working backward from what the trainer sees", () => {
  it("finds the level from CP, HP and IVs", () => {
    const iv = { atk: 12, def: 8, sta: 14 };
    for (const level of [1, 10.5, 20, 25, 30.5, 35, 40, 45.5, 50, 51]) {
      const cp = calcCP(dragonite, iv, level);
      const hp = calcHP(dragonite, iv, level);
      expect(matchingLevels(dragonite, iv, cp, hp)).toContain(level);
    }
  });

  it("returns nothing for impossible numbers (likely a typo)", () => {
    expect(matchingLevels(machamp, perfect, 3057, 175)).toEqual([]);
  });

  it("recovers the true IVs among the candidates when only CP and HP are known", () => {
    const iv = { atk: 3, def: 15, sta: 11 };
    const cp = calcCP(machamp, iv, 27.5);
    const hp = calcHP(machamp, iv, 27.5);
    const candidates = solveIVs(machamp, cp, hp);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates).toContainEqual({ iv, level: 27.5 });
    for (const c of candidates) {
      expect(calcCP(machamp, c.iv, c.level)).toBe(cp);
      expect(calcHP(machamp, c.iv, c.level)).toBe(hp);
    }
  });
});
