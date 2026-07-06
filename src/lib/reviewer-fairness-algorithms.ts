/**
 * Shared algorithm metadata and implementations — the single source of truth
 * used by both the historical simulator AND the live shadow monitor.
 *
 * Extracted into its own module so client components (admin page) can import
 * the metadata without pulling in server-only dependencies (prisma, etc.).
 *
 * IMPORTANT: Both the simulator and shadow previously had their own diverging
 * O3 implementations (different band sizes, different randomization schemes).
 * All selection logic now lives here — if you change an algorithm, you change
 * it for both callers simultaneously.
 */

export type AlgorithmId =
  | 'baseline'
  | 'o1_fairness_seat'
  | 'o2_recent_penalty'
  | 'o3_band_randomize'
  | 'o3_weighted_seat3'
  | 'o4_cooldown'
  | 'o1_o5_combined'
  | 'a3_reassign_preference'
  | 'b3_load_bucket_random'
  | 'c3_weighted_load'
  | 'd3_dashboard_triggered'
  | 'o3_o5_a3_combined'
  | 'o3_o5soft_a3_combined'
  | 'o3_a3_combined'
  | 'o3_weighted_3a_combined'
  | 'o3_cooldown_3a_combined'
  | 'o3_a3_recent_penalty_cooldown'
  | 'o1_3a_combined'

export interface AlgorithmMeta {
  id: AlgorithmId
  label: string
  description: string
}

export const ALGORITHMS: AlgorithmMeta[] = [
  {
    id: 'baseline',
    label: 'Baseline (Current)',
    description: 'Deterministic top-N slice by load → reliability → XP'
  },
  {
    id: 'o1_fairness_seat',
    label: 'O1 — Fairness Seat',
    description: '2 core + 1 from low-recent pool with proven-bad filter'
  },
  {
    id: 'o2_recent_penalty',
    label: 'O2 — Recent Penalty',
    description: 'Recent assignment count (30d) as tie-break before XP'
  },
  {
    id: 'o3_band_randomize',
    label: 'O3 — Band Randomize',
    description: 'Seats from widening bands, submission-seeded random within bands'
  },
  {
    id: 'o3_weighted_seat3',
    label: 'O3 — Weighted Seat 3',
    description: 'Like O3, but seat 3+ biased toward reviewers with fewer recent assignments'
  },
  {
    id: 'o4_cooldown',
    label: 'O4 — Cooldown',
    description: 'Priority penalty after recent assignments (7d window, decays over 14d)'
  },
  {
    id: 'o1_o5_combined',
    label: 'O1 + O5 Combined',
    description: 'Fairness seat (O1) with proven-bad filter (O5: missedReviews<2, no penalties)'
  },
  {
    id: 'a3_reassign_preference',
    label: '3A — Reassign Preference',
    description: 'On reassignment, prefer underused reviewers in same load tier'
  },
  {
    id: 'b3_load_bucket_random',
    label: '3B — Load-Bucket Random',
    description: 'Randomize within same active-assignment bucket (hash-seeded)'
  },
  {
    id: 'c3_weighted_load',
    label: '3C — Weighted Active Load',
    description: 'Age-weighted active assignments (recent=heavier, older=lighter)'
  },
  {
    id: 'd3_dashboard_triggered',
    label: '3D — Dashboard-Triggered',
    description: 'Fairness seat activates only when eligible-without-assignments ≥ threshold'
  },
  {
    id: 'o3_a3_combined',
    label: 'O3 + 3A Combined',
    description: 'O3 for initial assignments + 3A for reassignment events'
  },
  {
    id: 'o3_weighted_3a_combined',
    label: 'O3 Weighted Seat 3 + 3A',
    description: 'O3 with recent-count-biased seat 3 for initial + 3A for reassignment'
  },
  {
    id: 'o3_cooldown_3a_combined',
    label: 'O3 Cooldown + 3A',
    description: 'O3 bands after a 7-day recent-assignment cooldown + 3A for reassignment'
  },
  {
    id: 'o3_a3_recent_penalty_cooldown',
    label: 'O3 + 3A + Recent Penalty Cooldown',
    description: 'O3 for initial assignments + 3A for reassignment while avoiding recently penalized reviewers'
  },
  {
    id: 'o1_3a_combined',
    label: 'O1 + 3A Combined',
    description: 'O1 fairness seat for initial + 3A underused-preference for reassignments'
  },
  {
    id: 'o3_o5_a3_combined',
    label: 'O3 + O5 + 3A Combined',
    description: 'O3 banded seats with proven-bad filter + 3A on reassign'
  },
  {
    id: 'o3_o5soft_a3_combined',
    label: 'O3 + O5 (rotation) + 3A',
    description: 'O3 + 3A with O5 strict filter 3/4 of the time, bypassed 1/4 (hash-rotated per submission)'
  }
]

