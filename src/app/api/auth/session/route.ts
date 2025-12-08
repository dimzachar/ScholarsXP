/**
 * @deprecated This route is deprecated. Privy handles session management.
 * Kept for backward compatibility during migration.
 * TODO: Remove after confirming all auth is migrated to Privy.
 */

import { NextRequest, NextResponse } from 'next/server'

const COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: [undefined, 'development'].includes(process.env.NODE_ENV) ? false : true,
  path: '/'
}

const ACCESS_TOKEN_FALLBACK_TTL = 60 * 60 // 1 hour
const REFRESH_TOKEN_TTL = 60 * 60 * 24 * 30 // 30 days

export async function POST(request: NextRequest) {
  let payload: {
    accessToken?: string
    refreshToken?: string | null
    expiresAt?: number | null
  }

  try {
    payload = await request.json()
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 })
  }

  const { accessToken, refreshToken, expiresAt } = payload

  if (!accessToken) {
    return NextResponse.json({ error: 'accessToken is required' }, { status: 400 })
  }

  const nowSeconds = Math.floor(Date.now() / 1000)
  const maxAge = expiresAt && expiresAt > nowSeconds
    ? expiresAt - nowSeconds
    : ACCESS_TOKEN_FALLBACK_TTL

  const response = NextResponse.json({ success: true })
  response.cookies.set({
    name: 'sb-access-token',
    value: accessToken,
    maxAge,
    ...COOKIE_BASE_OPTIONS
  })

  if (refreshToken) {
    response.cookies.set({
      name: 'sb-refresh-token',
      value: refreshToken,
      maxAge: REFRESH_TOKEN_TTL,
      ...COOKIE_BASE_OPTIONS
    })
  } else if (refreshToken === null) {
    response.cookies.set({
      name: 'sb-refresh-token',
      value: '',
      maxAge: 0,
      ...COOKIE_BASE_OPTIONS
    })
  }

  return response
}

export async function DELETE() {
  const response = NextResponse.json({ success: true })

  response.cookies.set({
    name: 'sb-access-token',
    value: '',
    maxAge: 0,
    ...COOKIE_BASE_OPTIONS
  })

  response.cookies.set({
    name: 'sb-refresh-token',
    value: '',
    maxAge: 0,
    ...COOKIE_BASE_OPTIONS
  })

  return response
}
