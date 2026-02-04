/**
 * Admin Promotions API
 * 
 * GET /api/admin/promotions
 * Returns rank promotions filtered to main category changes only
 * (Initiate → Apprentice → Journeyman → Erudite → Master)
 * 
 * Query params:
 * - page: number (default: 1)
 * - limit: number (default: 50, max: 200)
 * - category: filter by new category (optional)
 * - userId: filter by user id or username (optional)
 * - dateFrom: ISO date string (optional)
 * - dateTo: ISO date string (optional)
 */

import { NextResponse } from 'next/server'
import { withPermission, AuthenticatedRequest } from '@/lib/auth-middleware'
import { withErrorHandling, createSuccessResponse } from '@/lib/api-middleware'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@prisma/client'

// Helper to check if a string is a valid UUID
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/
  return uuidRegex.test(str)
}

export const GET = withPermission('admin_access')(
  withErrorHandling(async (request: AuthenticatedRequest) => {
    const { searchParams } = new URL(request.url)
    
    // Parse pagination
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1)
    const limitRaw = Math.max(parseInt(searchParams.get('limit') || '50', 10), 1)
    const limit = Math.min(limitRaw, 200)
    const skip = (page - 1) * limit
    
    // Parse filters
    const category = searchParams.get('category') || undefined
    const userId = searchParams.get('userId') || undefined
    const dateFrom = searchParams.get('dateFrom') || undefined
    const dateTo = searchParams.get('dateTo') || undefined
    
    // Resolve userId to actual UUID(s) if it's a username
    // Supports partial matching - e.g., "raki" will match "raki5629"
    let targetUserIds: string[] | undefined = undefined
    if (userId) {
      if (isValidUUID(userId)) {
        targetUserIds = [userId]
      } else {
        // Find all users whose username contains the search term (case-insensitive)
        const users = await prisma.user.findMany({
          where: { 
            username: { 
              contains: userId, 
              mode: 'insensitive' 
            } 
          },
          select: { id: true }
        })
        targetUserIds = users.map(u => u.id)
      }
    }
    
    // Build where clause - only category changes (main role promotions)
    // Use raw query for JSON filtering since Prisma's JSON filter syntax varies
    let whereClause: any = {
      action: 'RANK_PROMOTION'
    }
    
    // For category changes, we'll filter in memory after fetching
    // This is necessary because Prisma's JSON filtering doesn't work consistently
    
    // Add optional filters
    if (category) {
      whereClause.details = {
        path: ['newCategory'],
        equals: category
      }
    }
    
    if (targetUserIds && targetUserIds.length > 0) {
      whereClause.targetId = { in: targetUserIds }
    } else if (userId) {
      // Search term provided but no users found - return empty results
      whereClause.targetId = { in: [] }
    }
    
    if (dateFrom || dateTo) {
      whereClause.createdAt = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo ? { lte: new Date(dateTo) } : {})
      }
    }
    
    // Fetch promotions with user details
    // First get all rank promotions, then filter for category changes in memory
    const allPromotions = await prisma.adminAction.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: {
            id: true,
            username: true,
            role: true
          }
        }
      }
    })
    
    // Filter for category changes (main role promotions only)
    const promotions = allPromotions.filter(p => {
      const details = p.details as any
      return details?.categoryChanged === true
    })
    
    const total = promotions.length
    
    // Apply pagination after filtering
    const paginatedPromotions = promotions.slice(skip, skip + limit)
    
    // Fetch user details for each promotion
    const userIds = [...new Set(paginatedPromotions.map(p => p.targetId))]
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        totalXp: true,
        profileImageUrl: true
      }
    })
    
    const userMap = new Map(users.map(u => [u.id, u]))
    
    // Transform to response format
    const transformedPromotions = paginatedPromotions.map(promo => {
      const details = promo.details as any
      const user = userMap.get(promo.targetId)
      
      return {
        id: promo.id,
        date: promo.createdAt,
        user: {
          username: user?.username || 'Unknown',
          avatarUrl: user?.profileImageUrl,
          totalXp: user?.totalXp || 0
        },
        promotion: {
          oldRank: details?.oldRank || 'Unknown',
          newRank: details?.newRank || 'Unknown',
          oldCategory: details?.oldCategory || 'Unknown',
          newCategory: details?.newCategory || 'Unknown',
          xpAtPromotion: details?.xpAtPromotion || 0
        },
        isBackfill: details?.isBackfill || false
      }
    })
    
    return createSuccessResponse({
      promotions: transformedPromotions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  })
)
