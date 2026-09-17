/**
 * Browser storage for a dev tuning: a two-level object whose saved leaves are
 * laid over the defaults, so a field added later still gets its default.
 */
export function loadStored<T extends object>(key: string, defaults: T): T {
  const fresh = structuredClone(defaults);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fresh;
    const saved = JSON.parse(raw) as Record<string, unknown>;
    return merge(fresh, saved) as T;
  } catch {
    return fresh;
  }
}

function merge(base: object, saved: Record<string, unknown>): object {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(base)) {
    const incoming = saved[key];
    if (incoming === undefined) continue;
    out[key] =
      value !== null && typeof value === "object" && incoming && typeof incoming === "object"
        ? merge(value, incoming as Record<string, unknown>)
        : incoming;
  }
  return out;
}

export function saveStored(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be unavailable; the tuning still applies for this session.
  }
}
