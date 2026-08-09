/**
 * Pure comparison logic for the quality ratchet.
 *
 * The repository carries pre-existing formatting, lint, and dead-code debt.
 * Blanket `continue-on-error` made new regressions indistinguishable from that
 * debt. Instead we snapshot the existing findings and fail only when something
 * *new* appears, so the baseline can be burned down incrementally without
 * letting fresh problems merge.
 *
 * Kept free of I/O so it can be unit tested.
 */

/**
 * @typedef {Object} RatchetCheck
 * @property {string} name              Human-readable check name.
 * @property {Record<string, number>} findings  Finding key -> occurrence count.
 */

/**
 * @typedef {Object} RatchetResult
 * @property {string} name
 * @property {Array<{ key: string, baseline: number, current: number }>} regressions
 * @property {Array<{ key: string, baseline: number, current: number }>} improvements
 * @property {number} baselineTotal
 * @property {number} currentTotal
 */

/**
 * Compares one check's current findings against its baseline.
 *
 * A regression is a finding key that is new, or whose count grew. An
 * improvement is a key that disappeared or shrank.
 *
 * @param {Record<string, number>} baseline
 * @param {Record<string, number>} current
 * @param {string} name
 * @returns {RatchetResult}
 */
export function compareFindings(baseline, current, name) {
  const regressions = []
  const improvements = []

  for (const [key, currentCount] of Object.entries(current)) {
    const baselineCount = baseline[key] ?? 0
    if (currentCount > baselineCount) {
      regressions.push({ key, baseline: baselineCount, current: currentCount })
    } else if (currentCount < baselineCount) {
      improvements.push({ key, baseline: baselineCount, current: currentCount })
    }
  }

  for (const [key, baselineCount] of Object.entries(baseline)) {
    if (!(key in current)) {
      improvements.push({ key, baseline: baselineCount, current: 0 })
    }
  }

  const sum = (counts) => Object.values(counts).reduce((total, value) => total + value, 0)

  return {
    name,
    regressions: regressions.sort((a, b) => a.key.localeCompare(b.key)),
    improvements: improvements.sort((a, b) => a.key.localeCompare(b.key)),
    baselineTotal: sum(baseline),
    currentTotal: sum(current),
  }
}

/**
 * Turns a list of finding keys into a count map.
 *
 * @param {string[]} keys
 * @returns {Record<string, number>}
 */
export function tallyFindings(keys) {
  /** @type {Record<string, number>} */
  const findings = {}
  for (const key of keys) {
    findings[key] = (findings[key] ?? 0) + 1
  }
  return findings
}

/**
 * Renders a human-readable report and whether the ratchet should fail.
 *
 * @param {RatchetResult[]} results
 * @returns {{ ok: boolean, report: string }}
 */
export function formatRatchetReport(results) {
  const lines = []
  let ok = true

  for (const result of results) {
    const delta = result.currentTotal - result.baselineTotal
    const deltaLabel = delta === 0 ? 'no change' : delta > 0 ? `+${delta}` : String(delta)
    lines.push(
      `${result.name}: ${result.currentTotal} finding(s), baseline ${result.baselineTotal} (${deltaLabel})`
    )

    if (result.regressions.length > 0) {
      ok = false
      lines.push(`  NEW findings introduced by this change:`)
      for (const regression of result.regressions) {
        const suffix =
          regression.baseline === 0
            ? ''
            : ` (was ${regression.baseline}, now ${regression.current})`
        lines.push(`    - ${regression.key}${suffix}`)
      }
    }

    if (result.improvements.length > 0) {
      lines.push(
        `  ${result.improvements.length} baseline finding(s) fixed - run "bun run quality:baseline" to shrink the baseline.`
      )
    }
  }

  if (!ok) {
    lines.push('')
    lines.push(
      'Fix the findings above. Do not add them to the baseline: the baseline exists only for debt that predates this policy.'
    )
  }

  return { ok, report: lines.join('\n') }
}
