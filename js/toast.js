// toast.js
// -----------------------------------------------------------------------------
// Minimal toast/snackbar utility. Injects its own stack into <body> on first
// use, so it survives #app being re-rendered by the router. Supports an
// optional action button (used for "Undo" on deletes).
// -----------------------------------------------------------------------------

let stack = null;

function ensureStack() {
  if (stack) return stack;
  stack = document.createElement("div");
  stack.className = "toast-stack";
  stack.setAttribute("aria-live", "polite");
  document.body.appendChild(stack);
  return stack;
}

export function showToast(message, { actionLabel, onAction, duration = 4000 } = {}) {
  const el = document.createElement("div");
  el.className = "toast";

  const text = document.createElement("span");
  text.className = "toast-text";
  text.textContent = message;
  el.appendChild(text);

  const dismiss = () => {
    el.classList.add("toast-out");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
  };

  if (actionLabel && onAction) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "toast-action";
    btn.textContent = actionLabel;
    btn.addEventListener("click", () => {
      onAction();
      dismiss();
    });
    el.appendChild(btn);
  }

  ensureStack().appendChild(el);
  setTimeout(dismiss, duration);
}
