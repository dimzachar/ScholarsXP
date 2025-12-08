import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'

// Validate Movement/Aptos wallet address format (0x + 64 hex chars)
function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address)
}

// GET: Retrieve user's linked wallet
export const GET = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id

    const result = await prisma.$queryRaw<Array<{
      movementWalletAddress: string | null
      walletLinkedAt: Date | null
      privyUserId: string | null
    }>>`
      SELECT "movementWalletAddress", "walletLinkedAt", "privyUserId"
      FROM "User"
      WHERE id = ${userId}::uuid
    `

    if (!result || result.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const dbUser = result[0]
    return NextResponse.json({
      walletAddress: dbUser.movementWalletAddress,
      linkedAt: dbUser.walletLinkedAt,
      privyUserId: dbUser.privyUserId
    })
  } catch (error) {
    console.error('Failed to get wallet:', error)
    return NextResponse.json({ error: 'Failed to get wallet' }, { status: 500 })
  }
})

// POST: Save wallet address to user profile
export const POST = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id
    const body = await request.json()
    const { walletAddress } = body

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    if (!isValidWalletAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format. Expected 0x followed by 64 hex characters.' },
        { status: 400 }
      )
    }

    // Check if wallet is already linked to another user
    const existingUser = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "User"
      WHERE "movementWalletAddress" = ${walletAddress}
      AND id != ${userId}::uuid
    `

    if (existingUser && existingUser.length > 0) {
      return NextResponse.json(
        { error: 'This wallet is already linked to another account' },
        { status: 409 }
      )
    }

    await prisma.$executeRaw`
      UPDATE "User"
      SET "movementWalletAddress" = ${walletAddress},
          "walletLinkedAt" = NOW()
      WHERE id = ${userId}::uuid
    `

    return NextResponse.json({
      success: true,
      walletAddress,
      linkedAt: new Date().toISOString()
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to save wallet:', error)
    return NextResponse.json({ error: 'Failed to save wallet' }, { status: 500 })
  }
})

// DELETE: Unlink wallet from profile
export const DELETE = withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id

    await prisma.$executeRaw`
      UPDATE "User"
      SET "movementWalletAddress" = NULL,
          "walletLinkedAt" = NULL
      WHERE id = ${userId}::uuid
    `

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to unlink wallet:', error)
    return NextResponse.json({ error: 'Failed to unlink wallet' }, { status: 500 })
  }
})
