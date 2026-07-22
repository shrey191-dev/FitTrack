// dashboard.js
// -----------------------------------------------------------------------------
// The view/controller layer. Renders the two screens (Dashboard + Client
// Profile) into #app and wires their events. It talks only to the repositories
// (clients.js / workouts.js), never to Firebase directly.
//
// Note on naming: this file owns BOTH views. It's kept as one "views" module
// rather than splitting per screen because the two screens are small and share
// helpers; split them out once either grows past a screenful.
// -----------------------------------------------------------------------------

import {
  GOALS, getClients, getClient, addClient, updateClient, deleteClient,
} from "./clients.js";
import { MUSCLE_GROUPS, CARDIO_TYPES, addWorkout, deleteWorkout } from "./workouts.js";
import { showToast } from "./toast.js";
import { isFirebaseConfigured } from "./firebase.js";
import { signOutUser } from "./auth.js";

const UNDO_WINDOW_MS = 5000;

const app = document.getElementById("app");

// --- small helpers -----------------------------------------------------------

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));

const goalSlug = (goal) => goal.toLowerCase().replace(/\s+/g, "-");

function formatDate(iso) {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function todayISO() {
  // toISOString() reports UTC, not local time — near midnight that silently
  // returns yesterday's date for anyone ahead of UTC, which then blocks
  // logging a session on the actual current day via the date input's max.
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function go(hash) {
  location.hash = hash;
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join("");
}

// The most recently dated session for a client, or null if they have none.
function getLatestWorkout(client) {
  const workouts = client.workouts || [];
  return workouts.length
    ? workouts.reduce((latest, w) => (w.date > latest.date ? w : latest))
    : null;
}

// "" (sorts last) if a client has no sessions — ISO date strings compare
// lexicographically, so this sorts correctly as plain text.
function latestActivity(client) {
  return getLatestWorkout(client)?.date || "";
}

function latestWorkoutTagsHtml(client) {
  const latest = getLatestWorkout(client);
  if (!latest) return `<span class="muted">No sessions yet</span>`;
  const tags = [
    ...(latest.groups || []).map((g) => `<span class="tag">${esc(g)}</span>`),
    ...(latest.cardio || []).map((c) => `<span class="tag tag-cardio">${esc(c)}</span>`),
  ].join("");
  return tags || `<span class="muted">No activity logged</span>`;
}

// Downscale + JPEG-compress so a photo fits comfortably under Firestore's 1MB
// document limit and stays cheap in localStorage too.
function fileToResizedDataUrl(file, maxDim = 240, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Could not read image"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function photoFieldHtml() {
  return `
    <div class="photo-field">
      <span class="field-label">Photo <span class="optional">(optional)</span></span>
      <div class="photo-drop" tabindex="0" role="button" aria-label="Upload photo, or drag one here">
        <div class="photo-drop-empty">Click or drop a photo</div>
        <img class="photo-drop-preview" alt="" hidden />
        <button type="button" class="photo-remove" hidden aria-label="Remove photo">✕</button>
      </div>
      <input name="photo" type="file" accept="image/*" hidden />
    </div>`;
}

// Wires up a photoFieldHtml() block: click-to-browse, drag-and-drop, an
// instant compressed preview, and a remove action. Returns the resolved
// photo (already compressed at selection time, not re-read at submit).
function wirePhotoField(container, initialPhoto = null) {
  const drop = container.querySelector(".photo-drop");
  const input = container.querySelector('input[name="photo"]');
  const empty = container.querySelector(".photo-drop-empty");
  const preview = container.querySelector(".photo-drop-preview");
  const removeBtn = container.querySelector(".photo-remove");

  let photo = initialPhoto;

  function showPreview(src) {
    preview.src = src;
    preview.hidden = false;
    empty.hidden = true;
    removeBtn.hidden = false;
  }
  function showEmpty() {
    preview.hidden = true;
    empty.hidden = false;
    removeBtn.hidden = true;
  }
  if (photo) showPreview(photo); else showEmpty();

  async function handleFile(file) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file");
      return;
    }
    try {
      photo = await fileToResizedDataUrl(file);
      showPreview(photo);
    } catch {
      showToast("Couldn't read that image");
    }
  }

  drop.addEventListener("click", () => input.click());
  drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); }
  });
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag-over"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag-over"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag-over");
    handleFile(e.dataTransfer.files[0]);
  });
  input.addEventListener("change", () => handleFile(input.files[0]));

  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    photo = null;
    input.value = "";
    showEmpty();
  });

  return {
    getPhoto: () => photo,
    reset: () => { photo = null; input.value = ""; showEmpty(); },
  };
}

