export function mergeByKey<T>(
  values: readonly T[],
  keyOf: (value: T) => string,
  merge: (current: T | undefined, candidate: T) => T
): T[] {
  const merged = new Map<string, T>()
  for (const value of values) {
    const key = keyOf(value)
    if (!key) continue
    merged.set(key, merge(merged.get(key), value))
  }
  return Array.from(merged.values())
}
