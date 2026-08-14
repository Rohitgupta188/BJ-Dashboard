"use client";

/**
 * hooks/useDebounce.ts — Generic debounce hook
 *
 * Previously duplicated inline in:
 * - products-table-view.tsx (600ms delay)
 * - quotations-view.tsx (500ms delay)
 *
 * @example
 * const debouncedSearch = useDebounce(searchQuery, 500);
 *
 * useEffect(() => {
 *   fetchProducts(debouncedSearch);
 * }, [debouncedSearch]);
 */

import { useState, useEffect } from "react";

/**
 * Returns a debounced version of `value` that only updates after
 * `delay` milliseconds have passed without the value changing.
 *
 * @param value - The value to debounce
 * @param delay - Debounce delay in milliseconds
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => clearTimeout(timer);
  }, [value, delay]);

  return debouncedValue;
}
