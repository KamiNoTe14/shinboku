import { describe, expect, it } from "vitest";
import { recommend } from "./recommend";
import type { GameData, Species } from "./go/gamedata";
import type { Row } from "./bagRows";
import { calcCP, ivPercent } from "./go/stats";

const sp = (s: Partial<Species> & Pick<Species, "id" | "name" | "atk" | "def" | "sta">): Species =>
  ({ dex: 1, types: ["Normal"], fast: [], charged: [], family: null, ...s }) as Species;

const pidgey = sp({ id: "pidgey", name: "Pidgey", atk: 85, def: 73, sta: 120 });
const machop = sp({ id: "machop", name: "Machop", atk: 137, def: 82, sta: 172, evolutions: ["machoke"] });
const machoke = sp({ id: "machoke", name: "Machoke", atk: 177, def: 125, sta: 190, parent: "machop", evolutions: ["machamp"] });
const machamp = sp({
  id: "machamp", name: "Machamp", atk: 234, def: 159, sta: 207, parent: "machoke",
  meta: { gl: 150, ul: 150 }, legacy: ["PAYBACK"],
});
const mewtwo = sp({ id: "mewtwo", name: "Mewtwo", atk: 300, def: 182, sta: 214, tags: ["legendary"] });

const species = [pidgey, machop, machoke, machamp, mewtwo];
const data = {
  species,
  byId: new Map(species.map((s) => [s.id, s])),
  moves: { PAYBACK: { name: "Payback", type: "Dark", pvp: { power: 110, energy: 60 } } },
} as unknown as GameData;

let n = 0;
function row(s: Species, iv: [number, number, number], level: number, extra: Partial<Row> = {}): Row {
  const ivs = { atk: iv[0], def: iv[1], sta: iv[2] };
  return { id: `p${n++}`, added: n, species: s.id, sp: s, cp: calcCP(s, ivs, level), iv, level, ivPct: ivPercent(ivs), ...extra };
}

describe("transfer recommendations", () => {
  it("suggests the weaker duplicate and keeps the best copy", () => {
    const good = row(pidgey, [15, 14, 15], 20);
    const bad = row(pidgey, [2, 3, 1], 12);
    const r = recommend([good, bad], data);
    expect(r.transfer.map((a) => a.row.id)).toEqual([bad.id]);
    expect(r.transfer[0].transfer).toContain("equal or better IVs in every stat");
    expect(r.all.find((a) => a.row.id === good.id)!.keep).toContain("Your best Pidgey");
  });

  it("never suggests the only copy of a species", () => {
    expect(recommend([row(pidgey, [0, 0, 0], 10)], data).transfer).toHaveLength(0);
  });

  it("protects favorites, shinies, luckies, tags, Legendaries and powered-up Pokémon", () => {
    const best = row(pidgey, [15, 15, 14], 20);
    const protectedRows = [
      row(pidgey, [1, 1, 1], 10, { favorite: true }),
      row(pidgey, [1, 1, 2], 10, { shiny: true }),
      row(pidgey, [1, 2, 1], 10, { lucky: true }),
      row(pidgey, [2, 1, 1], 10, { tags: ["Keep"] }),
      row(pidgey, [2, 2, 1], 38),
    ];
    expect(recommend([best, ...protectedRows], data).transfer).toHaveLength(0);
    const legends = [row(mewtwo, [15, 15, 15], 20), row(mewtwo, [10, 10, 10], 20)];
    expect(recommend(legends, data).transfer).toHaveLength(0);
  });

  it("protects Pokémon that know a Legacy move", () => {
    const best = row(machamp, [15, 15, 15], 30);
    const legacy = row(machamp, [1, 1, 1], 20, { charged: "PAYBACK" });
    const r = recommend([best, legacy], data);
    expect(r.transfer).toHaveLength(0);
    expect(r.all.find((a) => a.row.id === legacy.id)!.keep[0]).toContain("Payback");
  });

  it("keeps a low-attack Machop that makes a good Great League Machamp", () => {
    const hundo = row(machop, [15, 15, 15], 20);
    // 0/14/11 is Machamp's rank 1 Great League spread.
    const pvpGem = row(machop, [0, 14, 11], 15);
    const r = recommend([hundo, pvpGem], data);
    expect(r.transfer).toHaveLength(0);
    const gem = r.pvp.find((a) => a.row.id === pvpGem.id)!;
    const gl = gem.pvp.find((p) => p.league === "gl")!;
    expect(gl.target.id).toBe("machamp");
    expect(gl.rank).toBe(1);
    expect(gem.keep.some((k) => k.includes("Great League") && k.includes("as Machamp"))).toBe(true);
  });

  it("doesn't count leagues the Pokémon is already too strong for", () => {
    const strong = row(machamp, [0, 15, 15], 40); // well over 1,500 CP
    const r = recommend([strong], data);
    expect(r.all[0].pvp.every((p) => p.league !== "gl")).toBe(true);
  });

  it("compares shadows only with shadows", () => {
    const regular = row(pidgey, [15, 15, 15], 20);
    const shadow = row(pidgey, [1, 1, 1], 20, { variant: "shadow" });
    expect(recommend([regular, shadow], data).transfer).toHaveLength(0);
  });

  it("skips Pokémon without an appraisal", () => {
    const a = row(pidgey, [15, 15, 15], 20);
    const b = { ...row(pidgey, [1, 1, 1], 20), iv: undefined, ivPct: null };
    const r = recommend([a, b], data);
    expect(r.transfer).toHaveLength(0);
    expect(r.unappraised).toBe(1);
  });
});
