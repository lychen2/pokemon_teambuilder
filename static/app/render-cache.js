let lastHtmlByElement = new WeakMap();

export function setInnerHTMLIfChanged(target, html) {
  if (!target) {
    return false;
  }
  const next = typeof html === "string" ? html : String(html ?? "");
  if (lastHtmlByElement.get(target) === next) {
    return false;
  }
  target.innerHTML = next;
  lastHtmlByElement.set(target, next);
  return true;
}

export function invalidateRenderCache(target) {
  if (!target) {
    lastHtmlByElement = new WeakMap();
    return;
  }
  lastHtmlByElement.delete(target);
}

export function markRenderCache(target, html) {
  if (!target) {
    return;
  }
  lastHtmlByElement.set(target, typeof html === "string" ? html : String(html ?? ""));
}
