'use client'

import { Wallet, Link2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { WalletModal } from './WalletModal'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'

function truncateAddress(address: string): string {
  if (address.length <= 10) return address
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

interface WalletBadgeProps {
  className?: string
}

/**
 * WalletBadge - Compact wallet indicator for profile hero section
 * 
 * Shows linked wallet status and opens WalletModal on click.
 * Matches the styling of other badges in the profile (Rank, Weekly, etc.)
 */
export function WalletBadge({ className }: WalletBadgeProps) {
  const { user } = usePrivyAuthSync()
  const linkedWallet = user?.movementWalletAddress

  return (
    <WalletModal
      trigger={
        linkedWallet ? (
          <Badge 
            variant="outline" 
            className={`px-3 py-1.5 text-sm border-purple-500/30 bg-purple-500/5 text-purple-600 dark:text-purple-400 backdrop-blur-sm shadow-sm cursor-pointer hover:bg-purple-500/10 transition-colors ${className}`}
          >
            <Wallet className="h-3.5 w-3.5 mr-1.5 text-purple-500" />
            {truncateAddress(linkedWallet)}
          </Badge>
        ) : (
          <Badge 
            variant="outline" 
            className={`px-3 py-1.5 text-sm border-muted-foreground/30 bg-muted/5 text-muted-foreground backdrop-blur-sm shadow-sm cursor-pointer hover:border-primary/50 hover:text-primary transition-colors ${className}`}
          >
            <Link2 className="h-3.5 w-3.5 mr-1.5" />
            Link Wallet
          </Badge>
        )
      }
    />
  )
}
