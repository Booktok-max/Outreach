/** Splits an array into fixed size batches (used for createMany / IN queries). */
export function chunk<T>(items: T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be greater than zero");
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

export function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

/** Removes null/empty values from a list of strings. */
export function compactStrings(items: Array<string | null | undefined>): string[] {
  const values: string[] = [];
  for (const item of items) {
    if (item === null || item === undefined) continue;
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;
    values.push(trimmed);
  }
  return values;
}
