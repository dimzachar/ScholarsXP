/**
 * Shared distribution metrics used by both the historical simulator
 * and the live shadow monitor.
 */

/** Gini coefficient: 0 = perfectly equal, 1 = one entity gets everything. */
export function computeGini(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((s, v) => s + v, 0) / n
  if (mean === 0) return 0

  let sumAbsDiff = 0
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      sumAbsDiff += Math.abs(sorted[i] - sorted[j])
    }
  }
  return sumAbsDiff / (2 * n * n * mean)
}

/** Top-N share: what % of total picks went to the top N reviewers. */
export function topNShare(values: number[], n: number): number {
  const total = values.reduce((s, v) => s + v, 0)
  if (total === 0) return 0
  const sorted = [...values].sort((a, b) => b - a)
  const topSum = sorted.slice(0, n).reduce((s, v) => s + v, 0)
  return (topSum / total) * 100
}
