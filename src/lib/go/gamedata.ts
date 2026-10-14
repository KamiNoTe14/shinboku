// Loads the Pokémon GO game data that ships with the site (public/data/gamedata.json).

import { useEffect, useState } from "react";

export type PokemonType =
  | "Normal" | "Fire" | "Water" | "Grass" | "Electric" | "Ice" | "Fighting" | "Poison" | "Ground"
  | "Flying" | "Psychic" | "Bug" | "Rock" | "Ghost" | "Dragon" | "Dark" | "Steel" | "Fairy";

export type Species = {
  id: string;
  name: string;
  dex: number;
  types: PokemonType[];
  atk: number;
  def: number;
  sta: number;
  fast: string[];
  charged: string[];
  family: string | null;
  /** PokeAPI image ID when it differs from the dex number (regional forms, megas). */
  img?: number;
  elite?: string[];
  legacy?: string[];
  parent?: string;
  evolutions?: string[];
  shadow?: boolean;
  mega?: boolean;
  unreleased?: boolean;
  buddyKm?: number;
  thirdMoveDust?: number;
  tags?: string[];
};

export type Move = {
  name: string;
  type: PokemonType;
  pvp: { power: number; energyGain?: number; turns?: number; energy?: number };
};

export type GameData = {
  source: string;
  sourceUpdated: string | null;
  species: Species[];
  moves: Record<string, Move>;
  byId: Map<string, Species>;
};

let cache: Promise<GameData> | null = null;

export function loadGameData(): Promise<GameData> {
  cache ??= fetch("/data/gamedata.json")
    .then((r) => {
      if (!r.ok) throw new Error(`Game data failed to load (HTTP ${r.status})`);
      return r.json();
    })
    .then((raw: Omit<GameData, "byId">) => ({
      ...raw,
      byId: new Map(raw.species.map((s) => [s.id, s])),
    }))
    .catch((err) => {
      cache = null; // let the next caller retry
      throw err;
    });
  return cache;
}

export function useGameData() {
  const [state, setState] = useState<{ data: GameData | null; error: string | null }>({
    data: null,
    error: null,
  });
  useEffect(() => {
    let live = true;
    loadGameData().then(
      (data) => live && setState({ data, error: null }),
      (err: Error) => live && setState({ data: null, error: err.message }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export const ALL_TYPES: PokemonType[] = [
  "Normal", "Fire", "Water", "Grass", "Electric", "Ice", "Fighting", "Poison", "Ground",
  "Flying", "Psychic", "Bug", "Rock", "Ghost", "Dragon", "Dark", "Steel", "Fairy",
];
