// The trainer's bag.
//
// Storage layout: users/{uid}/bag/{0..7}, each document holding a map of Pokémon
// keyed by ID: { p: { [id]: Pokemon } }. Bundling keeps a 2,000-Pokémon bag to
// 8 document reads per visit instead of 2,000, which matters on Firebase's free
// plan (50,000 reads a day shared by everyone). Each Pokémon is written by field
// path (p.<id>), so edits to different Pokémon never overwrite each other.

import { useEffect, useMemo, useState } from "react";
import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteField,
  doc,
  onSnapshot,
  writeBatch,
  type FieldValue,
} from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "../auth/AuthProvider";

export const BAG_CHUNKS = 8;

export type Variant = "shadow" | "purified";

/** What the trainer entered about one Pokémon. */
export type PokemonInput = {
  species: string; // game data ID, e.g. "machamp" or "rattata_alolan"
  cp: number;
  hp?: number;
  iv?: [number, number, number]; // attack, defense, stamina appraisal (0-15 each)
  level?: number; // worked out from CP/HP/IVs when they agree on one level
  fast?: string; // move IDs
  charged?: string;
  charged2?: string;
  nickname?: string;
  shiny?: boolean;
  lucky?: boolean;
  variant?: Variant;
  favorite?: boolean;
  tags?: string[];
  caught?: string; // YYYY-MM-DD
};

export type BagPokemon = PokemonInput & { id: string; added: number };

function chunkOf(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return String(h % BAG_CHUNKS);
}

function newId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

/** Drop empty optional fields so the stored record stays small. */
function clean(p: PokemonInput): PokemonInput {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null || v === "" || v === false) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as PokemonInput;
}

const chunkRef = (uid: string, chunk: string) => doc(db, "users", uid, "bag", chunk);

/** Writes field-path updates grouped by bundle, creating bundles on first use. */
async function writeFields(uid: string, updates: { id: string; fields: Record<string, unknown> }[]) {
  const byChunk = new Map<string, Record<string, unknown>>();
  for (const { id, fields } of updates) {
    const c = chunkOf(id);
    const group = byChunk.get(c) ?? {};
    for (const [path, value] of Object.entries(fields)) group[path ? `p.${id}.${path}` : `p.${id}`] = value;
    byChunk.set(c, group);
  }
  const batch = writeBatch(db);
  for (const [c, fields] of byChunk) {
    const ref = chunkRef(uid, c);
    batch.set(ref, { p: {} }, { merge: true }); // no-op if the bundle exists
    batch.update(ref, fields);
  }
  await batch.commit();
}

export async function addPokemon(uid: string, input: PokemonInput): Promise<string> {
  const id = newId();
  await writeFields(uid, [{ id, fields: { "": { ...clean(input), added: Date.now() } } }]);
  return id;
}

export async function updatePokemon(uid: string, existing: BagPokemon, input: PokemonInput) {
  await writeFields(uid, [{ id: existing.id, fields: { "": { ...clean(input), added: existing.added } } }]);
}

export async function deletePokemon(uid: string, ids: string[]) {
  await writeFields(uid, ids.map((id) => ({ id, fields: { "": deleteField() } })));
}

export async function setFavorite(uid: string, ids: string[], favorite: boolean) {
  await writeFields(
    uid,
    ids.map((id) => ({ id, fields: { favorite: favorite ? true : deleteField() } })),
  );
}

export async function changeTag(uid: string, ids: string[], tag: string, add: boolean) {
  const op: FieldValue = add ? arrayUnion(tag) : arrayRemove(tag);
  await writeFields(uid, ids.map((id) => ({ id, fields: { tags: op } })));
}

/** Live view of the signed-in trainer's whole bag. */
export function useBag() {
  const { user } = useAuth();
  const [state, setState] = useState<{ pokemon: BagPokemon[]; loading: boolean; error: string | null }>({
    pokemon: [],
    loading: true,
    error: null,
  });

  useEffect(() => {
    if (!user) {
      setState({ pokemon: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      collection(db, "users", user.uid, "bag"),
      (snap) => {
        const pokemon: BagPokemon[] = [];
        for (const d of snap.docs) {
          const p = (d.get("p") ?? {}) as Record<string, Omit<BagPokemon, "id">>;
          for (const [id, data] of Object.entries(p)) pokemon.push({ ...data, id });
        }
        setState({ pokemon, loading: false, error: null });
      },
      (err) =>
        setState({
          pokemon: [],
          loading: false,
          error:
            err.code === "permission-denied"
              ? "Your bag couldn't be loaded because the database rules haven't been published yet."
              : `Your bag couldn't be loaded (${err.code}).`,
        }),
    );
  }, [user]);

  return state;
}

/** Species IDs the trainer has logged at least once. Null while loading or signed out. */
export function useOwnedSpecies(): Set<string> | null {
  const { user } = useAuth();
  const { pokemon, loading } = useBag();
  return useMemo(
    () => (!user || loading ? null : new Set(pokemon.map((p) => p.species))),
    [user, loading, pokemon],
  );
}
