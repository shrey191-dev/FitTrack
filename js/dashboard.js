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
import { MUSCLE_GROUPS, addWorkout, deleteWorkout } from "./workouts.js";
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
        <label>Photo <span class="optional">(optional)</span>
          <input name="photo" type="file" accept="image/*" />
        </label>
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

  let clients = await getClients();

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

    grid.innerHTML = list.map((c) => {
      const sessions = (c.workouts || []).length;
      return `
        <article class="card" data-id="${c.id}" tabindex="0" role="button"
                 aria-label="Open ${esc(c.name)}">
          <span class="card-bar goal-${goalSlug(c.goal)}"></span>
          ${avatarHtml(c, "card-avatar")}
          <h3 class="card-name">${esc(c.name)}</h3>
          <span class="chip goal-${goalSlug(c.goal)}">${esc(c.goal)}</span>
          <p class="card-sessions"><strong>${String(sessions).padStart(2, "0")}</strong> ${sessions === 1 ? "session" : "sessions"} logged</p>
        </article>`;
    }).join("");
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
    const photoFile = data.get("photo");
    const photo = photoFile && photoFile.size > 0 ? await fileToResizedDataUrl(photoFile) : null;
    const created = await addClient({ name, goal: data.get("goal"), photo });
    clients.push(created);
    form.reset();
    paint(searchInput.value);
    showToast(`${created.name} added`);
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
        <label>Photo <span class="optional">(optional)</span>
          ${client.photo ? `<img class="photo-preview" src="${client.photo}" alt="" />` : ""}
          <input name="photo" type="file" accept="image/*" />
        </label>
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
          <div class="tags">
            ${(w.groups || []).map((g) => `<span class="tag">${esc(g)}</span>`).join("") || `<span class="muted">No groups</span>`}
          </div>
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
    const saved = await addWorkout(id, {
      date: data.get("date"),
      groups,
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
    const header = "Date,Muscle Groups,Notes\n";
    const rows = workouts.map((w) => {
      const groups = (w.groups || []).join("; ");
      const notes = (w.notes || "").replace(/"/g, '""');
      return `"${w.date}","${groups}","${notes}"`;
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
  app.querySelector("#editClientBtn").addEventListener("click", () => editDialog.showModal());
  editForm.addEventListener("submit", async (e) => {
    if (e.submitter?.value !== "save") return;
    const data = new FormData(editForm);
    const name = data.get("name");
    if (!name.trim()) return;
    const patch = { name: name.trim(), goal: data.get("goal") };
    const photoFile = data.get("photo");
    if (photoFile && photoFile.size > 0) {
      patch.photo = await fileToResizedDataUrl(photoFile);
    }
    await updateClient(id, patch);
    await renderProfile(id);
    showToast("Changes saved");
  });
}