// ---------------------------------------------------------------------------
// Shared candidate interface — minimum fields every algorithm needs.
// Both ReconstructedCandidate (simulator) and ShadowCandidate (live logging)
// must be assignable to this.
// ---------------------------------------------------------------------------

export interface FairnessCandidate {
  id: string
  activeAssignments: number
  reliabilityScore: number
  totalXp: number
  missedReviews: number
  hasPenalties: boolean
}

export interface SelectionOptions {
  minReviewers: number
  submissionId: string
  isReassignment?: boolean
  /** Assignment count in the last 30 days per reviewer. */
  recentCounts?: Map<string, number>
  /** Assignment count in the last 7 days per reviewer. */
  recent7dCounts?: Map<string, number>
  /** Age-decayed active load (3C). */
  weightedLoads?: Map<string, number>
  /** For 3D — whether to activate fairness seat. */
  triggerFairness?: boolean
  /** For recent-penalty cooldown reassignment guard. */
  recentPenaltyAt?: Map<string, Date>
  recentPenaltyCooldownDays?: number
  recentPenaltyCooldownAsOf?: Date
}

export type SelectionFn<T extends FairnessCandidate> = (
  pool: T[],
  options: SelectionOptions
) => T[]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Simple deterministic hash, used for submission-seeded randomization. */
export function hashCode(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const chr = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + chr
    hash |= 0
  }
  return Math.abs(hash)
}

/** O5 proven-bad filter: exclude reviewers with a track record of problems. */
export function passesProvenBadFilter(c: FairnessCandidate): boolean {
  return c.missedReviews < 2 && !c.hasPenalties
}

/** Baseline comparator: activeAssignments ASC → reliability DESC → XP DESC. */
function compareBaseline(a: FairnessCandidate, b: FairnessCandidate): number {
  if (a.activeAssignments !== b.activeAssignments) {
    return a.activeAssignments - b.activeAssignments
  }
  if (a.reliabilityScore !== b.reliabilityScore) {
    return b.reliabilityScore - a.reliabilityScore
  }
  return b.totalXp - a.totalXp
}

// ---------------------------------------------------------------------------
// Individual selectors
// ---------------------------------------------------------------------------

export function selectBaseline<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  return pool.slice(0, Math.min(options.minReviewers, pool.length))
}

/**
 * O1 — Fairness Seat: (N-1) core picks + 1 seat drawn from reviewers with a
 * low recent assignment count.
 *
 * The fairness seat is sorted by ascending recent count so the person with
 * the fewest recent assignments wins, with a submission-seeded tiebreaker to
 * rotate between reviewers who are equally underused. Without this rotation
 * the same reviewer would keep winning the fairness slot across submissions
 * (baseline ordering is stable) and O1 would collapse back toward a 3-person
 * core.
 *
 * Pure O1 does NOT apply the proven-bad filter — that's O5's job. Use
 * selectO1O5Combined to get both.
 */
export function selectO1FairnessSeat<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  return selectO1WithFilter(pool, options, false)
}

