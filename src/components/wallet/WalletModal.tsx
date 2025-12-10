'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Wallet,
  Copy,
  Check,
  ExternalLink,
  Plus,
  Link2,
  Link2Off,
  RefreshCw,
  Star
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
import { Badge } from '@/components/ui/badge'
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

interface LinkedWallet {
  id: string
  address: string
  label: string | null
  type: 'EMBEDDED' | 'EXTERNAL'
  isPrimary: boolean
  linkedAt: string
}

interface WalletModalProps {
  trigger?: React.ReactNode
}

export function WalletModal({ trigger }: WalletModalProps) {
  const [open, setOpen] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [isCreatingEmbedded, setIsCreatingEmbedded] = useState(false)
  const [isLinking, setIsLinking] = useState<string | null>(null)
  const [isUnlinking, setIsUnlinking] = useState<string | null>(null)
  const [isSettingPrimary, setIsSettingPrimary] = useState<string | null>(null)
  const [linkedWallets, setLinkedWallets] = useState<LinkedWallet[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const {
    walletAddress: embeddedWalletAddress,
    hasWallet: hasEmbeddedWallet,
    createWallet: createEmbeddedWallet,
    isAuthenticated
  } = usePrivyAuth()
  const { refreshUser } = usePrivyAuthSync()
  const { authenticatedFetch } = useAuthenticatedFetch()

  const {
    walletAddress: externalWalletAddress,
    walletName: externalWalletName,
    isConnected: isExternalConnected,
    disconnectWallet
  } = useWalletSync()

  // Fetch linked wallets from API
  const fetchWallets = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    try {
      const response = await authenticatedFetch('/api/user/wallet')
      if (response.ok) {
        const data = await response.json()
        setLinkedWallets(data.wallets || [])
      }
    } catch (error) {
      console.error('Failed to fetch wallets:', error)
    } finally {
      setIsLoading(false)
    }
  }, [authenticatedFetch, isAuthenticated])

  useEffect(() => {
    if (open) {
      fetchWallets()
    }
  }, [open, fetchWallets])

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
        // Auto-link the new embedded wallet
        await handleLinkWallet(wallet.address, 'EMBEDDED')
        toast.success('Wallet created and linked!')
      }
    } catch {
      toast.error('Failed to create wallet')
    } finally {
      setIsCreatingEmbedded(false)
    }
  }

  const handleLinkWallet = async (address: string, type: 'EMBEDDED' | 'EXTERNAL' = 'EXTERNAL') => {
    setIsLinking(address)
    try {
      const response = await authenticatedFetch('/api/user/wallet', {
        method: 'POST',
        body: JSON.stringify({ 
          walletAddress: address, 
          type,
          isPrimary: linkedWallets.length === 0 
        })
      })
      
      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to link wallet')
      }
      
      await fetchWallets()
      await refreshUser()
      toast.success('Wallet linked!')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to link wallet')
    } finally {
      setIsLinking(null)
    }
  }

  const handleUnlinkWallet = async (address: string) => {
    setIsUnlinking(address)
    try {
      const response = await authenticatedFetch(`/api/user/wallet?address=${encodeURIComponent(address)}`, {
        method: 'DELETE'
      })
      
      if (!response.ok) throw new Error('Failed to unlink wallet')
      
      await fetchWallets()
      await refreshUser()
      toast.success('Wallet unlinked')
    } catch {
      toast.error('Failed to unlink wallet')
    } finally {
      setIsUnlinking(null)
    }
  }

  const handleSetPrimary = async (address: string) => {
    setIsSettingPrimary(address)
    try {
      const response = await authenticatedFetch('/api/user/wallet', {
        method: 'PATCH',
        body: JSON.stringify({ walletAddress: address, isPrimary: true })
      })
      
      if (!response.ok) throw new Error('Failed to set primary wallet')
      
      await fetchWallets()
      await refreshUser()
      toast.success('Primary wallet updated')
    } catch {
      toast.error('Failed to set primary wallet')
    } finally {
      setIsSettingPrimary(null)
    }
  }

  const handleDisconnectExternal = async () => {
    await disconnectWallet()
    toast.success('Wallet disconnected')
  }

  // Check if wallet is already linked
  const isWalletLinked = (address: string) => linkedWallets.some(w => w.address === address)

  // Available wallets to link (connected but not yet linked)
  const availableToLink: Array<{ address: string; label: string; type: 'EMBEDDED' | 'EXTERNAL' }> = []
  
  if (hasEmbeddedWallet && embeddedWalletAddress && !isWalletLinked(embeddedWalletAddress)) {
    availableToLink.push({ address: embeddedWalletAddress, label: 'Privy Wallet', type: 'EMBEDDED' })
  }
  
  if (isExternalConnected && externalWalletAddress && !isWalletLinked(externalWalletAddress)) {
    availableToLink.push({ address: externalWalletAddress, label: externalWalletName || 'External Wallet', type: 'EXTERNAL' })
  }

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
          {/* Linked Wallets */}
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : linkedWallets.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Linked Wallets</p>
              {linkedWallets.map((wallet) => (
                <div key={wallet.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <Wallet className="w-4 h-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium truncate">{wallet.label || (wallet.type === 'EMBEDDED' ? 'Embedded' : 'External')}</p>
                        {wallet.isPrimary && (
                          <Badge variant="outline" className="text-xs border-yellow-500/30 bg-yellow-500/5 text-yellow-600 dark:text-yellow-400">
                            <Star className="w-2.5 h-2.5 mr-1 fill-current" />Primary
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <code className="text-xs font-mono text-muted-foreground">{truncateAddress(wallet.address)}</code>
                        <button onClick={() => handleCopy(wallet.address)} className="p-0.5 hover:bg-muted rounded">
                          {copiedAddress === wallet.address ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3 text-muted-foreground" />}
                        </button>
                        <a href={`https://explorer.movementnetwork.xyz/account/${wallet.address}`} target="_blank" rel="noopener noreferrer" className="p-0.5 hover:bg-muted rounded">
                          <ExternalLink className="w-3 h-3 text-muted-foreground" />
                        </a>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 ml-2">
                    {!wallet.isPrimary && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleSetPrimary(wallet.address)}
                        disabled={isSettingPrimary === wallet.address}
                        title="Set as primary"
                        className="h-8 w-8"
                      >
                        {isSettingPrimary === wallet.address ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Star className="w-3.5 h-3.5" />
                        )}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleUnlinkWallet(wallet.address)}
                      disabled={isUnlinking === wallet.address || linkedWallets.length <= 1}
                      title={linkedWallets.length <= 1 ? "Can't unlink last wallet" : "Unlink wallet"}
                      className="h-8 w-8 text-destructive hover:text-destructive disabled:text-muted-foreground"
                    >
                      {isUnlinking === wallet.address ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Link2Off className="w-3.5 h-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {/* Available to Link */}
          {availableToLink.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available to Link</p>
              {availableToLink.map((wallet) => (
                <div key={wallet.address} className="flex items-center justify-between p-3 rounded-lg border bg-card border-dashed">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                      <Wallet className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{wallet.label}</p>
                      <code className="text-xs font-mono text-muted-foreground">{truncateAddress(wallet.address)}</code>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handleLinkWallet(wallet.address, wallet.type)}
                    disabled={isLinking === wallet.address}
                    className="ml-2"
                  >
                    {isLinking === wallet.address ? (
                      <RefreshCw className="w-3 h-3 animate-spin" />
                    ) : (
                      <><Link2 className="w-3 h-3 mr-1" />Link</>
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add Wallet Options */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {linkedWallets.length > 0 || availableToLink.length > 0 ? 'Add Another Wallet' : 'Add a Wallet'}
            </p>

            <div className="flex gap-2">
              <Button
                onClick={handleCreateEmbeddedWallet}
                disabled={isCreatingEmbedded || !isAuthenticated || hasEmbeddedWallet}
                size="sm"
                variant="outline"
                className="flex-1"
                title={hasEmbeddedWallet ? "You already have an embedded wallet" : "Create a Privy-managed wallet"}
              >
                {isCreatingEmbedded ? (
                  <><RefreshCw className="w-3 h-3 mr-2 animate-spin" />Creating...</>
                ) : (
                  <><Plus className="w-3 h-3 mr-2" />Create Embedded</>
                )}
              </Button>

              <WalletSelector>
                <Button size="sm" variant="outline" className="flex-1">
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
            Link up to 5 wallets. The primary wallet is used for voting.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
