import type { BagPokemon } from "./bag";
import type { GameData, Species } from "./go/gamedata";
import { ivPercent } from "./go/stats";

/** A bag Pokémon joined with its species data. */
export type Row = BagPokemon & { sp: Species; ivPct: number | null };

export function toRows(pokemon: BagPokemon[], data: GameData): Row[] {
  return pokemon.flatMap((p) => {
    const sp = data.byId.get(p.species);
    if (!sp) return [];
    return [{ ...p, sp, ivPct: p.iv ? ivPercent({ atk: p.iv[0], def: p.iv[1], sta: p.iv[2] }) : null }];
  });
}

export const toSearchable = (r: Row) => ({
  id: r.id,
  dex: r.sp.dex,
  cp: r.cp,
  hp: r.hp,
  shiny: r.shiny,
  lucky: r.lucky,
  variant: r.variant,
});