function selectO1WithFilter<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions,
  applyProvenBadFilter: boolean
): T[] {
  const { minReviewers: n, submissionId, recentCounts = new Map<string, number>() } = options

  if (pool.length === 0) return []

  const selected: T[] = []
  const coreCount = Math.max(1, n - 1)
  for (let i = 0; i < coreCount && i < pool.length; i++) {
    selected.push(pool[i])
  }

  const remaining = pool.filter(c => !selected.includes(c))

  const qualifying = remaining.filter(c => {
    const recent = recentCounts.get(c.id) ?? 0
    if (recent > 3) return false
    if (applyProvenBadFilter && !passesProvenBadFilter(c)) return false
    return true
  })

  const sortedFairness = [...qualifying].sort((a, b) => {
    const aRecent = recentCounts.get(a.id) ?? 0
    const bRecent = recentCounts.get(b.id) ?? 0
    if (aRecent !== bRecent) return aRecent - bRecent
    return hashCode(submissionId + a.id) - hashCode(submissionId + b.id)
  })

  const fairnessPick = sortedFairness[0] ?? remaining[0]
  if (fairnessPick) {
    selected.push(fairnessPick)
  }

  return [...new Set(selected)].slice(0, n)
}

/**
 * O2 — Recent Penalty: recent30d count inserted as tie-break between
 * standard ordering.
 */
export function selectO2RecentPenalty<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  const { minReviewers: n, recentCounts = new Map<string, number>() } = options
  const reSorted = [...pool].sort((a, b) => {
    const cmp = compareBaseline(a, b)
    if (cmp !== 0) return cmp
    const aRecent = recentCounts.get(a.id) ?? 0
    const bRecent = recentCounts.get(b.id) ?? 0
    return aRecent - bRecent
  })
  return reSorted.slice(0, n)
}

/**
 * O3 — Band Randomize.
 *
 * Band sizes per seat: 2 → 5 → remaining. Seat 3 is treated as the fairness
 * band and filters out proven-bad candidates before picking (reverts to full
 * band if filter leaves the band empty).
 *
 * Randomization is submission-seeded at the seat level: `hash(submissionId + 'seatN') % bandSize`.
 * This gives deterministic replay while varying the pick across submissions.
 *
 * Note: the doc calls for "top 2, top 4, fairness band" but the simulator
 * deliberately widened seat 2 to top 5 to catch active=1 reviewers when many
 * share active=0. Kept that widening — it was measured to produce better
 * distribution than the strict 2/4 split.
 */
export function selectO3BandRandomize<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  const { minReviewers: n, submissionId } = options
  const selected: T[] = []

  if (pool.length === 0) return selected

  // Seat 1: top 2 band.
  const band1 = pool.slice(0, Math.min(2, pool.length))
  selected.push(band1.length === 1 ? band1[0] : band1[hashCode(submissionId + 'seat1') % band1.length])
  if (n === 1) return selected

  // Seat 2: top 5 from remaining.
  const rem2 = pool.filter(c => !selected.includes(c))
  const band2 = rem2.slice(0, Math.min(5, rem2.length))
  if (band2.length > 0) {
    selected.push(band2[hashCode(submissionId + 'seat2') % band2.length])
  }
  if (n === 2) return selected

  // Seat 3+: fairness band, with proven-bad filter.
  for (let seat = 2; seat < n; seat++) {
    const remaining = pool.filter(c => !selected.includes(c))
    if (remaining.length === 0) break

    const filtered = remaining.filter(c => passesProvenBadFilter(c))
    const effectiveBand = filtered.length > 0 ? filtered : remaining
    selected.push(effectiveBand[hashCode(submissionId + `seat${seat + 1}`) % effectiveBand.length])
  }

  return selected
}

/**
 * O3 — Weighted Seat 3.
 *
 * Same as O3 for seats 1 and 2 (bands of 2 and 5, submission-seeded hash pick).
 * For seat 3+, instead of uniform hash selection across the fairness band,
 * prioritize candidates with FEWER recent assignments and use the hash only
 * as a tiebreaker. Keeps O3's throughput properties while leaning harder into
 * fairness at the seat that matters.
 */
