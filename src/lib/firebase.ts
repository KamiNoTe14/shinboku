import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from "firebase/firestore";

// These values identify the Firebase project. They are meant to be public;
// access to data is controlled by the rules in firestore.rules, not by hiding them.
const firebaseConfig = {
  apiKey: "AIzaSyD3aIMD9RQlZRQE3HwcsgY45sROZmoFQlQ",
  authDomain: "shinboku-8843c.firebaseapp.com",
  projectId: "shinboku-8843c",
  storageBucket: "shinboku-8843c.firebasestorage.app",
  messagingSenderId: "129333419368",
  appId: "1:129333419368:web:1d92989a79925a18010add",
};

export const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// A local cache keeps a bag of ~2,000 Pokémon from being re-downloaded on every
// visit, which keeps us comfortably inside the free plan's daily read quota.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