function avatarHtml(client, cssClass) {
  return client.photo
    ? `<img class="${cssClass}" src="${client.photo}" alt="" />`
    : `<span class="${cssClass} ${cssClass}-fallback goal-${goalSlug(client.goal)}">${esc(initials(client.name))}</span>`;
}

// =============================================================================
// DASHBOARD
// =============================================================================

function skeletonCards(count) {
  return Array.from({ length: count }, () => `
    <div class="card skeleton-card">
      <div class="skeleton skeleton-line w-60"></div>
      <div class="skeleton skeleton-line w-40"></div>
    </div>`).join("");
}

export async function renderDashboard() {
  document.title = "FitTrack — Trainer client manager";

  app.innerHTML = `
    <header class="topbar">
      <h1 class="brand">Fit<span>Track</span></h1>
      <div class="topbar-actions">
        ${isFirebaseConfigured ? '<button class="btn btn-ghost" id="signOutBtn">Sign out</button>' : ""}
        <button class="btn btn-primary" id="addClientBtn">+ Add client</button>
      </div>
    </header>

    <div class="search">
      <input id="searchInput" type="search" placeholder="Search clients" autocomplete="off" />
    </div>

    <section id="clientGrid" class="grid" aria-live="polite">${skeletonCards(6)}</section>

    <dialog id="clientDialog" class="dialog">
      <form method="dialog" id="clientForm">
        <h2>New client</h2>
        <label>Name
          <input name="name" type="text" required maxlength="60" placeholder="e.g. Rahul" />
        </label>
        <label>Goal
          <select name="goal" required>
            ${GOALS.map((g) => `<option value="${g}">${g}</option>`).join("")}
          </select>
        </label>
        <label>Injuries <span class="optional">(optional)</span>
          <textarea name="injuries" rows="2" maxlength="200" placeholder="e.g. Lower back — avoid heavy deadlifts"></textarea>
        </label>
        ${photoFieldHtml()}
        <div class="dialog-actions">
          <button value="cancel" class="btn btn-ghost">Cancel</button>
          <button value="save" class="btn btn-primary">Add client</button>
        </div>
      </form>
    </dialog>
  `;

  const grid = app.querySelector("#clientGrid");
  const searchInput = app.querySelector("#searchInput");
  const dialog = app.querySelector("#clientDialog");
  const form = app.querySelector("#clientForm");
  const clientPhotoField = wirePhotoField(form);

  let clients = await getClients();
  clients.sort((a, b) => latestActivity(b).localeCompare(latestActivity(a)));

  function paint(filter = "") {
    const q = filter.trim().toLowerCase();
    const list = q
      ? clients.filter((c) => (c.name || "").toLowerCase().includes(q))
      : clients;

    if (clients.length === 0) {
      grid.innerHTML = `<p class="empty">No clients yet. Add your first one to get started.</p>`;
      return;
    }
    if (list.length === 0) {
      grid.innerHTML = `<p class="empty">No clients match “${esc(filter)}”.</p>`;
      return;
    }

    grid.innerHTML = list.map((c) => `
        <article class="card" data-id="${c.id}" tabindex="0" role="button"
                 aria-label="Open ${esc(c.name)}${c.injuries ? ", has injury notes" : ""}">
          <span class="card-bar goal-${goalSlug(c.goal)}"></span>
          ${avatarHtml(c, "card-avatar")}
          ${c.injuries ? `<span class="card-injury" title="${esc(c.injuries)}">!</span>` : ""}
          <h3 class="card-name">${esc(c.name)}</h3>
          <span class="chip goal-${goalSlug(c.goal)}">${esc(c.goal)}</span>
          <div class="card-latest">${latestWorkoutTagsHtml(c)}</div>
        </article>`).join("");
  }

  paint();

  // Search
  searchInput.addEventListener("input", (e) => paint(e.target.value));

  // Open a client
  grid.addEventListener("click", (e) => {
    const card = e.target.closest(".card");
    if (card) go(`#/client/${card.dataset.id}`);
  });
  grid.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      const card = e.target.closest(".card");
      if (card) { e.preventDefault(); go(`#/client/${card.dataset.id}`); }
    }
  });

  // Sign out
  if (isFirebaseConfigured) {
    app.querySelector("#signOutBtn").addEventListener("click", () => signOutUser());
  }

  // Add client
  app.querySelector("#addClientBtn").addEventListener("click", () => dialog.showModal());
  form.addEventListener("submit", async (e) => {
    // method="dialog" closes automatically; only act on "save".
    if (e.submitter?.value !== "save") return;
    const data = new FormData(form);
    const name = data.get("name");
    if (!name.trim()) return;
    await addClient({
      name, goal: data.get("goal"), photo: clientPhotoField.getPhoto(), injuries: data.get("injuries"),
    });
    location.reload();
  });
}