export function selectO3WeightedSeat3<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  const { minReviewers: n, submissionId, recentCounts = new Map<string, number>() } = options
  const selected: T[] = []

  if (pool.length === 0) return selected

  // Seats 1 and 2: identical to O3.
  const band1 = pool.slice(0, Math.min(2, pool.length))
  selected.push(band1.length === 1 ? band1[0] : band1[hashCode(submissionId + 'seat1') % band1.length])
  if (n === 1) return selected

  const rem2 = pool.filter(c => !selected.includes(c))
  const band2 = rem2.slice(0, Math.min(5, rem2.length))
  if (band2.length > 0) {
    selected.push(band2[hashCode(submissionId + 'seat2') % band2.length])
  }
  if (n === 2) return selected

  // Seat 3+: recent-count-weighted pick from the proven-bad-filtered fairness band.
  for (let seat = 2; seat < n; seat++) {
    const remaining = pool.filter(c => !selected.includes(c))
    if (remaining.length === 0) break

    const filtered = remaining.filter(c => passesProvenBadFilter(c))
    const effectiveBand = filtered.length > 0 ? filtered : remaining

    const sorted = [...effectiveBand].sort((a, b) => {
      const aRecent = recentCounts.get(a.id) ?? 0
      const bRecent = recentCounts.get(b.id) ?? 0
      if (aRecent !== bRecent) return aRecent - bRecent
      return hashCode(submissionId + `seat${seat + 1}` + a.id) - hashCode(submissionId + `seat${seat + 1}` + b.id)
    })
    selected.push(sorted[0])
  }

  return selected
}

/**
 * O4 — Cooldown: priority penalty proportional to recent 7-day assignments.
 * Weight is 0.5 per recent assignment, added to the active-assignment tier.
 */
export function selectO4Cooldown<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  const { minReviewers: n, recent7dCounts = new Map<string, number>() } = options
  const reSorted = sortByRecent7dCooldown(pool, recent7dCounts)
  return reSorted.slice(0, n)
}

function sortByRecent7dCooldown<T extends FairnessCandidate>(
  pool: T[],
  recent7dCounts: Map<string, number>
): T[] {
  return [...pool].sort((a, b) => {
    const aCooldown = (recent7dCounts.get(a.id) ?? 0) * 0.5
    const bCooldown = (recent7dCounts.get(b.id) ?? 0) * 0.5
    const aEff = a.activeAssignments + aCooldown
    const bEff = b.activeAssignments + bCooldown

    if (aEff !== bEff) return aEff - bEff
    if (a.reliabilityScore !== b.reliabilityScore) return b.reliabilityScore - a.reliabilityScore
    return b.totalXp - a.totalXp
  })
}

/** O1+O5 — fairness seat with the proven-bad filter on top of O1's low-recent seat. */
export function selectO1O5Combined<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  return selectO1WithFilter(pool, options, true)
}

/**
 * 3A — Reassign Preference: on reassignment, prefer underused reviewers (fewer
 * recent assignments) within the same active-assignment tier. For initial
 * assignments, falls back to baseline.
 */
export function select3AReassignPreference<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  const { minReviewers, isReassignment, recentCounts = new Map<string, number>() } = options
  const n = Math.min(isReassignment ? 1 : minReviewers, pool.length)

  if (!isReassignment) {
    return pool.slice(0, n)
  }

  const reSorted = [...pool].sort((a, b) => {
    if (a.activeAssignments !== b.activeAssignments) return a.activeAssignments - b.activeAssignments
    const aRecent = recentCounts.get(a.id) ?? 0
    const bRecent = recentCounts.get(b.id) ?? 0
    if (aRecent !== bRecent) return aRecent - bRecent
    if (a.reliabilityScore !== b.reliabilityScore) return b.reliabilityScore - a.reliabilityScore
    return b.totalXp - a.totalXp
  })

  return reSorted.slice(0, n)
}

