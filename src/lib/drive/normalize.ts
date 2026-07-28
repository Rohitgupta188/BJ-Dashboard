export function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, "");
}

export function makeRowReader(raw: Record<string, unknown>) {
  const index = new Map<string, string>();
  for (const key of Object.keys(raw)) {
    index.set(normalizeKey(key), key);
  }

  return function get(...keys: string[]): string {
    for (const key of keys) {
      const originalKey = index.get(normalizeKey(key));
      if (originalKey !== undefined) {
        const val = raw[originalKey];
        if (val !== undefined && val !== null && String(val).trim() !== "") {
          return String(val).trim();
        }
      }
    }
    return "";
  };
}

export function normalizeHeaders(headers: unknown[]): string[] {
  return headers.map((h) => normalizeKey(String(h)));
}
