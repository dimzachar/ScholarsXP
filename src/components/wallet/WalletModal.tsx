'use client'

import { useState } from 'react'
import {
  Wallet,
  Copy,
  Check,
  ExternalLink,
  Plus,
  Link2,
  Link2Off,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { usePrivyAuth } from '@/hooks/usePrivyAuth'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { useWalletSync } from '@/contexts/WalletSyncContext'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { WalletSelector } from '@/components/WalletSelector'
import { toast } from 'sonner'

function truncateAddress(address: string): string {
  if (address.length <= 13) return address
  return `${address.slice(0, 6)}...${address.slice(-4)}`
}

interface WalletModalProps {
  trigger?: React.ReactNode
}

interface WalletItemProps {
  address: string
  label: string
  type: string
  isLinked: boolean
  onLink: () => void
  onUnlink: () => void
  isLoading: boolean
  onCopy: (address: string) => void
  copied: boolean
}

function WalletItem({ address, label, type, isLinked, onLink, onUnlink, isLoading, onCopy, copied }: WalletItemProps) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border bg-card">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Wallet className="w-4 h-4 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium truncate">{label}</p>
            <span className="text-xs text-muted-foreground">({type})</span>
          </div>
          <div className="flex items-center gap-1">
            <code className="text-xs font-mono text-muted-foreground">{truncateAddress(address)}</code>
            <button onClick={() => onCopy(address)} className="p-0.5 hover:bg-muted rounded">
              {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
            </button>
            <a
              href={`https://explorer.movementnetwork.xyz/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-0.5 hover:bg-muted rounded"
            >
              <ExternalLink className="w-3 h-3 text-muted-foreground" />
            </a>
          </div>
        </div>
      </div>
      <Button
        variant={isLinked ? "outline" : "default"}
        size="sm"
        onClick={isLinked ? onUnlink : onLink}
        disabled={isLoading}
        className={isLinked ? "text-destructive hover:text-destructive ml-2" : "ml-2"}
      >
        {isLoading ? (
          <RefreshCw className="w-3 h-3 animate-spin" />
        ) : isLinked ? (
          <><Link2Off className="w-3 h-3 mr-1" />Unlink</>
        ) : (
          <><Link2 className="w-3 h-3 mr-1" />Link</>
        )}
      </Button>
    </div>
  )
}

export function WalletModal({ trigger }: WalletModalProps) {
  const [open, setOpen] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [isCreatingEmbedded, setIsCreatingEmbedded] = useState(false)
  const [isLinking, setIsLinking] = useState(false)
  const [isUnlinking, setIsUnlinking] = useState(false)

  const {
    walletAddress: embeddedWalletAddress,
    hasWallet: hasEmbeddedWallet,
    createWallet: createEmbeddedWallet,
    isAuthenticated
  } = usePrivyAuth()
  const { user, syncUserToSupabase, refreshUser } = usePrivyAuthSync()
  const { authenticatedFetch } = useAuthenticatedFetch()

  const {
    walletAddress: externalWalletAddress,
    walletName: externalWalletName,
    isConnected: isExternalConnected,
    disconnectWallet
  } = useWalletSync()

  const linkedWalletAddress = user?.movementWalletAddress

  const handleCopy = async (address: string) => {
    try {
      await navigator.clipboard.writeText(address)
      setCopiedAddress(address)
      toast.success('Address copied')
      setTimeout(() => setCopiedAddress(null), 2000)
    } catch {
      toast.error('Failed to copy')
    }
  }

  const handleCreateEmbeddedWallet = async () => {
    setIsCreatingEmbedded(true)
    try {
      const wallet = await createEmbeddedWallet()
      if (wallet) {
        toast.success('Wallet created!')
      }
    } catch {
      toast.error('Failed to create wallet')
    } finally {
      setIsCreatingEmbedded(false)
    }
  }

  const handleLinkWallet = async (address: string) => {
    setIsLinking(true)
    try {
      await syncUserToSupabase(address)
      toast.success('Wallet linked!')
    } catch {
      toast.error('Failed to link wallet')
    } finally {
      setIsLinking(false)
    }
  }

  const handleUnlinkWallet = async () => {
    if (!user?.id) return
    setIsUnlinking(true)
    try {
      const response = await authenticatedFetch('/api/user/wallet', {
        method: 'DELETE'
      })
      if (!response.ok) throw new Error('Failed to unlink wallet')
      await refreshUser()
      toast.success('Wallet unlinked')
    } catch {
      toast.error('Failed to unlink wallet')
    } finally {
      setIsUnlinking(false)
    }
  }

  const handleDisconnectExternal = async () => {
    await disconnectWallet()
    toast.success('Wallet disconnected')
  }

  // Build wallet list
  const wallets: Array<{
    address: string
    label: string
    type: 'embedded' | 'external'
    isLinked: boolean
  }> = []

  if (hasEmbeddedWallet && embeddedWalletAddress) {
    wallets.push({
      address: embeddedWalletAddress,
      label: 'Privy Wallet',
      type: 'embedded',
      isLinked: linkedWalletAddress === embeddedWalletAddress
    })
  }

  if (isExternalConnected && externalWalletAddress) {
    wallets.push({
      address: externalWalletAddress,
      label: externalWalletName || 'External Wallet',
      type: 'external',
      isLinked: linkedWalletAddress === externalWalletAddress
    })
  }

  // If linked wallet doesn't match any connected wallet, show it separately
  if (linkedWalletAddress && !wallets.some(w => w.address === linkedWalletAddress)) {
    wallets.unshift({
      address: linkedWalletAddress,
      label: 'Linked Wallet',
      type: 'external',
      isLinked: true
    })
  }

  const hasWallets = wallets.length > 0

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-primary" />
            Movement Wallets
          </DialogTitle>
          <DialogDescription>
            Manage your wallets for on-chain activities
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* Wallet List */}
          {hasWallets && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Your Wallets</p>
              {wallets.map((wallet) => (
                <WalletItem
                  key={wallet.address}
                  address={wallet.address}
                  label={wallet.label}
                  type={wallet.type}
                  isLinked={wallet.isLinked}
                  onLink={() => handleLinkWallet(wallet.address)}
                  onUnlink={handleUnlinkWallet}
                  isLoading={isLinking || isUnlinking}
                  onCopy={handleCopy}
                  copied={copiedAddress === wallet.address}
                />
              ))}
            </div>
          )}

          {/* Add Wallet Options */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {hasWallets ? 'Add Another Wallet' : 'Add a Wallet'}
            </p>

            <div className="flex gap-2">
              {!hasEmbeddedWallet && (
                <Button
                  onClick={handleCreateEmbeddedWallet}
                  disabled={isCreatingEmbedded || !isAuthenticated}
                  size="sm"
                  variant="outline"
                  className="flex-1"
                >
                  {isCreatingEmbedded ? (
                    <><RefreshCw className="w-3 h-3 mr-2 animate-spin" />Creating...</>
                  ) : (
                    <><Plus className="w-3 h-3 mr-2" />Create Embedded</>
                  )}
                </Button>
              )}

              <WalletSelector>
                <Button size="sm" variant="outline" className={hasEmbeddedWallet ? "w-full" : "flex-1"}>
                  <Link2 className="w-3 h-3 mr-2" />
                  Connect External
                </Button>
              </WalletSelector>
            </div>

            {isExternalConnected && (
              <Button
                onClick={handleDisconnectExternal}
                size="sm"
                variant="ghost"
                className="w-full text-muted-foreground"
              >
                Disconnect {externalWalletName || 'External Wallet'}
              </Button>
            )}
          </div>

          <p className="text-xs text-muted-foreground text-center pt-2">
            One wallet can be linked at a time for voting and on-chain activities.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