/** 3B — Load-Bucket Random: shuffle within each active-assignment bucket. */
export function selectB3LoadBucketRandom<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  const { minReviewers: n, submissionId } = options

  const buckets = new Map<number, T[]>()
  for (const c of pool) {
    const key = c.activeAssignments
    if (!buckets.has(key)) buckets.set(key, [])
    buckets.get(key)!.push(c)
  }

  const bucketKeys = Array.from(buckets.keys()).sort((a, b) => a - b)
  let flatPool: T[] = []
  for (const key of bucketKeys) {
    const shuffled = [...buckets.get(key)!].sort((a, b) => {
      return hashCode(submissionId + a.id + '3b') - hashCode(submissionId + b.id + '3b')
    })
    flatPool = flatPool.concat(shuffled)
  }

  return flatPool.slice(0, n)
}

/** 3C — Weighted Load: sort by age-decayed active load instead of raw count. */
export function selectC3WeightedLoad<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  const { minReviewers: n, weightedLoads = new Map<string, number>() } = options
  const reSorted = [...pool].sort((a, b) => {
    const aLoad = weightedLoads.get(a.id) ?? a.activeAssignments
    const bLoad = weightedLoads.get(b.id) ?? b.activeAssignments
    if (aLoad !== bLoad) return aLoad - bLoad
    if (a.reliabilityScore !== b.reliabilityScore) return b.reliabilityScore - a.reliabilityScore
    return b.totalXp - a.totalXp
  })
  return reSorted.slice(0, n)
}

/** 3D — Dashboard-Triggered: enable O1 fairness seat only when trigger fires. */
export function selectD3DashboardTriggered<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  if (options.triggerFairness) {
    return selectO1FairnessSeat(pool, options)
  }
  return pool.slice(0, options.minReviewers)
}

/** O3+3A: O3 for initial, 3A for reassignment. */
export function selectO3A3Combined<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  if (options.isReassignment) {
    return select3AReassignPreference(pool, options)
  }
  return selectO3BandRandomize(pool, options)
}

export const DEFAULT_REASSIGNMENT_PENALTY_COOLDOWN_DAYS = 14

/** O3 + 3A + Recent Penalty Cooldown: O3 for initial, 3A for reassignment with recent-penalty guard. */
export function selectO3A3RecentPenaltyCooldown<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  if (!options.isReassignment) {
    return selectO3BandRandomize(pool, options)
  }

  const cooldownDays = options.recentPenaltyCooldownDays ?? DEFAULT_REASSIGNMENT_PENALTY_COOLDOWN_DAYS
  const cooldownMs = cooldownDays * 24 * 60 * 60 * 1000
  const asOf = options.recentPenaltyCooldownAsOf ?? new Date()

  const cleanPool = pool.filter(candidate => {
    const lastPenaltyAt = options.recentPenaltyAt?.get(candidate.id)
    if (!lastPenaltyAt) return true
    return asOf.getTime() - lastPenaltyAt.getTime() > cooldownMs
  })

  const effectivePool = cleanPool.length >= options.minReviewers ? cleanPool : pool
  return select3AReassignPreference(effectivePool, options)
}

/** O3 Weighted Seat 3 + 3A: recent-weighted seat-3 O3 for initial, 3A for reassignment. */
export function selectO3Weighted3ACombined<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  if (options.isReassignment) {
    return select3AReassignPreference(pool, options)
  }
  return selectO3WeightedSeat3(pool, options)
}

/** O3 Cooldown + 3A: O3 initial bands after applying 7-day assignment cooldown, 3A for reassignment. */
export function selectO3Cooldown3ACombined<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  if (options.isReassignment) {
    return select3AReassignPreference(pool, options)
  }

  const cooldownOrderedPool = sortByRecent7dCooldown(
    pool,
    options.recent7dCounts ?? new Map<string, number>()
  )
  return selectO3BandRandomize(cooldownOrderedPool, options)
}

/** O1+3A: O1 fairness seat for initial, 3A for reassignment. */
export function selectO1A3Combined<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  if (options.isReassignment) {
    return select3AReassignPreference(pool, options)
  }
  return selectO1FairnessSeat(pool, options)
}

/**
 * O3+O5+3A: O5 proven-bad filter over the whole pool, then O3 for initial or
 * 3A for reassignment.
 */
