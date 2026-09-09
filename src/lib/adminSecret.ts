"use client";

/**
 * The admin secret lives in localStorage, which is external state. Reading it
 * through useSyncExternalStore (rather than an effect) keeps the server render
 * and the hydrated render consistent, and picks up changes made in other tabs.
 */

const KEY = "bharat-buzz-admin-secret";

let cached: string | null = null;
const listeners = new Set<() => void>();

function read(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return ""; // private mode, or storage blocked
  }
}

export function getAdminSecret(): string {
  if (cached === null) cached = read();
  return cached;
}

/** The server has no storage, so it always renders the locked state. */
export function getServerAdminSecret(): string {
  return "";
}

export function subscribeAdminSecret(onChange: () => void): () => void {
  listeners.add(onChange);

  const onStorage = (event: StorageEvent) => {
    if (event.key === KEY) {
      cached = read();
      onChange();
    }
  };
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export function setAdminSecret(value: string): void {
  cached = value;
  try {
    localStorage.setItem(KEY, value);
  } catch {
    // not fatal; the secret just will not survive a reload
  }
  for (const listener of listeners) listener();
}
