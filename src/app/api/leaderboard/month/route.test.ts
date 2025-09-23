import { describe, it, expect, vi } from '@jest/globals'

describe('monthly leaderboard API (shape)', () => {
  it('has GET handler', async () => {
    const mod = await import('./route')
    expect(typeof mod.GET).toBe('function')
  })
})

