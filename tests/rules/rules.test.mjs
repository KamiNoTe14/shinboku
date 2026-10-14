// Tests for firestore.rules. Run from the repo root with: npm run test:rules
// (one-time setup: npm install --prefix tests/rules)
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, deleteDoc, serverTimestamp, collection, getDocs } from "firebase/firestore";

const rules = readFileSync(new URL("../../firestore.rules", import.meta.url), "utf8");
const env = await initializeTestEnvironment({
  projectId: "demo-shinboku",
  firestore: { rules, host: "127.0.0.1", port: 8080 },
});

const alice = env.authenticatedContext("alice").firestore();
const bob = env.authenticatedContext("bob").firestore();
const anon = env.unauthenticatedContext().firestore();

let pass = 0, fail = 0;
async function check(name, p) {
  try { await p; pass++; console.log("PASS", name); }
  catch (e) { fail++; console.log("FAIL", name, e.message); }
}

// Profiles
await check("alice creates own profile", assertSucceeds(setDoc(doc(alice, "users/alice"), { displayName: "Alice", createdAt: serverTimestamp() })));
await check("alice reads own profile", assertSucceeds(getDoc(doc(alice, "users/alice"))));
await check("bob cannot read alice profile", assertFails(getDoc(doc(bob, "users/alice"))));
await check("anon cannot read alice profile", assertFails(getDoc(doc(anon, "users/alice"))));
await check("bob cannot write alice profile", assertFails(setDoc(doc(bob, "users/alice"), { displayName: "pwned" })));
await check("profile rejects unknown fields", assertFails(setDoc(doc(alice, "users/alice"), { displayName: "A", isAdmin: true })));
await check("profile rejects huge name", assertFails(setDoc(doc(alice, "users/alice"), { displayName: "x".repeat(200) })));

// Bag (bundled into users/{uid}/bag/0..7)
const bundle = { p: { abc123: { species: "machamp", cp: 2500, added: 1 } } };
await check("alice writes a bag bundle", assertSucceeds(setDoc(doc(alice, "users/alice/bag/3"), bundle)));
await check("alice lists own bag", assertSucceeds(getDocs(collection(alice, "users/alice/bag"))));
await check("bob cannot list alice bag", assertFails(getDocs(collection(bob, "users/alice/bag"))));
await check("bob cannot write alice bag", assertFails(setDoc(doc(bob, "users/alice/bag/3"), bundle)));
await check("bob cannot delete alice bundle", assertFails(deleteDoc(doc(bob, "users/alice/bag/3"))));
await check("anon cannot read alice bag", assertFails(getDoc(doc(anon, "users/alice/bag/3"))));
await check("bundle id must be 0-7", assertFails(setDoc(doc(alice, "users/alice/bag/9"), bundle)));
await check("bundle rejects extra fields", assertFails(setDoc(doc(alice, "users/alice/bag/2"), { ...bundle, admin: true })));
await check("bundle requires a map", assertFails(setDoc(doc(alice, "users/alice/bag/2"), { p: "nope" })));
await check("alice deletes own bundle", assertSucceeds(deleteDoc(doc(alice, "users/alice/bag/3"))));

// Admins
await check("alice cannot make herself admin", assertFails(setDoc(doc(alice, "admins/alice"), { by: "me" })));
await check("alice can check own admin status", assertSucceeds(getDoc(doc(alice, "admins/alice"))));
await check("bob cannot read alice admin doc", assertFails(getDoc(doc(bob, "admins/alice"))));

// Everything else denied
await check("random collection denied", assertFails(setDoc(doc(alice, "anything/x"), { a: 1 })));
await check("anon cannot write anywhere", assertFails(setDoc(doc(anon, "users/anon"), { displayName: "x" })));

console.log(`\n${pass} passed, ${fail} failed`);
await env.cleanup();
process.exit(fail ? 1 : 0);
