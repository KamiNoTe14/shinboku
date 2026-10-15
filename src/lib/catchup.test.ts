import { describe, expect, it } from "vitest";
import { data, sp } from "./go/testGameData";
import type { Row } from "./bagRows";
import { appraisalQueue, cleanupSearch, dexRanges, families, importantSpecies } from "./catchup";

const row = (species: string, cp: number, iv?: [number, number, number]): Row => ({
  id: `${species}${cp}`, added: 0, species, cp, iv, sp: sp(species), ivPct: iv ? 50 : null,
});

describe("importantSpecies", () => {
  it("marks lines that matter in leagues or raids, including pre-evolutions", () => {
    const imp = importantSpecies(data);
    expect(imp.has("medicham")).toBe(true);
    expect(imp.has("meditite")).toBe(true); // evolves into a league staple
    expect(imp.get("machop")?.some((r) => r.includes("raid"))).toBe(true);
    expect(imp.has("pidgey")).toBe(false);
  });
});

describe("cleanup search", () => {
  it("compresses dex numbers into ranges", () => {
    expect(dexRanges([5, 1, 2, 3, 7, 10, 11])).toBe("1-3,5,7,10-11");
  });

  it("leaves out species that matter and special Pokémon", () => {
    const { query, parts } = cleanupSearch(data, { maxStars: 1 });
    const dexOf = (q: string) =>
      q.split("&").at(-1)!.split(",").flatMap((p) => {
        const [a, b] = p.split("-").map(Number);
        return Array.from({ length: (b ?? a) - a + 1 }, (_, k) => a + k);
      });
    const dex = dexOf(query);
    expect(dex).toContain(16); // Pidgey
    expect(dex).not.toContain(307); // Meditite
    expect(dex).not.toContain(150); // Mewtwo
    expect(dex).not.toContain(570); // Zorua: search reads its disguise
    expect(query.startsWith("!shiny&!lucky")).toBe(true);
    expect(query).toContain("&0*,1*&");
    expect(query).not.toContain("2*");
    // Short parts cover the same species, each with every protection up front.
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.flatMap((p) => dexOf(p.query))).toEqual(dex);
    for (const p of parts) {
      expect(p.query.length).toBeLessThanOrEqual(260);
      expect(p.query.startsWith("!shiny&")).toBe(true);
    }
  });
});

describe("families", () => {
  it("groups lines and counts the bag", () => {
    const f = families(data, [row("machop", 500), row("machamp", 2000)]);
    const machop = f.find((x) => x.root.id === "machop")!;
    expect(machop.members.map((m) => m.id)).toEqual(expect.arrayContaining(["machop", "machoke", "machamp"]));
    expect(machop.count).toBe(2);
    expect(f.find((x) => x.root.id === "rattata")!.members.map((m) => m.id)).toContain("raticate_alolan");
  });
});

describe("appraisal queue", () => {
  it("only lists unappraised Pokémon of lines that matter", () => {
    const q = appraisalQueue([row("machop", 500), row("pidgey", 100), row("machop", 600, [1, 2, 3])], data);
    expect(q.map((x) => x.row.id)).toEqual(["machop500"]);
  });
});
