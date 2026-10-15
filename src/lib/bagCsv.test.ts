import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";
import { bagToCsv, csvToBag } from "./bagCsv";
import type { GameData, Species } from "./go/gamedata";
import type { Row } from "./bagRows";
import { calcCP, calcHP } from "./go/stats";

const machamp = {
  id: "machamp", name: "Machamp", dex: 68, types: ["Fighting"], atk: 234, def: 159, sta: 207,
  fast: ["COUNTER"], charged: ["DYNAMIC_PUNCH"], family: null,
} as Species;
const data = {
  species: [machamp],
  byId: new Map([["machamp", machamp]]),
  moves: {
    COUNTER: { name: "Counter", type: "Fighting", pvp: { power: 8, energyGain: 6, turns: 2 } },
    DYNAMIC_PUNCH: { name: "Dynamic Punch", type: "Fighting", pvp: { power: 90, energy: 45 } },
  },
} as unknown as GameData;

describe("CSV", () => {
  it("round-trips quotes, commas and line breaks", () => {
    const rows = [["a", 'say "hi", ok', "line\nbreak"], ["1", "", "x"]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("reads Excel files with a byte-order mark and CRLF endings", () => {
    expect(parseCsv("﻿a,b\r\n1,2\r\n\r\n")).toEqual([["a", "b"], ["1", "2"]]);
  });

  it("neutralizes spreadsheet formulas on export", () => {
    expect(toCsv([["=HYPERLINK(1)"]])).toBe("'=HYPERLINK(1)\r\n");
  });
});

describe("bag backups", () => {
  const iv: [number, number, number] = [12, 8, 14];
  const ivs = { atk: 12, def: 8, sta: 14 };
  const row: Row = {
    id: "abc123def0", added: Date.UTC(2026, 9, 14), species: "machamp", sp: machamp,
    cp: calcCP(machamp, ivs, 27.5), hp: calcHP(machamp, ivs, 27.5), iv, level: 27.5, ivPct: 76,
    fast: "COUNTER", charged: "DYNAMIC_PUNCH", nickname: "=Buff, \"Boi\"", shiny: true, favorite: true,
    variant: "shadow", tags: ["PvP", "@home"], caught: "2026-10-14",
  };

  it("restores exactly what it exported", () => {
    const { items, errors } = csvToBag(bagToCsv([row]), data);
    expect(errors).toEqual([]);
    expect(items).toHaveLength(1);
    expect(items[0].id).toBe(row.id);
    expect(items[0].added).toBe(row.added);
    expect(items[0].input).toEqual({
      species: "machamp", cp: row.cp, hp: row.hp, iv, level: 27.5, fast: "COUNTER", charged: "DYNAMIC_PUNCH",
      charged2: undefined, nickname: "=Buff, \"Boi\"", shiny: true, lucky: false, favorite: true,
      variant: "shadow", tags: ["PvP", "@home"], caught: "2026-10-14",
    });
  });

  it("accepts hand-made files with names instead of IDs", () => {
    const csv = "Name,CP,Attack IV,Defense IV,Stamina IV,Fast move,Shiny\nmachamp,2000,15,15,15,counter,yes\n";
    const { items, errors } = csvToBag(csv, data);
    expect(errors).toEqual([]);
    expect(items[0].input).toMatchObject({ species: "machamp", cp: 2000, iv: [15, 15, 15], fast: "COUNTER", shiny: true });
  });

  it("reports bad rows with spreadsheet row numbers and keeps the good ones", () => {
    const csv = "species,cp,attack_iv,defense_iv,stamina_iv\nmachamp,2000,,,\nmachampp,100,,,\nmachamp,abc,,,\nmachamp,500,16,1,1\nmachamp,500,1,1,\n";
    const { items, errors } = csvToBag(csv, data);
    expect(items).toHaveLength(1);
    expect(errors).toEqual([
      "Row 3: unknown species “machampp”.",
      "Row 4: CP should be a whole number from 10 to 10,000.",
      "Row 5: IVs should be whole numbers from 0 to 15.",
      "Row 6: fill in all three IVs, or leave all three blank.",
    ]);
  });

  it("rejects files that aren't backups", () => {
    expect(csvToBag("hello,world\n1,2\n", data).errors[0]).toContain("no species column");
  });
});
