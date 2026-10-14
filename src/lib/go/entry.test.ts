import { describe, expect, it } from "vitest";
import { checkEntry, parseAppraisal, parseWholeNumber } from "./entry";
import type { Species } from "./gamedata";
import { calcCP, calcHP } from "./stats";

const machamp = {
  id: "machamp",
  name: "Machamp",
  dex: 68,
  types: ["Fighting"],
  atk: 234,
  def: 159,
  sta: 207,
  fast: [],
  charged: [],
  family: null,
  shadow: true,
} as Species;
const mew = { ...machamp, id: "mew", name: "Mew", shadow: undefined } as Species;

describe("parsing", () => {
  it("accepts common appraisal formats", () => {
    expect(parseAppraisal("15 14 13")).toEqual([15, 14, 13]);
    expect(parseAppraisal("15/14/13")).toEqual([15, 14, 13]);
    expect(parseAppraisal("0,15,15")).toEqual([0, 15, 15]);
    expect(parseAppraisal(" ")).toBeNull();
    expect(parseAppraisal("16 1 1")).toBe("invalid");
    expect(parseAppraisal("15 14")).toBe("invalid");
  });

  it("parses numbers with thousands separators", () => {
    expect(parseWholeNumber("2,814")).toBe(2814);
    expect(parseWholeNumber("")).toBeNull();
    expect(parseWholeNumber("28a")).toBe("invalid");
  });
});

describe("checking an entry", () => {
  const iv = { atk: 12, def: 8, sta: 14 };
  const cp = calcCP(machamp, iv, 27.5);
  const hp = calcHP(machamp, iv, 27.5);

  it("works out the level", () => {
    const r = checkEntry(machamp, String(cp), String(hp), "12 8 14", false);
    expect(r.status).toBe("ok");
    if (r.status === "ok") {
      expect(r.level).toBe(27.5);
      expect(r.ivPercent).toBe(76);
      expect(r.stars).toBe(2);
    }
  });

  it("flags impossible numbers as a likely typo", () => {
    const r = checkEntry(machamp, String(cp + 1), String(hp), "12 8 14", false);
    expect(r.status).toBe("error");
    if (r.status === "error") expect(r.canForce).toBe(true);
  });

  it("allows saving without an appraisal", () => {
    expect(checkEntry(machamp, "1500", "", "", false).status).toBe("ok");
  });

  it("requires species and CP", () => {
    expect(checkEntry(null, "1500", "", "", false).status).toBe("error");
    expect(checkEntry(machamp, "", "", "", false).status).toBe("error");
    expect(checkEntry(null, "", "", "", false).status).toBe("empty");
  });

  it("warns about shadow forms that don't exist", () => {
    expect(checkEntry(mew, "1500", "", "", true).status).toBe("error");
    expect(checkEntry(machamp, "1500", "", "", true).status).toBe("ok");
  });
});