export function selectO3O5A3Combined<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  const filtered = pool.filter(c => passesProvenBadFilter(c))
  const effectivePool = filtered.length >= options.minReviewers ? filtered : pool

  if (options.isReassignment) {
    return select3AReassignPreference(effectivePool, options)
  }
  return selectO3BandRandomize(effectivePool, options)
}

/**
 * O3 + O5 (graduated) + 3A.
 *
 * Same structure as O3+O5+3A but with a submission-seeded rotation that
 * bypasses the strict filter on 1 in 4 submissions. This guarantees the
 * "grey zone" reviewers (missedReviews=2 or any past penalty) eventually
 * get shots at review work without permanently disabling the filter.
 *
 * On strict events (3 of 4): apply `missedReviews < 2 && !hasPenalties`.
 * If the filtered pool is too small, fall back to unfiltered.
 *
 * On bypass events (1 of 4): use the unfiltered pool — the O5 filter
 * doesn't apply, so the 8 "slightly spotty" reviewers get a chance.
 *
 * Rotation is deterministic per submission via hash(submissionId), so
 * replays give identical results.
 */
export function selectO3O5SoftA3Combined<T extends FairnessCandidate>(
  pool: T[],
  options: SelectionOptions
): T[] {
  const bypassFilter = hashCode(options.submissionId + 'o5_rotation') % 4 === 0

  let effectivePool: T[]
  if (bypassFilter) {
    effectivePool = pool
  } else {
    const strict = pool.filter(c => c.missedReviews < 2 && !c.hasPenalties)
    effectivePool = strict.length >= options.minReviewers ? strict : pool
  }

  if (options.isReassignment) {
    return select3AReassignPreference(effectivePool, options)
  }
  return selectO3BandRandomize(effectivePool, options)
}

// ---------------------------------------------------------------------------
// Active algorithm singleton
// ---------------------------------------------------------------------------

/**
 * The currently active fairness algorithm for production reviewer selection.
 * Change this value and redeploy to switch algorithms.
 *
 * This lives here (not in reviewer-pool.ts) so client components like
 * the admin page can import it without pulling server-only dependencies.
 */
export function getActiveFairnessAlgorithm(): AlgorithmId {
  return 'o3_a3_combined'
}

// ---------------------------------------------------------------------------
// Dispatch table
// ---------------------------------------------------------------------------

export const SELECTORS: Record<AlgorithmId, SelectionFn<FairnessCandidate>> = {
  baseline: selectBaseline,
  o1_fairness_seat: selectO1FairnessSeat,
  o2_recent_penalty: selectO2RecentPenalty,
  o3_band_randomize: selectO3BandRandomize,
  o3_weighted_seat3: selectO3WeightedSeat3,
  o4_cooldown: selectO4Cooldown,
  o1_o5_combined: selectO1O5Combined,
  a3_reassign_preference: select3AReassignPreference,
  b3_load_bucket_random: selectB3LoadBucketRandom,
  c3_weighted_load: selectC3WeightedLoad,
  d3_dashboard_triggered: selectD3DashboardTriggered,
  o3_a3_combined: selectO3A3Combined,
  o3_weighted_3a_combined: selectO3Weighted3ACombined,
  o3_cooldown_3a_combined: selectO3Cooldown3ACombined,
  o3_a3_recent_penalty_cooldown: selectO3A3RecentPenaltyCooldown,
  o1_3a_combined: selectO1A3Combined,
  o3_o5_a3_combined: selectO3O5A3Combined,
  o3_o5soft_a3_combined: selectO3O5SoftA3Combined,
}

/** Run a named selector while preserving the caller's concrete candidate type. */
export function runSelector<T extends FairnessCandidate>(
  algoId: AlgorithmId,
  pool: T[],
  options: SelectionOptions
): T[] {
  const fn = SELECTORS[algoId] as unknown as SelectionFn<T> | undefined
  if (!fn) return selectBaseline(pool, options)
  return fn(pool, options)
}