// =============================================================================
// CLIENT PROFILE
// =============================================================================

export async function renderProfile(id) {
  app.innerHTML = `
    <header class="topbar">
      <a class="back" href="#/">← Clients</a>
    </header>
    <section class="profile-head">
      <div class="skeleton skeleton-avatar"></div>
      <div class="skeleton skeleton-line w-40" style="height:28px;"></div>
      <div class="skeleton skeleton-line w-60" style="margin-top:10px;"></div>
    </section>`;
  const client = await getClient(id);

  if (!client) {
    document.title = "FitTrack";
    app.innerHTML = `
      <header class="topbar">
        <a class="back" href="#/">← Back</a>
      </header>
      <p class="empty">That client no longer exists.</p>`;
    return;
  }

  document.title = `${client.name} — FitTrack`;

  const workouts = [...(client.workouts || [])].sort((a, b) => b.date.localeCompare(a.date));

  app.innerHTML = `
    <header class="topbar">
      <a class="back" href="#/">← Clients</a>
      <div class="topbar-actions">
        <button class="btn btn-ghost" id="editClientBtn">Edit</button>
        <button class="btn btn-danger-ghost" id="deleteClientBtn">Delete client</button>
      </div>
    </header>

    <section class="profile-head">
      ${avatarHtml(client, "profile-avatar")}
      <h1 class="profile-name">${esc(client.name)}</h1>
      <span class="chip goal-${goalSlug(client.goal)}">${esc(client.goal)}</span>
      <p class="profile-count">${workouts.length} recorded ${workouts.length === 1 ? "session" : "sessions"}</p>
      ${client.injuries ? `<p class="profile-injury">! ${esc(client.injuries)}</p>` : ""}
    </section>

    <div class="section-head">
      <h2>Workout history</h2>
      <div class="section-actions">
        <button class="btn btn-ghost" id="exportBtn">Export CSV</button>
        <button class="btn btn-primary" id="addWorkoutBtn">+ Log session</button>
      </div>
    </div>

    <section id="history" class="history"></section>

    <dialog id="workoutDialog" class="dialog">
      <form method="dialog" id="workoutForm">
        <h2>Log session</h2>
        <label>Date
          <input name="date" type="date" required value="${todayISO()}" max="${todayISO()}" />
        </label>
        <fieldset class="groups">
          <legend>Muscle groups trained</legend>
          <div class="group-grid">
            ${MUSCLE_GROUPS.map((g) => `
              <label class="checktag">
                <input type="checkbox" name="groups" value="${g}" />
                <span>${g}</span>
              </label>`).join("")}
          </div>
        </fieldset>
        <fieldset class="groups groups-cardio">
          <legend>Cardio <span class="optional">(optional)</span></legend>
          <div class="group-grid">
            ${CARDIO_TYPES.map((c) => `
              <label class="checktag checktag-cardio">
                <input type="checkbox" name="cardio" value="${c}" />
                <span>${c}</span>
              </label>`).join("")}
          </div>
        </fieldset>
        <label>Notes <span class="optional">(optional)</span>
          <textarea name="notes" rows="2" maxlength="280" placeholder="How did it go?"></textarea>
        </label>
        <div class="dialog-actions">
          <button value="cancel" class="btn btn-ghost">Cancel</button>
          <button value="save" class="btn btn-primary">Save session</button>
        </div>
      </form>
    </dialog>

    <dialog id="editDialog" class="dialog">
      <form method="dialog" id="editForm">
        <h2>Edit client</h2>
        <label>Name
          <input name="name" type="text" required maxlength="60" value="${esc(client.name)}" />
        </label>
        <label>Goal
          <select name="goal" required>
            ${GOALS.map((g) => `<option value="${g}" ${g === client.goal ? "selected" : ""}>${g}</option>`).join("")}
          </select>
        </label>
        <label>Injuries <span class="optional">(optional)</span>
          <textarea name="injuries" rows="2" maxlength="200" placeholder="e.g. Lower back — avoid heavy deadlifts">${esc(client.injuries || "")}</textarea>
        </label>
        ${photoFieldHtml()}
        <div class="dialog-actions">
          <button value="cancel" class="btn btn-ghost">Cancel</button>
          <button value="save" class="btn btn-primary">Save changes</button>
        </div>
      </form>
    </dialog>
  `;

  const history = app.querySelector("#history");
  const dialog = app.querySelector("#workoutDialog");
  const form = app.querySelector("#workoutForm");
  const countEl = app.querySelector(".profile-count");

  function paintHistory() {
    countEl.textContent =
      `${workouts.length} recorded ${workouts.length === 1 ? "session" : "sessions"}`;
    if (workouts.length === 0) {
      history.innerHTML = `<p class="empty">No sessions logged yet.</p>`;
      return;
    }
    history.innerHTML = workouts.map((w) => `
      <article class="entry" data-id="${w.id}">
        <div class="entry-date">${formatDate(w.date)}</div>
        <div class="entry-body">
          ${(w.groups || []).length ? `<div class="tags">${w.groups.map((g) => `<span class="tag">${esc(g)}</span>`).join("")}</div>` : ""}
          ${(w.cardio || []).length ? `<div class="tags tags-cardio">${w.cardio.map((c) => `<span class="tag tag-cardio">${esc(c)}</span>`).join("")}</div>` : ""}
          ${!(w.groups || []).length && !(w.cardio || []).length ? `<span class="muted">No activity logged</span>` : ""}
          ${w.notes ? `<p class="entry-notes">${esc(w.notes)}</p>` : ""}
        </div>
        <button class="entry-del" data-id="${w.id}" aria-label="Delete session">✕</button>
      </article>`).join("");
  }

  paintHistory();

  // Add workout
  app.querySelector("#addWorkoutBtn").addEventListener("click", () => dialog.showModal());
  form.addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "save") return;
    const data = new FormData(form);
    const groups = data.getAll("groups");
    const cardio = data.getAll("cardio");
    const saved = await addWorkout(id, {
      date: data.get("date"),
      groups,
      cardio,
      notes: data.get("notes"),
    });
    workouts.push(saved);
    workouts.sort((a, b) => b.date.localeCompare(a.date));
    form.reset();
    paintHistory();
    showToast("Session logged");
  });

  // Export CSV
  app.querySelector("#exportBtn").addEventListener("click", () => {
    const header = "Date,Muscle Groups,Cardio,Notes\n";
    const rows = workouts.map((w) => {
      const groups = (w.groups || []).join("; ");
      const cardio = (w.cardio || []).join("; ");
      const notes = (w.notes || "").replace(/"/g, '""');
      return `"${w.date}","${groups}","${cardio}","${notes}"`;
    });
    const blob = new Blob([header + rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${client.name.replace(/\s+/g, "_")}_sessions.csv`;
    a.click();
    URL.revokeObjectURL(url);
  });

  // Delete workout — optimistic, with a few seconds to undo before it's final.
  history.addEventListener("click", (e) => {
    const btn = e.target.closest(".entry-del");
    if (!btn) return;
    const wid = btn.dataset.id;
    const idx = workouts.findIndex((w) => w.id === wid);
    if (idx === -1) return;

    const [removed] = workouts.splice(idx, 1);
    paintHistory();

    const timer = setTimeout(() => deleteWorkout(id, wid), UNDO_WINDOW_MS);
    showToast("Session deleted", {
      actionLabel: "Undo",
      duration: UNDO_WINDOW_MS,
      onAction: () => {
        clearTimeout(timer);
        workouts.splice(idx, 0, removed);
        workouts.sort((a, b) => b.date.localeCompare(a.date));
        paintHistory();
      },
    });
  });

  // Delete client — optimistic, with a few seconds to undo before it's final.
  app.querySelector("#deleteClientBtn").addEventListener("click", () => {
    const timer = setTimeout(() => deleteClient(id), UNDO_WINDOW_MS);
    showToast(`${client.name} deleted`, {
      actionLabel: "Undo",
      duration: UNDO_WINDOW_MS,
      onAction: () => clearTimeout(timer),
    });
    go("#/");
  });

  // Edit client
  const editDialog = app.querySelector("#editDialog");
  const editForm = app.querySelector("#editForm");
  const editPhotoField = wirePhotoField(editForm, client.photo);
  app.querySelector("#editClientBtn").addEventListener("click", () => editDialog.showModal());
  editForm.addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "save") return;
    const data = new FormData(editForm);
    const name = data.get("name");
    if (!name.trim()) return;
    const patch = {
      name: name.trim(),
      goal: data.get("goal"),
      photo: editPhotoField.getPhoto(),
      injuries: data.get("injuries").trim() || null,
    };
    await updateClient(id, patch);
    await renderProfile(id);
    showToast("Changes saved");
  });
}
