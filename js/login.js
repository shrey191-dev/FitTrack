// login.js
// -----------------------------------------------------------------------------
// The sign-in gate shown when Firebase Auth is required and no user is signed
// in. On success there's nothing else to do here — auth.js's onAuthStateChanged
// listener in app.js picks up the new session and re-routes automatically.
// -----------------------------------------------------------------------------

import { signIn } from "./auth.js";

const app = document.getElementById("app");

export function renderLogin() {
  app.innerHTML = `
    <div class="login-shell">
      <h1 class="brand">Fit<span>Track</span></h1>
      <form id="loginForm" class="login-form">
        <h2>Trainer sign in</h2>
        <label>Email
          <input name="email" type="email" required autocomplete="username" />
        </label>
        <label>Password
          <input name="password" type="password" required autocomplete="current-password" />
        </label>
        <p class="login-error" id="loginError" hidden></p>
        <button type="submit" class="btn btn-primary">Sign in</button>
      </form>
    </div>
  `;

  const form = app.querySelector("#loginForm");
  const errorEl = app.querySelector("#loginError");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorEl.hidden = true;
    const data = new FormData(form);
    const submitBtn = form.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await signIn(data.get("email"), data.get("password"));
    } catch (err) {
      errorEl.textContent = "Couldn't sign in — check your email and password.";
      errorEl.hidden = false;
      submitBtn.disabled = false;
    }
  });
}
