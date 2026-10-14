// Reading the signed-in trainer's bag. Each Pokémon lives at users/{uid}/pokemon/{id}
// and stores its species as the game data ID (e.g. "machamp", "rattata_alolan").

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "../auth/AuthProvider";

/** Species IDs the trainer has logged at least once. Null while loading or signed out. */
export function useOwnedSpecies(): Set<string> | null {
  const { user } = useAuth();
  const [owned, setOwned] = useState<Set<string> | null>(null);

  useEffect(() => {
    if (!user) {
      setOwned(null);
      return;
    }
    return onSnapshot(
      collection(db, "users", user.uid, "pokemon"),
      (snap) => setOwned(new Set(snap.docs.map((d) => d.get("species") as string))),
      () => setOwned(new Set()),
    );
  }, [user]);

  return owned;
}
