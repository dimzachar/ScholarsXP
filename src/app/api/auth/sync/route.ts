import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface SyncUserRequest {
  privyUserId: string
  discordUsername?: string | null
  discordId?: string | null
  discordAvatar?: string | null
  movementWalletAddress?: string | null
  email?: string | null
}

/**
 * Fetch Discord user avatar from Discord API
 * Returns the avatar URL or a default avatar if not available
 */
async function fetchDiscordAvatar(discordId: string): Promise<string | null> {
  // If we have a Discord bot token, try to fetch the real avatar
  if (process.env.DISCORD_BOT_TOKEN) {
    try {
      const response = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
      })
      
      if (response.ok) {
        const userData = await response.json()
        
        if (userData.avatar) {
          // Construct avatar URL from Discord CDN
          const extension = userData.avatar.startsWith('a_') ? 'gif' : 'png'
          return `https://cdn.discordapp.com/avatars/${discordId}/${userData.avatar}.${extension}`
        }
      }
    } catch (error) {
      console.error('Error fetching Discord avatar:', error)
    }
  }
  
  // Fallback: Use Discord's default avatar based on user ID
  // Discord has 6 default avatars (0-5), selected by (user_id >> 22) % 6 for new system
  // or user_id % 5 for legacy discriminator system
  const defaultAvatarIndex = (BigInt(discordId) >> BigInt(22)) % BigInt(6)
  return `https://cdn.discordapp.com/embed/avatars/${defaultAvatarIndex}.png`
}

/**
 * POST /api/auth/sync
 * Syncs Privy user data to Supabase/Prisma
 * Creates or updates User record with Privy identity fields
 */
export async function POST(request: NextRequest) {
  try {
    const body: SyncUserRequest = await request.json()
    
    // If no avatar provided but we have a Discord ID, try to fetch it or use default
    let discordAvatar = body.discordAvatar
    if (!discordAvatar && body.discordId) {
      discordAvatar = await fetchDiscordAvatar(body.discordId)
    }
    
    // Validate required fields
    if (!body.privyUserId) {
      return NextResponse.json(
        { error: 'privyUserId is required' },
        { status: 400 }
      )
    }
    
    // Validate Privy user ID format (did:privy:...)
    if (!body.privyUserId.startsWith('did:privy:')) {
      return NextResponse.json(
        { error: 'Invalid privyUserId format' },
        { status: 400 }
      )
    }
    
    // Check if user exists by privyUserId
    let user = await prisma.user.findUnique({
      where: { privyUserId: body.privyUserId },
    })
    
    const now = new Date()
    let created = false
    
    // If no user found by privyUserId, check if user exists by discordId
    // This handles migration from old Supabase auth to Privy
    if (!user && body.discordId) {
      const existingDiscordUser = await prisma.user.findUnique({
        where: { discordId: body.discordId },
      })
      
      if (existingDiscordUser) {
        // Link existing Discord user to Privy
        user = await prisma.user.update({
          where: { discordId: body.discordId },
          data: {
            privyUserId: body.privyUserId,
            discordHandle: body.discordUsername || existingDiscordUser.discordHandle,
            discordAvatarUrl: discordAvatar || existingDiscordUser.discordAvatarUrl,
            updatedAt: now,
          },
        })
        return NextResponse.json({ user, created: false, linked: true })
      }
    }
    
    if (user) {
      // Update existing user
      const updateData: Record<string, unknown> = {
        updatedAt: now,
      }
      
      // Update Discord info if provided
      if (body.discordUsername !== undefined) {
        updateData.discordHandle = body.discordUsername
      }
      if (body.discordId !== undefined) {
        updateData.discordId = body.discordId
      }
      // Only update avatar if:
      // 1. User doesn't have an avatar yet, OR
      // 2. User has a default avatar (embed/avatars) and we have a real one from Privy
      // Never overwrite a real avatar (cdn.discordapp.com/avatars/) with a default one
      const userHasRealAvatar = user.discordAvatarUrl?.includes('/avatars/')
      const newAvatarIsReal = discordAvatar?.includes('/avatars/') || body.discordAvatar?.includes('/avatars/')
      const newAvatar = discordAvatar || body.discordAvatar
      
      if (!user.discordAvatarUrl || (newAvatarIsReal && !userHasRealAvatar)) {
        if (newAvatar) {
          updateData.discordAvatarUrl = newAvatar
        }
      }
      // Only update email if it's a non-null string (email is required in DB)
      if (body.email && typeof body.email === 'string') {
        updateData.email = body.email
      }

      // Update wallet if provided and different
      if (body.movementWalletAddress && body.movementWalletAddress !== user.movementWalletAddress) {
        // Check if wallet is already linked to another user
        const existingWalletUser = await prisma.user.findFirst({
          where: {
            movementWalletAddress: body.movementWalletAddress,
            NOT: { privyUserId: body.privyUserId },
          },
        })
        
        if (existingWalletUser) {
          return NextResponse.json(
            { error: 'Wallet already linked to another account' },
            { status: 409 }
          )
        }
        
        updateData.movementWalletAddress = body.movementWalletAddress
        updateData.walletLinkedAt = now
      }
      
      user = await prisma.user.update({
        where: { privyUserId: body.privyUserId },
        data: updateData,
      })
    } else {
      // Create new user
      // Check for wallet uniqueness before creating
      if (body.movementWalletAddress) {
        const existingWalletUser = await prisma.user.findFirst({
          where: { movementWalletAddress: body.movementWalletAddress },
        })
        
        if (existingWalletUser) {
          return NextResponse.json(
            { error: 'Wallet already linked to another account' },
            { status: 409 }
          )
        }
      }
      
      user = await prisma.user.create({
        data: {
          privyUserId: body.privyUserId,
          email: body.email || `${body.privyUserId}@privy.local`,
          username: body.discordUsername || 'User',
          discordId: body.discordId || null,
          discordHandle: body.discordUsername || null,
          discordAvatarUrl: discordAvatar || null,
          movementWalletAddress: body.movementWalletAddress || null,
          walletLinkedAt: body.movementWalletAddress ? now : null,
          role: 'USER',
          totalXp: 0,
          currentWeekXp: 0,
          streakWeeks: 0,
          missedReviews: 0,
        },
      })
      created = true
    }
    
    return NextResponse.json({ user, created })
    
  } catch (error) {
    console.error('Sync error:', error)
    
    // Handle Prisma unique constraint errors
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        { error: 'User or wallet already exists' },
        { status: 409 }
      )
    }
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
