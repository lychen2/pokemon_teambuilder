const DEFAULT_DURATION = 3200;
const STACK_ID = "toast-stack";
const FADE_MS = 220;

function ensureStack() {
  let node = document.getElementById(STACK_ID);
  if (!node) {
    node = document.createElement("div");
    node.id = STACK_ID;
    node.className = "toast-stack";
    node.setAttribute("aria-live", "polite");
    document.body.appendChild(node);
  }
  return node;
}

export function toast(message, {type = "info", duration = DEFAULT_DURATION} = {}) {
  if (!message) return;
  const stack = ensureStack();
  const node = document.createElement("div");
  node.className = `toast toast-${type}`;
  node.setAttribute("role", type === "error" ? "alert" : "status");
  node.textContent = String(message);
  stack.appendChild(node);
  requestAnimationFrame(() => node.classList.add("toast-in"));
  window.setTimeout(() => {
    node.classList.remove("toast-in");
    node.classList.add("toast-out");
    window.setTimeout(() => node.remove(), FADE_MS);
  }, Math.max(1000, duration));
}
