import { describe, it, expect } from '@jest/globals'

describe('admin monthly preview API (shape)', () => {
  it('exports GET handler', async () => {
    const mod = await import('./route')
    expect(typeof mod.GET).toBe('function')
  })
})

