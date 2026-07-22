// clients.js
// -----------------------------------------------------------------------------
// The client repository. This is the ONLY module that knows where data lives.
// Every function returns/accepts plain objects, so the UI never touches Firebase
// or localStorage directly. Swap the backend here and nothing else needs to know.
//
// Client shape:
//   { id, name, goal, photo: dataUrl|null, injuries: string|null,
//     startDate: "YYYY-MM-DD"|null, endDate: "YYYY-MM-DD"|null,
//     workouts: [ { id, date, groups: [], notes } ] }
// -----------------------------------------------------------------------------

import { db, isFirebaseConfigured } from "./firebase.js";
import {
  collection, getDocs, doc, getDoc, addDoc, updateDoc, deleteDoc,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const COLLECTION = "clients";
const LS_KEY = "fittrack.clients";

export const GOALS = ["Muscle Gain", "Fat Loss", "Strength", "General Fitness"];

// --- localStorage helpers (fallback backend) --------------------------------

function lsReadAll() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY)) || [];
  } catch {
    return [];
  }
}

function lsWriteAll(clients) {
  localStorage.setItem(LS_KEY, JSON.stringify(clients));
}

function newId() {
  return crypto.randomUUID();
}

// --- Public API --------------------------------------------------------------

// Return every client, newest activity first isn't tracked yet, so keep insertion order.
const CLIENT_DEFAULTS = {
  workouts: [], photo: null, injuries: null, startDate: null, endDate: null,
};

export async function getClients() {
  if (isFirebaseConfigured) {
    const snap = await getDocs(collection(db, COLLECTION));
    return snap.docs.map((d) => ({ id: d.id, ...CLIENT_DEFAULTS, ...d.data() }));
  }
  return lsReadAll();
}

export async function getClient(id) {
  if (isFirebaseConfigured) {
    const snap = await getDoc(doc(db, COLLECTION, id));
    return snap.exists() ? { id: snap.id, ...CLIENT_DEFAULTS, ...snap.data() } : null;
  }
  return lsReadAll().find((c) => c.id === id) || null;
}

export async function addClient({ name, goal, photo, injuries, startDate, endDate }) {
  const client = {
    name: name.trim(),
    goal,
    photo: photo || null,
    injuries: (injuries || "").trim() || null,
    startDate: startDate || null,
    endDate: endDate || null,
    workouts: [],
  };

  if (isFirebaseConfigured) {
    const ref = await addDoc(collection(db, COLLECTION), client);
    return { id: ref.id, ...client };
  }

  const clients = lsReadAll();
  const created = { id: newId(), ...client };
  clients.push(created);
  lsWriteAll(clients);
  return created;
}

// Used by workouts.js to persist an updated workouts array (or any field).
export async function updateClient(id, patch) {
  if (isFirebaseConfigured) {
    await updateDoc(doc(db, COLLECTION, id), patch);
    return;
  }
  const clients = lsReadAll();
  const idx = clients.findIndex((c) => c.id === id);
  if (idx === -1) return;
  clients[idx] = { ...clients[idx], ...patch };
  lsWriteAll(clients);
}

export async function deleteClient(id) {
  if (isFirebaseConfigured) {
    await deleteDoc(doc(db, COLLECTION, id));
    return;
  }
  lsWriteAll(lsReadAll().filter((c) => c.id !== id));
}
