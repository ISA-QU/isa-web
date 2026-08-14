/**
 * Sorting helpers matching `DataFrame.sort_values(..., na_position="last")`,
 * where nulls sink to the bottom regardless of sort direction.
 */

type Key<T> = (row: T) => number | string | null;

function compareValues(
  a: number | string | null,
  b: number | string | null,
  ascending: boolean,
): number {
  const aMissing = a === null || (typeof a === "number" && Number.isNaN(a));
  const bMissing = b === null || (typeof b === "number" && Number.isNaN(b));
  if (aMissing && bMissing) return 0;
  if (aMissing) return 1; // na_position="last"
  if (bMissing) return -1;
  if (a === b) return 0;
  const order = a < b ? -1 : 1;
  return ascending ? order : -order;
}

/** Stable multi-key sort; returns a new array. */
export function sortBy<T>(
  rows: readonly T[],
  keys: readonly Key<T>[],
  ascending = false,
): T[] {
  return [...rows].sort((left, right) => {
    for (const key of keys) {
      const result = compareValues(key(left), key(right), ascending);
      if (result !== 0) return result;
    }
    return 0;
  });
}
