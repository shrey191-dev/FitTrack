// auth.js
// -----------------------------------------------------------------------------
// Thin wrapper around Firebase Auth. Sign-in only — there's no sign-up screen
// on purpose, since this app has exactly one trainer. Create that one account
// from the Firebase Console (Authentication → Users → Add user), not here.
//
// The localStorage fallback has no login gate: there's no shared backend to
// protect when data never leaves the browser, so watchAuth reports
// `required: false` and the router never shows the login screen.
// -----------------------------------------------------------------------------

import { auth, isFirebaseConfigured } from "./firebase.js";
import {
  onAuthStateChanged, signInWithEmailAndPassword, signOut,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

export function watchAuth(callback) {
  if (!isFirebaseConfigured) {
    callback({ required: false, user: null });
    return () => {};
  }
  return onAuthStateChanged(auth, (user) => callback({ required: true, user }));
}

export async function signIn(email, password) {
  await signInWithEmailAndPassword(auth, email, password);
}

export async function signOutUser() {
  await signOut(auth);
}
