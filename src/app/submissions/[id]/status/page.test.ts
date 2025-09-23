import { describe, it, expect, jest, beforeEach } from '@jest/globals'

const createRedirectError = (url: string) => {
  const err = new Error(`REDIRECT:${url}`)
  err.name = 'NEXT_REDIRECT'
  return err
}

const createNotFoundError = () => {
  const err = new Error('NOT_FOUND')
  err.name = 'NEXT_NOT_FOUND'
  return err
}

const redirectMock = jest.fn((url: string) => {
  throw createRedirectError(url)
})
const notFoundMock = jest.fn(() => {
  throw createNotFoundError()
})
const cookiesMock = jest.fn()
const verifyAuthTokenMock = jest.fn()
const createAuthenticatedClientMock = jest.fn()

jest.mock('next/navigation', () => ({
  notFound: (...args: any[]) => notFoundMock(...args),
  redirect: (...args: any[]) => redirectMock(...args),
}))

jest.mock('next/headers', () => ({
  cookies: () => cookiesMock(),
}))

jest.mock('@/lib/auth-middleware', () => ({
  verifyAuthToken: (...args: any[]) => verifyAuthTokenMock(...args),
}))

jest.mock('@/lib/supabase-server', () => ({
  createAuthenticatedClient: (...args: any[]) => createAuthenticatedClientMock(...args),
}))

describe('submission status page access control', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    cookiesMock.mockReset()
    verifyAuthTokenMock.mockReset()
    createAuthenticatedClientMock.mockReset()
  })

  const loadPage = async () => {
    let mod: any
    await jest.isolateModulesAsync(async () => {
      mod = await import('./page')
    })
    return mod as { default: (args: any) => Promise<any> }
  }

  it('redirects to login when session cookie missing', async () => {
    cookiesMock.mockReturnValue({ get: () => undefined })

    const mod = await loadPage()

    await expect(mod.default({ params: { id: 'submission-1' } })).rejects.toThrow('REDIRECT:/login')
    expect(redirectMock).toHaveBeenCalledWith('/login')
    expect(verifyAuthTokenMock).not.toHaveBeenCalled()
    expect(createAuthenticatedClientMock).not.toHaveBeenCalled()
  })

  it('returns notFound for submissions owned by another user', async () => {
    cookiesMock.mockReturnValue({ get: () => ({ value: 'token-123' }) })

    verifyAuthTokenMock.mockResolvedValue({
      user: { id: 'user-1', role: 'USER' },
      error: null,
    })

    const submissionData = {
      id: 'submission-1',
      url: 'https://example.com',
      platform: 'Twitter',
      status: 'PENDING',
      taskTypes: [],
      aiXp: 0,
      finalXp: null,
      createdAt: new Date().toISOString(),
      user: { id: 'user-2', username: 'other', email: 'other@example.com' },
    }

    const single = jest.fn().mockResolvedValue({ data: submissionData, error: null })
    const eq = jest.fn().mockReturnValue({ single })
    const select = jest.fn().mockReturnValue({ eq })
    const from = jest.fn().mockReturnValue({ select })

    createAuthenticatedClientMock.mockReturnValue({ from })

    const mod = await loadPage()

    await expect(mod.default({ params: { id: 'submission-1' } })).rejects.toThrow('NOT_FOUND')

    expect(verifyAuthTokenMock).toHaveBeenCalledWith('token-123')
    expect(createAuthenticatedClientMock).toHaveBeenCalledWith('token-123')
    expect(from).toHaveBeenCalledWith('Submission')
    expect(notFoundMock).toHaveBeenCalledTimes(1)
    expect(redirectMock).not.toHaveBeenCalledWith('/login')
  })
})