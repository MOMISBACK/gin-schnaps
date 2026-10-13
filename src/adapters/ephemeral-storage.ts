/**
 * OVE initializes preference reducers while importing its bundle. A browser may
 * deny localStorage (private/opaque origins). Keep these preferences in memory,
 * not in user storage. This does not store or autosave sequence documents.
 * Injected at build time into upstream localStorage access; no browser globals
 * or user storage are overwritten.
 */
const values = new Map<string, string>();
export const ginSchnapsEphemeralStorage: Storage = {
  get length() { return values.size; },
  clear() { values.clear(); },
  getItem(key: string) { return values.get(String(key)) ?? null; },
  key(index: number) { return Array.from(values.keys())[index] ?? null; },
  removeItem(key: string) { values.delete(String(key)); },
  setItem(key: string, value: string) { values.set(String(key), String(value)); }
};
