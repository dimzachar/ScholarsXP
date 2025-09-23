import { describe, it, expect } from '@jest/globals'
import { getCurrentMonthUTC, getMonthlyWinners, getMonthlyLeaderboard } from './leaderboard-service'

describe('leaderboard-service basics', () => {
  it('getCurrentMonthUTC returns YYYY-MM', () => {
    const m = getCurrentMonthUTC()
    expect(m).toMatch(/^\d{4}-\d{2}$/)
  })

  it('rejects invalid month format in getMonthlyWinners', async () => {
    await expect(getMonthlyWinners('2025/09' as any)).rejects.toBeTruthy()
  })

  it('rejects invalid month format in getMonthlyLeaderboard', async () => {
    await expect(getMonthlyLeaderboard('foo' as any)).rejects.toBeTruthy()
  })
})
