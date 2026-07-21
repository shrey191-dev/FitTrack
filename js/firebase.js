// firebase.js
// -----------------------------------------------------------------------------
// Initializes Firebase and exposes a single Firestore instance to the rest of
// the app. If the config below still holds placeholder values, we DON'T init
// Firebase and `db` stays null — the data layer (clients.js) then falls back to
// localStorage so the app runs with zero setup. Paste your real web config and
// it switches to Firestore automatically. Nothing else in the app changes.
// -----------------------------------------------------------------------------

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// TODO: paste your Firebase web config here (Project settings → General → Your apps).
// The web config is NOT secret — it's fine to commit. Just don't commit service-account keys.
const firebaseConfig = {
  apiKey: "AIzaSyBO05Q-9ur4ALvZISCzi--OeKHjd0wma34",
  authDomain: "fittrack-543f0.firebaseapp.com",
  projectId: "fittrack-543f0",
  storageBucket: "fittrack-543f0.firebasestorage.app",
  messagingSenderId: "158863855445",
  appId: "1:158863855445:web:cf0a2d317aef2733d369dc",
  measurementId: "G-4M812FKGBS",
};

// Treat the config as "configured" only once the apiKey placeholder is replaced.
export const isFirebaseConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

let db = null;
let auth = null;
if (isFirebaseConfigured) {
  const app = initializeApp(firebaseConfig);
  // persistentMultipleTabManager lets offline caching work correctly even
  // with FitTrack open in more than one tab at once (plain single-tab
  // persistence silently disables itself for every tab but the first).
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  auth = getAuth(app);
  console.info("[FitTrack] Firestore connected.");
} else {
  console.info("[FitTrack] Firebase not configured — using localStorage.");
}

export { db, auth };
