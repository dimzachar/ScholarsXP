import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withAPIOptimization } from '@/middleware/api-optimization'

// Validate Movement/Aptos wallet address format (0x + 64 hex chars)
function isValidWalletAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(address)
}

interface UserWalletRow {
  id: string
  userId: string
  address: string
  label: string | null
  type: string
  isPrimary: boolean
  linkedAt: Date
  createdAt: Date
  updatedAt: Date
}

// GET: Retrieve user's linked wallets
export const GET = withAPIOptimization(
  withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id

    const wallets = await prisma.$queryRaw<UserWalletRow[]>`
      SELECT * FROM "UserWallet"
      WHERE "userId" = ${userId}::uuid
      ORDER BY "isPrimary" DESC, "linkedAt" DESC
    `

    // Get legacy primary wallet for backward compatibility
    const user = await prisma.$queryRaw<Array<{ movementWalletAddress: string | null }>>`
      SELECT "movementWalletAddress" FROM "User" WHERE id = ${userId}::uuid
    `

    const primaryWalletRecord = wallets?.find(w => w.isPrimary)
    
    return NextResponse.json({
      wallets: wallets || [],
      primaryWallet: primaryWalletRecord?.address || user?.[0]?.movementWalletAddress || null,
      primaryWalletType: primaryWalletRecord?.type || null,
    })
  } catch (error) {
    console.error('Failed to get wallets:', error)
    return NextResponse.json({ error: 'Failed to get wallets' }, { status: 500 })
  }
  }),
  { rateLimitType: 'api', rateLimit: true, caching: false, compression: true, performanceMonitoring: true }
)

