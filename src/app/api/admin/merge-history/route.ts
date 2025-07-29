/**
 * Admin Merge History API
 * 
 * Provides merge history data for the admin dashboard
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase-service'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    
    const supabase = createServiceClient()
    
    // Get merge history with user details
    const { data: mergeHistory, error } = await supabase
      .from('UserMergeHistory')
      .select(`
        id,
        realUserId,
        legacyUserId,
        legacyDiscordHandle,
        legacyEmail,
        status,
        startedAt,
        completedAt,
        errorMessage,
        transactionsTransferred,
        xpTransferred,
        weeklyStatsTransferred,
        weeklyStatsConflicts,
        processingTimeMs,
        initiatedBy
      `)
      .order('startedAt', { ascending: false })
      .range(offset, offset + limit - 1)
    
    if (error) {
      console.error('Error fetching merge history:', error)
      return NextResponse.json({
        error: 'Failed to fetch merge history'
      }, { status: 500 })
    }
    
    // Get user details for each merge
    const enrichedHistory = []
    
    for (const merge of mergeHistory || []) {
      // Get real user details
      const { data: realUser } = await supabase
        .from('User')
        .select('email, username')
        .eq('id', merge.realUserId)
        .single()
      
      enrichedHistory.push({
        ...merge,
        userEmail: realUser?.email || 'Unknown',
        username: realUser?.username || 'Unknown'
      })
    }
    
    return NextResponse.json({
      success: true,
      mergeHistory: enrichedHistory,
      pagination: {
        limit,
        offset,
        total: enrichedHistory.length
      }
    })
    
  } catch (error) {
    console.error('Merge history API error:', error)
    return NextResponse.json({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}
