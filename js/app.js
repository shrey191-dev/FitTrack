// app.js
// -----------------------------------------------------------------------------
// Entry point + tiny hash router. Routes:
//   #/                 → dashboard
//   #/client/<id>      → client profile
// Hash routing needs no server config and works on Firebase Hosting as-is.
// -----------------------------------------------------------------------------

import { renderDashboard, renderProfile } from "./dashboard.js";

async function router() {
  const hash = location.hash || "#/";
  const clientMatch = hash.match(/^#\/client\/(.+)$/);

  try {
    if (clientMatch) {
      await renderProfile(decodeURIComponent(clientMatch[1]));
    } else {
      await renderDashboard();
    }
  } catch (err) {
    console.error("[FitTrack] Render error:", err);
    const offline = !navigator.onLine;
    document.getElementById("app").innerHTML = `
      <p class="empty">
        ${offline ? "You're offline — check your connection and try again." : "Something went wrong loading this screen. Check the console."}
        <br />
        <button class="btn btn-primary" id="retryBtn">Retry</button>
      </p>`;
    document.getElementById("retryBtn").addEventListener("click", router);
  }
}

window.addEventListener("hashchange", router);
window.addEventListener("DOMContentLoaded", router);
