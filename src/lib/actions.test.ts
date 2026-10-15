import { describe, expect, it } from "vitest";
import { data, sp } from "./go/testGameData";
import { canPowerUp, evolve, powerUp, undoChange } from "./actions";
import type { BagPokemon } from "./bag";
import { calcCP } from "./go/stats";

const hundo = { atk: 15, def: 15, sta: 15 };
const mon = (extra: Partial<BagPokemon>): BagPokemon => ({ id: "x", added: 0, species: "machop", cp: 0, ...extra });

describe("power up", () => {
  it("goes up half a level and recomputes CP and HP", () => {
    const p = mon({ cp: calcCP(sp("machop"), hundo, 20), iv: [15, 15, 15] });
    const c = powerUp(p, sp("machop"), data);
    expect(c.level).toBe(20.5);
    expect(c.cp).toBe(calcCP(sp("machop"), hundo, 20.5));
    const check = canPowerUp(p, sp("machop"), data);
    expect(check.ok && check.cost).toEqual({ stardust: 2500, candy: 2, xl: 0 });
  });

  it("can jump to a level and stops at 50", () => {
    const p = mon({ level: 39, cp: 1, iv: [15, 15, 15] });
    expect(powerUp(p, sp("machop"), data, 40).level).toBe(40);
    expect(powerUp(p, sp("machop"), data, 60).level).toBe(50);
    expect(canPowerUp({ ...p, level: 50 }, sp("machop"), data).ok).toBe(false);
  });

  it("needs an appraisal", () => {
    expect(canPowerUp(mon({ cp: 500 }), sp("machop"), data).ok).toBe(false);
  });
});

describe("evolve", () => {
  it("keeps IVs and level, recomputes CP and clears moves", () => {
    const p = mon({ level: 30, cp: 1, iv: [15, 15, 15], fast: "KARATE_CHOP", charged: "CROSS_CHOP" });
    const c = evolve(p, sp("machop"), sp("machoke"));
    expect(c).toMatchObject({ species: "machoke", level: 30, cp: calcCP(sp("machoke"), hundo, 30), fast: null, charged: null });
  });

  it("asks for the new CP without an appraisal", () => {
    expect(() => evolve(mon({ cp: 500 }), sp("machop"), sp("machoke"))).toThrow();
    expect(evolve(mon({ cp: 500 }), sp("machop"), sp("machoke"), 820)).toMatchObject({ cp: 820, species: "machoke" });
  });

  it("undoes back to the old values", () => {
    const p = mon({ level: 30, cp: 900, iv: [15, 15, 15], fast: "KARATE_CHOP" });
    const u = undoChange(p, evolve(p, sp("machop"), sp("machoke")));
    expect(u).toMatchObject({ species: "machop", cp: 900, level: 30, fast: "KARATE_CHOP", charged: null, hp: null });
  });
});
