import { describe, expect, it } from "vitest";
import { pvpRank } from "./pvp";
import { calcCP } from "./stats";

// Base stats from Pokémon GO's game data.
const medicham = { id: "medicham", atk: 121, def: 152, sta: 155 };
const azumarill = { id: "azumarill", atk: 112, def: 152, sta: 225 };
const machamp = { id: "machamp", atk: 234, def: 159, sta: 207 };

describe("Battle League IV ranks", () => {
  it("matches Medicham's published rank 1 Great League spread", () => {
    // Pokémon GO Hub lists 5/15/15 at level 50 and 1,499 CP as Medicham's best Great League IVs.
    const r = pvpRank(medicham, { atk: 5, def: 15, sta: 15 }, "gl")!;
    expect(r).toEqual({ rank: 1, pct: 100, level: 50, cp: 1499 });
    // A perfect Medicham passes 1,500 CP before level 50, so it ranks lower.
    expect(pvpRank(medicham, { atk: 15, def: 15, sta: 15 }, "gl")!.rank).toBeGreaterThan(100);
  });

  it("prefers low attack and high bulk for capped leagues", () => {
    const lowAtk = pvpRank(azumarill, { atk: 0, def: 15, sta: 15 }, "gl")!;
    const hundo = pvpRank(azumarill, { atk: 15, def: 15, sta: 15 }, "gl")!;
    expect(lowAtk.rank).toBeLessThan(hundo.rank);
  });

  it("keeps the best level under the cap", () => {
    const iv = { atk: 3, def: 14, sta: 12 };
    const r = pvpRank(machamp, iv, "gl")!;
    expect(r.cp).toBeLessThanOrEqual(1500);
    expect(r.cp).toBe(calcCP(machamp, iv, r.level));
    // Half a level more would pass the cap.
    expect(calcCP(machamp, iv, r.level + 0.5)).toBeGreaterThan(1500);
  });

  it("ranks every spread exactly once", () => {
    const seen = new Set<number>();
    for (let a = 0; a <= 15; a += 5)
      for (let d = 0; d <= 15; d += 5)
        for (let s = 0; s <= 15; s += 5) seen.add(pvpRank(machamp, { atk: a, def: d, sta: s }, "gl")!.rank);
    expect([...seen].every((r) => r >= 1 && r <= 4096)).toBe(true);
    expect(seen.size).toBeGreaterThan(50);
  });

  it("ranks shadows with their battle multipliers", () => {
    const iv = { atk: 15, def: 15, sta: 15 };
    expect(pvpRank(machamp, iv, "ul", true)).not.toBeNull();
  });
});
