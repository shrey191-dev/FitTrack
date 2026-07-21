// app.js
// -----------------------------------------------------------------------------
// Entry point + tiny hash router. Routes:
//   #/                 → dashboard
//   #/client/<id>      → client profile
// Hash routing needs no server config and works on Firebase Hosting as-is.
//
// Auth gate: watchAuth reports whether a login is required at all (only true
// once Firebase is configured) and the current user. Every reactive auth
// change re-runs the router, so signing in/out immediately shows the right
// screen with no manual redirect.
// -----------------------------------------------------------------------------

import { renderDashboard, renderProfile } from "./dashboard.js";
import { watchAuth } from "./auth.js";
import { renderLogin } from "./login.js";

let authState = { required: false, user: null };

async function router() {
  if (authState.required && !authState.user) {
    renderLogin();
    return;
  }

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
watchAuth((state) => {
  authState = state;
  router();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js")
      .catch((err) => console.warn("[FitTrack] Service worker registration failed:", err));
  });
}
