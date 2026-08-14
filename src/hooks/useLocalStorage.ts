"use client";

/**
 * hooks/useLocalStorage.ts — SSR-safe localStorage hook
 *
 * Previously duplicated as manual useState + useEffect pairs in:
 * - src/app/page.tsx (dashboard cart)
 * - src/components/dashboard/sales-quotation-view.tsx (line items, history)
 *
 * SSR Safety:
 * - Initializes with `initialValue` during server render (no localStorage access)
 * - Reads from localStorage only after mount (inside useEffect)
 * - Writes to localStorage whenever state changes
 *
 * @example
 * const [cart, setCart] = useLocalStorage<CatalogItem[]>("dashboard_cart", []);
 */

import { useState, useEffect, type Dispatch, type SetStateAction } from "react";

/**
 * A drop-in replacement for useState that persists to localStorage.
 * Safe to use in Next.js App Router (no hydration mismatch).
 *
 * @param key          - The localStorage key
 * @param initialValue - Value to use when key is not set or during SSR
 * @returns [storedValue, setStoredValue] — same API as useState
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(initialValue);
  const [isHydrated, setIsHydrated] = useState(false);

  // Read from localStorage after mount (client-only)
  useEffect(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (item !== null) {
        setValue(JSON.parse(item) as T);
      }
    } catch (err) {
      // Silently ignore parse failures — bad data in localStorage is not fatal
      if (process.env.NODE_ENV === "development") {
        console.warn(`[useLocalStorage] Failed to read key "${key}":`, err);
      }
    }
    setIsHydrated(true);
  // Intentionally only run on mount. key is expected to be stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Write to localStorage whenever value changes, but ONLY after hydration
  useEffect(() => {
    if (!isHydrated) return; // Prevent overwriting with initialValue on mount
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[useLocalStorage] Failed to write key "${key}":`, err);
      }
    }
  }, [key, value, isHydrated]);

  return [value, setValue];
}
