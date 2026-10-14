import { describe, expect, it } from "vitest";
import { buildSearches, MAX_PER_SEARCH, type Searchable } from "./searchString";

const mon = (id: string, dex: number, cp: number, extra: Partial<Searchable> = {}): Searchable => ({
  id,
  dex,
  cp,
  ...extra,
});

describe("Pokémon GO search strings", () => {
  it("builds an exact search for one species", () => {
    const sel = [mon("a", 68, 1204), mon("b", 68, 987)];
    const [r] = buildSearches(sel, [...sel, mon("c", 68, 2814)]);
    expect(r.query).toBe("68&cp987,cp1204");
    expect(r.count).toBe(2);
    expect(r.extras).toBe(0);
  });

  it("adds HP when a CP collision would grab an extra Pokémon", () => {
    const sel = [mon("a", 68, 1204, { hp: 120 }), mon("b", 130, 2000, { hp: 150 })];
    // A Gyarados at 1,204 CP would match "68,130&cp1204,cp2000" without HP.
    const bag = [...sel, mon("c", 130, 1204, { hp: 99 })];
    const [r] = buildSearches(sel, bag);
    expect(r.query).toBe("68,130&cp1204,cp2000&hp120,hp150");
    expect(r.extras).toBe(0);
  });

  it("reports extras it can't remove", () => {
    const sel = [mon("a", 68, 1204), mon("b", 130, 2000)];
    const bag = [...sel, mon("c", 130, 1204)];
    const [r] = buildSearches(sel, bag);
    expect(r.query).toBe("68,130&cp1204,cp2000");
    expect(r.extras).toBe(1);
  });

  it("adds shared flags", () => {
    const sel = [mon("a", 25, 500, { shiny: true, lucky: true }), mon("b", 25, 600, { shiny: true })];
    const [r] = buildSearches(sel, sel);
    expect(r.query).toBe("25&cp500,cp600&shiny");
  });

  it("adds shadow when every selected Pokémon is shadow", () => {
    const sel = [mon("a", 68, 1500, { variant: "shadow" })];
    const [r] = buildSearches(sel, [...sel, mon("b", 68, 1500)]);
    expect(r.query).toBe("68&cp1500&shadow");
    expect(r.extras).toBe(0);
  });

  it("splits big selections into several searches", () => {
    const sel = Array.from({ length: MAX_PER_SEARCH + 5 }, (_, i) => mon(`m${i}`, 1 + (i % 3), 100 + i));
    const results = buildSearches(sel, sel);
    expect(results).toHaveLength(2);
    expect(results.reduce((n, r) => n + r.count, 0)).toBe(sel.length);
  });

  it("returns nothing for an empty selection", () => {
    expect(buildSearches([], [])).toEqual([]);
  });
});