// POST: Link a new wallet
export const POST = withAPIOptimization(
  withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id
    const body = await request.json()
    const { walletAddress, label, type = 'EXTERNAL', isPrimary = false } = body

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    if (!isValidWalletAddress(walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address format. Expected 0x followed by 64 hex characters.' },
        { status: 400 }
      )
    }

    // Check if wallet is already linked to any user
    const existingWallet = await prisma.$queryRaw<UserWalletRow[]>`
      SELECT * FROM "UserWallet" WHERE "address" = ${walletAddress}
    `

    if (existingWallet && existingWallet.length > 0) {
      if (existingWallet[0].userId === userId) {
        return NextResponse.json(
          { error: 'This wallet is already linked to your account' },
          { status: 409 }
        )
      }
      return NextResponse.json(
        { error: 'This wallet is already linked to another account' },
        { status: 409 }
      )
    }

    // Check user's wallet count (limit to 5)
    const countResult = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) as count FROM "UserWallet" WHERE "userId" = ${userId}::uuid
    `
    const walletCount = Number(countResult[0]?.count || 0)

    if (walletCount >= 5) {
      return NextResponse.json(
        { error: 'Maximum of 5 wallets allowed per account' },
        { status: 400 }
      )
    }

    const shouldBePrimary = isPrimary || walletCount === 0
    const walletType = type === 'EMBEDDED' ? 'EMBEDDED' : 'EXTERNAL'

    // If setting as primary, unset other primary wallets
    if (shouldBePrimary) {
      await prisma.$executeRaw`
        UPDATE "UserWallet" SET "isPrimary" = false WHERE "userId" = ${userId}::uuid
      `
    }

    // Create the wallet
    const newWallet = await prisma.$queryRaw<UserWalletRow[]>`
      INSERT INTO "UserWallet" ("userId", "address", "label", "type", "isPrimary", "linkedAt", "createdAt", "updatedAt")
      VALUES (${userId}::uuid, ${walletAddress}, ${label || null}, ${walletType}::"WalletType", ${shouldBePrimary}, NOW(), NOW(), NOW())
      RETURNING *
    `

    // Update legacy User.movementWalletAddress if this is primary
    if (shouldBePrimary) {
      await prisma.$executeRaw`
        UPDATE "User" SET "movementWalletAddress" = ${walletAddress}, "walletLinkedAt" = NOW()
        WHERE id = ${userId}::uuid
      `
    }

    return NextResponse.json({
      success: true,
      wallet: newWallet[0]
    }, { status: 201 })
  } catch (error) {
    console.error('Failed to link wallet:', error)
    return NextResponse.json({ error: 'Failed to link wallet' }, { status: 500 })
  }
  }),
  { rateLimitType: 'strict', rateLimit: true, caching: false, compression: true, performanceMonitoring: true }
)

// DELETE: Unlink a wallet
export const DELETE = withAPIOptimization(
  withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('address')

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    // Find the wallet
    const wallets = await prisma.$queryRaw<UserWalletRow[]>`
      SELECT * FROM "UserWallet" WHERE "userId" = ${userId}::uuid AND "address" = ${walletAddress}
    `

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    const wallet = wallets[0]
    const wasPrimary = wallet.isPrimary

    // Delete the wallet
    await prisma.$executeRaw`
      DELETE FROM "UserWallet" WHERE id = ${wallet.id}::uuid
    `

    // If deleted wallet was primary, set another wallet as primary
    if (wasPrimary) {
      const nextWallet = await prisma.$queryRaw<UserWalletRow[]>`
        SELECT * FROM "UserWallet" WHERE "userId" = ${userId}::uuid ORDER BY "linkedAt" DESC LIMIT 1
      `

      if (nextWallet && nextWallet.length > 0) {
        await prisma.$executeRaw`
          UPDATE "UserWallet" SET "isPrimary" = true WHERE id = ${nextWallet[0].id}::uuid
        `
        await prisma.$executeRaw`
          UPDATE "User" SET "movementWalletAddress" = ${nextWallet[0].address} WHERE id = ${userId}::uuid
        `
      } else {
        // No wallets left, clear legacy field
        await prisma.$executeRaw`
          UPDATE "User" SET "movementWalletAddress" = NULL, "walletLinkedAt" = NULL WHERE id = ${userId}::uuid
        `
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to unlink wallet:', error)
    return NextResponse.json({ error: 'Failed to unlink wallet' }, { status: 500 })
  }
  }),
  { rateLimitType: 'strict', rateLimit: true, caching: false, compression: true, performanceMonitoring: true }
)

// PATCH: Update wallet (set primary, update label)
export const PATCH = withAPIOptimization(
  withPermission('authenticated')(async (request: AuthenticatedRequest) => {
  try {
    const userId = request.user.id
    const body = await request.json()
    const { walletAddress, label, isPrimary } = body

    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address is required' }, { status: 400 })
    }

    const wallets = await prisma.$queryRaw<UserWalletRow[]>`
      SELECT * FROM "UserWallet" WHERE "userId" = ${userId}::uuid AND "address" = ${walletAddress}
    `

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 })
    }

    const wallet = wallets[0]

    if (isPrimary === true) {
      console.log('[wallet PATCH] Setting primary wallet:', { userId, walletAddress })
      
      // Unset other primary wallets
      await prisma.$executeRaw`
        UPDATE "UserWallet" SET "isPrimary" = false WHERE "userId" = ${userId}::uuid AND id != ${wallet.id}::uuid
      `
      await prisma.$executeRaw`
        UPDATE "UserWallet" SET "isPrimary" = true, "updatedAt" = NOW() WHERE id = ${wallet.id}::uuid
      `
      // Update legacy field on User table
      const updateResult = await prisma.$executeRaw`
        UPDATE "User" SET "movementWalletAddress" = ${walletAddress}, "updatedAt" = NOW() WHERE id = ${userId}::uuid
      `
      console.log('[wallet PATCH] User.movementWalletAddress update result:', updateResult)
    }

    if (label !== undefined) {
      await prisma.$executeRaw`
        UPDATE "UserWallet" SET "label" = ${label || null}, "updatedAt" = NOW() WHERE id = ${wallet.id}::uuid
      `
    }

    const updatedWallet = await prisma.$queryRaw<UserWalletRow[]>`
      SELECT * FROM "UserWallet" WHERE id = ${wallet.id}::uuid
    `

    return NextResponse.json({ success: true, wallet: updatedWallet[0] })
  } catch (error) {
    console.error('Failed to update wallet:', error)
    return NextResponse.json({ error: 'Failed to update wallet' }, { status: 500 })
  }
  }),
  { rateLimitType: 'api', rateLimit: true, caching: false, compression: true, performanceMonitoring: true }
)
