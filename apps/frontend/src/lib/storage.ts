/** JSON in this browser's storage; a private window or bad entry reads as null. */
export function readJson<T>(key: string): T | null {
  try {
    const saved = localStorage.getItem(key);
    return saved === null ? null : (JSON.parse(saved) as T);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not being able to save is not worth interrupting the user for.
  }
}

export function removeKey(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // As above.
  }
}
