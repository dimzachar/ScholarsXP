export type ParthenonStanding = {
  rank: number
  userId: string
  points: number
}

export type ParthenonUser = {
  id: string
  username?: string | null
  discordId?: string | null
  discordHandle?: string | null
}

export type ParthenonRow = {
  rank: number
  userId: string
  username: string
  discordId: string
  discordHandle: string
  points: number
  s_max: number
  n: number
  p_pts: number
  parthenon_xp: number
}

export type ParthenonLeaderboard = {
  items: ParthenonRow[]
  sMax: number
  participantCount: number
}

const PARTHENON_BASE_POINTS = 1800
const TOP_SAMPLE_SIZE = 5
const PARTHENON_BONUS_TIERS = [2400, 2200, 2000] as const

export function buildParthenonLeaderboard(
  standings: ParthenonStanding[],
  userMap: Map<string, ParthenonUser>
): ParthenonLeaderboard {
  const participantCount = standings.length
  const sMax = calculateSMax(standings)
  const bonusByUserId = createBonusMap(standings, sMax)

  const items = standings.map((standing) => {
    const user = userMap.get(standing.userId)
    const discordHandle = sanitizeDiscordHandle(user?.discordHandle)
    const parthenonPoints = calculateParthenonPoints(standing.points, sMax)

    return {
      rank: standing.rank,
      userId: standing.userId,
      username: user?.username || discordHandle || standing.userId,
      discordId: user?.discordId || '',
      discordHandle,
      points: standing.points,
      s_max: sMax,
      n: participantCount,
      p_pts: parthenonPoints,
      parthenon_xp: bonusByUserId.get(standing.userId) ?? parthenonPoints,
    }
  })

  return {
    items,
    sMax,
    participantCount,
  }
}

export function sanitizeDiscordHandle(value?: string | null) {
  if (!value) return ''
  return value.endsWith('#0') ? value.slice(0, -2) : value
}

function calculateSMax(standings: ParthenonStanding[]) {
  if (!standings.length) return 0

  const topSlice = standings.slice(0, TOP_SAMPLE_SIZE)
  const total = topSlice.reduce((sum, standing) => sum + standing.points, 0)

  return roundMetric(total / topSlice.length)
}

function calculateParthenonPoints(points: number, sMax: number) {
  if (!sMax) return 0
  return roundMetric(PARTHENON_BASE_POINTS * (points / sMax))
}

function createBonusMap(standings: ParthenonStanding[], sMax: number) {
  const qualified = standings.filter((standing) => standing.points > sMax)
  const bonuses = new Map<string, number>()

  qualified.slice(0, PARTHENON_BONUS_TIERS.length).forEach((standing, index) => {
    bonuses.set(standing.userId, PARTHENON_BONUS_TIERS[index])
  })

  return bonuses
}

function roundMetric(value: number) {
  return Number(value.toFixed(2))
}
