// The real game data, for tests that check results against published values.
import raw from "../../../public/data/gamedata.json";
import type { GameData, Species } from "./gamedata";

const base = raw as unknown as Omit<GameData, "byId">;
export const data: GameData = { ...base, byId: new Map(base.species.map((s) => [s.id, s])) };
export const sp = (id: string): Species => {
  const s = data.byId.get(id);
  if (!s) throw new Error(`No species ${id}`);
  return s;
};
