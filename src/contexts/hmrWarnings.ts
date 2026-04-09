const warnedDuringHmr = new Set<string>()

export function warnOnceDuringHmr(key: string, message: string): void {
  if (!import.meta.hot) return
  if (import.meta.env.MODE === 'test') return
  if (warnedDuringHmr.has(key)) return

  warnedDuringHmr.add(key)
  console.warn(message)
}
