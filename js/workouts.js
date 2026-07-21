// workouts.js
// -----------------------------------------------------------------------------
// Workouts live as an array on the client document (per the schema), so these
// operations read the client, modify its `workouts` array, and save it back
// through the client repository. Keeping this separate from clients.js keeps
// the "what a workout is" logic in one place.
//
// Workout shape: { id, date: "YYYY-MM-DD", groups: [String], notes: String }
// -----------------------------------------------------------------------------

import { getClient, updateClient } from "./clients.js";

export const MUSCLE_GROUPS = [
  "Chest", "Triceps", "Back", "Biceps",
  "Shoulders", "Legs", "Abs", "CrossFit",
];

function newId() {
  return crypto.randomUUID();
}

// Sort newest date first for display.
function byDateDesc(a, b) {
  return b.date.localeCompare(a.date);
}

export async function addWorkout(clientId, { date, groups, notes }) {
  const client = await getClient(clientId);
  if (!client) throw new Error("Client not found");

  const workout = {
    id: newId(),
    date,
    groups,
    notes: (notes || "").trim(),
  };

  const workouts = [...(client.workouts || []), workout].sort(byDateDesc);
  await updateClient(clientId, { workouts });
  return workout;
}

export async function deleteWorkout(clientId, workoutId) {
  const client = await getClient(clientId);
  if (!client) return;

  const workouts = (client.workouts || []).filter((w) => w.id !== workoutId);
  await updateClient(clientId, { workouts });
}
