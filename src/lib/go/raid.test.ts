import { data, sp } from "./testGameData";
import { describe, expect, it } from "vitest";
import { asTarget, bestMoveset, effectiveness, raidPerformance, weaknesses } from "./raid";
import { powerUpCost } from "./powerup";

const hundo = { atk: 15, def: 15, sta: 15 };

describe("type effectiveness", () => {
  it("uses Pokémon GO's multipliers", () => {
    expect(effectiveness("Fighting", ["Rock", "Dark"], data)).toBeCloseTo(2.56); // Tyranitar
    expect(effectiveness("Fire", ["Water"], data)).toBe(0.625);
    expect(effectiveness("Normal", ["Ghost"], data)).toBe(0.390625); // immunity in the games
    expect(effectiveness("Electric", ["Ground", "Flying"], data)).toBeCloseTo(0.390625 * 1.6);
  });

  it("lists a boss's weaknesses first", () => {
    expect(weaknesses(sp("tyranitar").types, data)[0]).toEqual({ type: "Fighting", mult: expect.closeTo(2.56) });
  });
});

describe("raid performance", () => {
  const ttar = asTarget(sp("tyranitar"));

  it("rates a super-effective attacker far above a resisted one", () => {
    const machamp = raidPerformance(
      { species: sp("machamp"), iv: hundo, level: 40, fast: "COUNTER", charged: "DYNAMIC_PUNCH" }, ttar, null, data)!;
    const gengar = raidPerformance(
      { species: sp("gengar"), iv: hundo, level: 40, fast: "LICK", charged: "SHADOW_BALL" }, ttar, null, data)!;
    expect(machamp.dps).toBeGreaterThan(gengar.dps * 2);
  });

  it("rewards weather, shadows and higher levels", () => {
    const base = { species: sp("machamp"), iv: hundo, level: 40, fast: "COUNTER", charged: "DYNAMIC_PUNCH" };
    const plain = raidPerformance(base, ttar, null, data)!;
    expect(raidPerformance(base, ttar, "OVERCAST", data)!.dps).toBeGreaterThan(plain.dps);
    expect(raidPerformance({ ...base, shadow: true }, ttar, null, data)!.dps).toBeGreaterThan(plain.dps);
    expect(raidPerformance({ ...base, level: 50 }, ttar, null, data)!.dps).toBeGreaterThan(plain.dps);
    // Shadows hit harder but fall faster.
    expect(raidPerformance({ ...base, shadow: true }, ttar, null, data)!.tdo / plain.tdo).toBeLessThan(1.1);
  });

  it("picks a fighting moveset for Machamp against Tyranitar", () => {
    const pick = bestMoveset(sp("machamp"), hundo, 40, false, ttar, null, data)!;
    expect(data.moves[pick.fast].type).toBe("Fighting");
    expect(data.moves[pick.charged].type).toBe("Fighting");
  });

  it("never assumes a Hidden Power type", () => {
    const pick = bestMoveset(sp("regigigas"), hundo, 40, true, asTarget(sp("mewtwo")), null, data)!;
    expect(pick.fast.startsWith("HIDDEN_POWER_")).toBe(false);
  });

  it("can leave out Elite TM moves", () => {
    const pick = bestMoveset(sp("machamp"), hundo, 40, false, ttar, null, data, false)!;
    expect(pick.elite).toBe(false);
  });
});

describe("power-up costs", () => {
  it("matches published totals", () => {
    expect(powerUpCost(1, 40, data.upgrade).stardust).toBe(270_000);
    // Level 40 to 50: 250,000 stardust and 296 XL Candy.
    expect(powerUpCost(40, 50, data.upgrade)).toEqual({ stardust: 250_000, candy: 0, xl: 296 });
  });

  it("applies shadow, purified and lucky costs", () => {
    const normal = powerUpCost(20, 30, data.upgrade);
    expect(powerUpCost(20, 30, data.upgrade, { shadow: true }).stardust).toBe(Math.round(normal.stardust * 1.2));
    expect(powerUpCost(20, 30, data.upgrade, { lucky: true }).stardust).toBe(normal.stardust / 2);
    expect(powerUpCost(20, 30, data.upgrade, { purified: true }).stardust).toBeLessThan(normal.stardust);
  });

  it("costs nothing when already there", () => {
    expect(powerUpCost(40, 40, data.upgrade)).toEqual({ stardust: 0, candy: 0, xl: 0 });
  });
});
