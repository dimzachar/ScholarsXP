'use client'

import { useState } from 'react'
import { Wallet, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useWalletSync } from '@/contexts/WalletSyncContext'
import { WalletSelector } from '@/components/WalletSelector'

interface WalletLinkPromptProps {
  title?: string
  description?: string
  onSuccess?: () => void
  compact?: boolean
}

export function WalletLinkPrompt({
  title = 'Connect Your Wallet',
  description = 'Link your Movement wallet to participate in voting and on-chain activities.',
  onSuccess,
  compact = false
}: WalletLinkPromptProps) {
  const {
    isConnected,
    walletAddress,
    walletName,
    hasLinkedWallet,
    isSyncing,
    syncWalletToSupabase,
    error
  } = useWalletSync()

  const [syncSuccess, setSyncSuccess] = useState(false)

  const handleSync = async () => {
    setSyncSuccess(false)
    await syncWalletToSupabase()
    if (!error) {
      setSyncSuccess(true)
      onSuccess?.()
    }
  }

  // Already linked - show success state
  if (hasLinkedWallet) {
    return null
  }


  // Compact version for inline prompts
  if (compact) {
    return (
      <div className="flex items-center gap-3 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <Wallet className="w-5 h-5 text-amber-500" />
        <span className="text-sm text-gray-300 flex-1">
          {isConnected ? 'Save your wallet to your profile' : 'Connect a wallet to vote'}
        </span>
        {isConnected ? (
          <Button
            size="sm"
            onClick={handleSync}
            disabled={isSyncing}
            className="bg-amber-500 hover:bg-amber-600 text-black"
          >
            {isSyncing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Save Wallet'
            )}
          </Button>
        ) : (
          <WalletSelector>
            <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black">
              Connect
            </Button>
          </WalletSelector>
        )}
      </div>
    )
  }

  return (
    <Card className="bg-gray-900 border-gray-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Wallet className="w-5 h-5 text-amber-500" />
          {title}
        </CardTitle>
        <CardDescription className="text-gray-400">
          {description}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Step 1: Connect Wallet */}
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            isConnected ? 'bg-green-500/20 text-green-500' : 'bg-gray-800 text-gray-400'
          }`}>
            {isConnected ? <CheckCircle className="w-4 h-4" /> : '1'}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Connect Wallet</p>
            {isConnected && walletName && (
              <p className="text-xs text-gray-400">
                Connected: {walletName}
              </p>
            )}
          </div>
          {!isConnected && (
            <WalletSelector>
              <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-black">
                Connect
              </Button>
            </WalletSelector>
          )}
        </div>


        {/* Step 2: Save to Profile */}
        <div className="flex items-center gap-3">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
            syncSuccess ? 'bg-green-500/20 text-green-500' : 'bg-gray-800 text-gray-400'
          }`}>
            {syncSuccess ? <CheckCircle className="w-4 h-4" /> : '2'}
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Save to Profile</p>
            {walletAddress && (
              <p className="text-xs text-gray-400 font-mono">
                {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
              </p>
            )}
          </div>
          {isConnected && !syncSuccess && (
            <Button
              size="sm"
              onClick={handleSync}
              disabled={isSyncing}
              className="bg-amber-500 hover:bg-amber-600 text-black"
            >
              {isSyncing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save Wallet'
              )}
            </Button>
          )}
        </div>

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <AlertCircle className="w-4 h-4 text-red-500" />
            <span className="text-sm text-red-400">{error}</span>
          </div>
        )}

        {/* Success message */}
        {syncSuccess && (
          <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
            <CheckCircle className="w-4 h-4 text-green-500" />
            <span className="text-sm text-green-400">Wallet linked successfully!</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
