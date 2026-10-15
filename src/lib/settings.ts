// Per-trainer settings stored on their profile document (users/{uid}.settings).

import { useEffect, useState } from "react";
import { arrayRemove, arrayUnion, doc, onSnapshot, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "../auth/AuthProvider";

export type Settings = {
  /** Evolution families marked done on the Catch up page. */
  doneFamilies?: string[];
};

export function useSettings(): Settings | null {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings | null>(null);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(
      doc(db, "users", user.uid),
      (snap) => setSettings((snap.get("settings") as Settings | undefined) ?? {}),
      () => setSettings({}),
    );
  }, [user]);
  return settings;
}

export async function markFamilyDone(uid: string, family: string, done: boolean) {
  await setDoc(
    doc(db, "users", uid),
    { settings: { doneFamilies: done ? arrayUnion(family) : arrayRemove(family) } },
    { merge: true },
  );
}
