interface ReviewerPriorityValues {
  activeAssignments?: number | null
  reliabilityScore?: number | null
  totalXp?: number | null
}

export function compareReviewerPriorityValues(
  a: ReviewerPriorityValues,
  b: ReviewerPriorityValues
): number {
  const aActiveAssignments = a.activeAssignments ?? 0
  const bActiveAssignments = b.activeAssignments ?? 0

  if (aActiveAssignments !== bActiveAssignments) {
    return aActiveAssignments - bActiveAssignments
  }

  const aReliabilityScore = a.reliabilityScore ?? 0
  const bReliabilityScore = b.reliabilityScore ?? 0

  if (aReliabilityScore !== bReliabilityScore) {
    return bReliabilityScore - aReliabilityScore
  }

  return (b.totalXp ?? 0) - (a.totalXp ?? 0)
}

export function formatReliabilityPercent(
  value?: number | null,
  fractionDigits = 2
): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return '-'
  }

  return `${(value * 100).toFixed(fractionDigits)}%`
}
