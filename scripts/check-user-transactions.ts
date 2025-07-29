#!/usr/bin/env tsx

/**
 * Check User XP Transactions
 * 
 * This script shows the detailed breakdown of XP transactions for a user
 * to understand what makes up their total XP.
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables
config({ path: resolve(process.cwd(), '.env') })

import { createServiceClient } from '../src/lib/supabase-service'

async function checkUserTransactions(userId: string) {
  try {
    const supabase = createServiceClient()
    
    console.log(`🔍 Checking XP transactions for user: ${userId}`)
    
    // Get user info
    const { data: user, error: userError } = await supabase
      .from('User')
      .select('email, username, totalXp, discordHandle')
      .eq('id', userId)
      .single()
    
    if (userError || !user) {
      console.log('❌ User not found')
      return
    }
    
    console.log(`👤 User: ${user.username} (${user.email})`)
    console.log(`🎯 Discord: ${user.discordHandle}`)
    console.log(`💰 Total XP: ${user.totalXp}`)
    console.log('')
    
    // Get all XP transactions
    const { data: transactions, error: txError } = await supabase
      .from('XpTransaction')
      .select('*')
      .eq('userId', userId)
      .order('createdAt', { ascending: true })
    
    if (txError) {
      console.log('❌ Error fetching transactions:', txError.message)
      return
    }
    
    if (!transactions || transactions.length === 0) {
      console.log('📝 No XP transactions found')
      return
    }
    
    console.log(`📊 Found ${transactions.length} XP transactions:`)
    console.log('')
    
    // Group transactions by type
    const byType: { [key: string]: any[] } = {}
    let totalCalculated = 0
    
    transactions.forEach(tx => {
      if (!byType[tx.type]) {
        byType[tx.type] = []
      }
      byType[tx.type].push(tx)
      totalCalculated += tx.amount
    })
    
    // Show breakdown by type
    Object.keys(byType).forEach(type => {
      const txs = byType[type]
      const typeTotal = txs.reduce((sum, tx) => sum + tx.amount, 0)
      
      console.log(`📋 ${type}: ${txs.length} transactions, ${typeTotal} XP`)
      
      // Show first few transactions of each type
      txs.slice(0, 3).forEach(tx => {
        const date = new Date(tx.createdAt).toLocaleDateString()
        const source = tx.sourceType ? ` (${tx.sourceType})` : ''
        console.log(`   • ${tx.amount} XP - ${tx.description}${source} - ${date}`)
      })
      
      if (txs.length > 3) {
        console.log(`   ... and ${txs.length - 3} more`)
      }
      console.log('')
    })
    
    console.log(`🧮 Calculated Total: ${totalCalculated} XP`)
    console.log(`💾 Stored Total: ${user.totalXp} XP`)
    console.log(`${totalCalculated === user.totalXp ? '✅' : '❌'} XP Consistency: ${totalCalculated === user.totalXp ? 'GOOD' : 'MISMATCH'}`)
    
    // Check for legacy transfers
    const legacyTransfers = transactions.filter(tx => tx.sourceType === 'LEGACY_TRANSFER')
    if (legacyTransfers.length > 0) {
      console.log('')
      console.log(`🔄 Legacy Transfers: ${legacyTransfers.length} transactions, ${legacyTransfers.reduce((sum, tx) => sum + tx.amount, 0)} XP`)
    }
    
  } catch (error) {
    console.error('💥 Error:', error)
  }
}

async function findUserByDiscordHandle(discordHandle: string) {
  try {
    const supabase = createServiceClient()
    
    const { data: user, error } = await supabase
      .from('User')
      .select('id, email, username, discordHandle')
      .eq('discordHandle', discordHandle)
      .single()
    
    if (error || !user) {
      console.log(`❌ User not found with Discord handle: ${discordHandle}`)
      return null
    }
    
    return user.id
  } catch (error) {
    console.error('Error finding user:', error)
    return null
  }
}

async function main() {
  console.log('🚀 Checking User XP Transactions\n')
  
  // Look for raki5629 user
  const userId = await findUserByDiscordHandle('raki5629#0')
  
  if (userId) {
    await checkUserTransactions(userId)
  } else {
    console.log('❌ Could not find raki5629 user')
  }
}

// Run the check
main().catch(error => {
  console.error('💥 Script failed:', error)
  process.exit(1)
})
