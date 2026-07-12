const tauriInternals = window.__TAURI_INTERNALS__;

export function invokeDesktop(command, payload) {
  if (!tauriInternals?.invoke) {
    throw new Error("Tauri desktop runtime is unavailable");
  }
  return tauriInternals.invoke(command, payload);
}
