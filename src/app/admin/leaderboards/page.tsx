"use client"
import { useEffect, useMemo, useState } from 'react'
// import { useRouter } from 'next/navigation'
import AuthGuard from '@/components/Auth/AuthGuard'
import { AdminGuard } from '@/components/Auth/RoleGuard'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BarChart3, Award, HelpCircle, Crown, Medal, Search, Download, RefreshCw, Loader2, Shield } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Pagination } from '@/components/ui/pagination'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

type Standing = {
  rank: number
  userId: string
  user?: { id: string; username: string | null; email?: string }
  points: number
  eligible: boolean
  reasons: string[]
}

type Winner = {
  id: string
  rank?: number
  userId: string
  user?: { id: string; username: string | null; email?: string }
  xpAwarded?: number
}

type PreviewData = {
  items: Standing[]
  winner?: Winner
  winners?: Winner[]
}

type HistoryWinner = Winner & { month: string; awardedAt: string }

type UserResult = { id: string; username?: string | null; email?: string | null }

export default function AdminLeaderboardsPage() {
  const [months, setMonths] = useState<string[]>([])
  const [month, setMonth] = useState<string>('')
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [history, setHistory] = useState<HistoryWinner[]>([])
  const [loading, setLoading] = useState(false)
  const [overrideOpen, setOverrideOpen] = useState(false)
  const [overrideUserId, setOverrideUserId] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [eligibility, setEligibility] = useState<'all' | 'eligible' | 'ineligible'>('all')
  const [minPoints, setMinPoints] = useState('')
  const [maxPoints, setMaxPoints] = useState('')
  const [searchUser, setSearchUser] = useState('')
  const [userResults, setUserResults] = useState<UserResult[]>([])
  const [historyPage, setHistoryPage] = useState(1)
  const [historyTotal, setHistoryTotal] = useState(0)
  const [bulkAwardLoading, setBulkAwardLoading] = useState(false)
  const [opsMessage, setOpsMessage] = useState<string | null>(null)
  const [revokeAllLoading, setRevokeAllLoading] = useState(false)
  const [awardLoading, setAwardLoading] = useState(false)

  useEffect(() => {
    const load = async () => {
      const res = await fetch('/api/leaderboard/months', { credentials: 'include' })
      const json = await res.json()
      const list: string[] = json?.data?.months || []
      setMonths(list)
      if (list.length) setMonth(list[0])
    }
    load()
  }, [])

  useEffect(() => {
    if (!month) return
    const run = async () => {
      setLoading(true)
      const [p, h] = await Promise.all([
        fetch(`/api/admin/leaderboards/month/${month}/preview`, { credentials: 'include' })
          .then(async (r) => (r.ok ? r.json() : Promise.reject(await r.text()))),
        fetch(`/api/admin/leaderboards/winners?limit=12&page=${historyPage}`, { credentials: 'include' })
          .then(async (r) => (r.ok ? r.json() : Promise.reject(await r.text()))),
      ])
      setPreview(p?.data || null)
      setHistory(h?.data?.items || [])
      setHistoryTotal(h?.data?.totalCount || 0)
      setLoading(false)
    }
    run()
  }, [month, historyPage])

  // const nextEligible = useMemo(() => preview?.items?.find((i) => i.eligible), [preview])

  const handleAward = async () => {
    if (!month) return
    setAwardLoading(true)
    try {
      const res = await fetch(`/api/leaderboard/winners/${month}`, { method: 'POST', credentials: 'include' })
      if (res.ok) {
        const body = await res.json().catch(() => ({}))
        // Refresh preview and history so UI reflects award instantly
        const [p, h] = await Promise.all([
          fetch(`/api/admin/leaderboards/month/${month}/preview`, { credentials: 'include' }).then((r) => r.json()),
          fetch(`/api/admin/leaderboards/winners?limit=12&page=${historyPage}`, { credentials: 'include' }).then((r) => r.json()),
        ])
        setPreview(p?.data || null)
        setHistory(h?.data?.items || [])
        setHistoryTotal(h?.data?.totalCount || 0)
        const awardedCount = Array.isArray(body?.data) ? body.data.length : (body?.data ? 1 : 0)
        setOpsMessage(awardedCount > 0 ? `Awarded ${awardedCount} winner(s)` : 'No eligible winners to award (cooldown may block)')
      } else {
        const json = await res.json().catch(() => ({}))
        setOpsMessage(json?.error || 'Failed to award winners (cooldown may block)')
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to award winners'
      setOpsMessage(message)
    } finally {
      setAwardLoading(false)
    }
  }

  const handleOverride = async () => {
    if (!overrideUserId || !month) return
    const res = await fetch(`/api/admin/leaderboards/winners/${month}/override`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ userId: overrideUserId, reason: overrideReason }),
    })
    if (res.ok) {
      setOverrideOpen(false)
      setOverrideUserId('')
      setOverrideReason('')
      const p = await fetch(`/api/admin/leaderboards/month/${month}/preview`, { credentials: 'include' }).then((r) => r.json())
      setPreview(p?.data || null)
    }
  }

  const handleBulkAward = async () => {
    try {
      setBulkAwardLoading(true)
      const res = await fetch(`/api/admin/leaderboards/winners/bulk-award`, { method: 'POST', credentials: 'include' })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || 'Bulk award failed')
      setOpsMessage(`Awarded: ${json?.data?.awarded?.length || 0}, Skipped: ${json?.data?.skipped?.length || 0}, Errors: ${json?.data?.errors?.length || 0}`)
      // Refresh preview/history
      if (month) {
        const [p, h] = await Promise.all([
          fetch(`/api/admin/leaderboards/month/${month}/preview`, { credentials: 'include' }).then((r) => r.json()),
          fetch(`/api/admin/leaderboards/winners?limit=12&page=${historyPage}`, { credentials: 'include' }).then((r) => r.json()),
        ])
        setPreview(p?.data || null)
        setHistory(h?.data?.items || [])
        setHistoryTotal(h?.data?.totalCount || 0)
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Bulk award failed'
      setOpsMessage(message)
    } finally {
      setBulkAwardLoading(false)
    }
  }

  // Client-side filters for preview
  const filteredItems = useMemo(() => {
    let items = preview?.items || []
    if (eligibility !== 'all') items = items.filter(i => (eligibility === 'eligible') ? i.eligible : !i.eligible)
    const min = minPoints ? Number(minPoints) : undefined
    const max = maxPoints ? Number(maxPoints) : undefined
    if (min !== undefined) items = items.filter(i => i.points >= min)
    if (max !== undefined) items = items.filter(i => i.points <= max)
    if (searchUser) {
      const q = searchUser.toLowerCase()
      items = items.filter(i => (i.user?.username || '').toLowerCase().includes(q) || i.userId.includes(q))
    }
    return items
  }, [preview?.items, eligibility, minPoints, maxPoints, searchUser])

  // User search for override dialog
  useEffect(() => {
    const id = setTimeout(async () => {
      if (!searchUser || searchUser.length < 2) { setUserResults([]); return }
      const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(searchUser)}&limit=8`, { credentials: 'include' })
      const json = await res.json()
      setUserResults(json?.data || [])
    }, 300)
    return () => clearTimeout(id)
  }, [searchUser])

  // Auto-clear ops message (toast-like)
  useEffect(() => {
    if (!opsMessage) return
    const t = setTimeout(() => setOpsMessage(null), 4000)
    return () => clearTimeout(t)
  }, [opsMessage])

  return (
    <AuthGuard>
      <AdminGuard>
        <div className="container mx-auto p-4 space-y-6">
          <div className="flex items-center gap-3">
            <BarChart3 className="h-6 w-6 text-primary" />
            <div>
              <h1 className="text-2xl font-semibold">Leaderboards — Admin</h1>
              <p className="text-sm text-muted-foreground">Monthly preview, awarding and history</p>
            </div>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Monthly Preview</CardTitle>
              <CardDescription>Select a month, review standings and cooldown eligibility</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Winners strip for selected month */}
              {preview?.winners && preview.winners.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <Badge className="mr-2">Preview Winners</Badge>
                  {preview.winners.map((w: Winner) => (
                    <div key={w.id} className="flex items-center gap-2 px-3 py-1 rounded-full bg-background border">
                      {w.rank === 1 ? (
                        <Crown className="h-4 w-4 text-primary" />
                      ) : w.rank === 2 ? (
                        <Medal className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <Award className="h-4 w-4 text-secondary-foreground" />
                      )}
                      <span className="text-sm font-medium">{w.user?.username || w.userId}</span>
                      {typeof w.xpAwarded === 'number' && (
                        <span className="text-xs text-muted-foreground">#{w.rank} · {w.xpAwarded.toLocaleString()} XP</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="Select month" />
                  </SelectTrigger>
                  <SelectContent>
                    {months.map((m) => (
                      <SelectItem value={m} key={m}>{m}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="inline-flex items-center text-sm text-muted-foreground cursor-help">
                        <HelpCircle className="h-4 w-4 mr-1" />
                        3-month cooldown applies
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      The same user cannot win more than once within the prior 3 months. Award Now respects this rule; Override bypasses it (logged).
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <Select value={eligibility} onValueChange={(v) => setEligibility(v as 'all' | 'eligible' | 'ineligible')}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Eligibility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="eligible">Eligible</SelectItem>
                    <SelectItem value="ineligible">Ineligible</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2">
                  <Input placeholder="Min points" value={minPoints} onChange={(e) => setMinPoints(e.target.value)} className="w-28" />
                  <Input placeholder="Max points" value={maxPoints} onChange={(e) => setMaxPoints(e.target.value)} className="w-28" />
                </div>
                <div className="flex items-center gap-2">
                  <Search className="h-4 w-4 text-muted-foreground" />
                  <Input placeholder="Search user" value={searchUser} onChange={(e) => setSearchUser(e.target.value)} className="w-56" />
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline"><Download className="h-4 w-4 mr-2" />Export</Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => window.open(`/api/admin/leaderboards/month/${month}/export`, '_blank')}>Export Monthly Preview CSV</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => window.open('/api/admin/leaderboards/winners/export', '_blank')}>Export Winners CSV</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" onClick={async () => { await fetch('/api/admin/leaderboards/cache/revalidate?scope=monthly&month='+month, { method: 'POST' }); }}>
                  <RefreshCw className="h-4 w-4 mr-2" /> Refresh Cache
                </Button>
                <Button disabled={!month || loading || awardLoading} onClick={handleAward}>
                  {awardLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Award className="h-4 w-4 mr-2" />
                  )}
                  {awardLoading ? 'Awarding…' : 'Award Now (cooldown)'}
                </Button>
                <Button variant="secondary" onClick={() => setOverrideOpen(true)}>
                  <Shield className="h-4 w-4 mr-2" /> Override
                </Button>
                <Button variant="ghost" disabled={bulkAwardLoading} onClick={handleBulkAward}>
                  <Award className="h-4 w-4 mr-2" /> Bulk Award Missing Months
                </Button>
              </div>
              {opsMessage && (
                <Alert className="mt-2"><AlertDescription>{opsMessage}</AlertDescription></Alert>
              )}

              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">#</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="text-right">Points</TableHead>
                      <TableHead className="text-center">Eligibility</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow><TableCell colSpan={5}>Loading…</TableCell></TableRow>
                    ) : (filteredItems || []).length ? (
                      filteredItems.map((s) => (
                        <TableRow key={s.userId}>
                          <TableCell>{s.rank}</TableCell>
                          <TableCell>{s.user?.username || s.userId}</TableCell>
                          <TableCell className="text-right">{s.points}</TableCell>
                          <TableCell className="text-center">
                            {s.eligible ? (
                              <Badge variant="default">Eligible</Badge>
                            ) : (
                              <Badge variant="destructive">Ineligible</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{s.reasons.join('; ')}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost" disabled={!s.eligible || loading}>
                                  <Award className="h-4 w-4 mr-1" /> Award
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem disabled={!s.eligible || loading} onClick={async () => {
                                  await fetch(`/api/admin/leaderboards/winners/${month}/override`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: s.userId, reason: 'manual award from preview row', rank: 1 })
                                  })
                                  const [p, h] = await Promise.all([
                                    fetch(`/api/admin/leaderboards/month/${month}/preview`).then(r => r.json()),
                                    fetch(`/api/admin/leaderboards/winners?limit=12&page=${historyPage}`).then(r => r.json()),
                                  ])
                                  setPreview(p?.data || null)
                                  setHistory(h?.data?.items || [])
                                  setHistoryTotal(h?.data?.totalCount || 0)
                                }}>Award as #1 (2000 XP)</DropdownMenuItem>
                                <DropdownMenuItem disabled={!s.eligible || loading} onClick={async () => {
                                  await fetch(`/api/admin/leaderboards/winners/${month}/override`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: s.userId, reason: 'manual award from preview row', rank: 2 })
                                  })
                                  const [p, h] = await Promise.all([
                                    fetch(`/api/admin/leaderboards/month/${month}/preview`).then(r => r.json()),
                                    fetch(`/api/admin/leaderboards/winners?limit=12&page=${historyPage}`).then(r => r.json()),
                                  ])
                                  setPreview(p?.data || null)
                                  setHistory(h?.data?.items || [])
                                  setHistoryTotal(h?.data?.totalCount || 0)
                                }}>Award as #2 (1500 XP)</DropdownMenuItem>
                                <DropdownMenuItem disabled={!s.eligible || loading} onClick={async () => {
                                  await fetch(`/api/admin/leaderboards/winners/${month}/override`, {
                                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ userId: s.userId, reason: 'manual award from preview row', rank: 3 })
                                  })
                                  const [p, h] = await Promise.all([
                                    fetch(`/api/admin/leaderboards/month/${month}/preview`).then(r => r.json()),
                                    fetch(`/api/admin/leaderboards/winners?limit=12&page=${historyPage}`).then(r => r.json()),
                                  ])
                                  setPreview(p?.data || null)
                                  setHistory(h?.data?.items || [])
                                  setHistoryTotal(h?.data?.totalCount || 0)
                                }}>Award as #3 (1000 XP)</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={5}>No data.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Winners History</CardTitle>
                <CardDescription>Previously awarded months</CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="destructive" disabled={!month || loading || revokeAllLoading}>
                      {revokeAllLoading ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Revoking...
                        </>
                      ) : (
                        'Revoke All'
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={async () => {
                      setRevokeAllLoading(true)
                      setOpsMessage('Revoking all winners for selected month...')
                      if (!month) return
                      try {
                        const res = await fetch(`/api/admin/leaderboards/winners/${month}/revoke-all`, { method: 'POST' })
                        if (res.ok) {
                          const [p, h] = await Promise.all([
                            fetch(`/api/admin/leaderboards/month/${month}/preview`).then(r => r.json()),
                            fetch(`/api/admin/leaderboards/winners?limit=12&page=${historyPage}`).then(r => r.json()),
                          ])
                          setPreview(p?.data || null)
                          setHistory(h?.data?.items || [])
                          setHistoryTotal(h?.data?.totalCount || 0)
                          setOpsMessage(`Revoked all winners for ${month}`)
                        } else {
                          setOpsMessage(`Failed to revoke all winners for ${month}`)
                        }
                      } finally {
                        setRevokeAllLoading(false)
                      }
                    }}>Delete month</DropdownMenuItem>
                    <DropdownMenuItem onClick={async () => {
                      setRevokeAllLoading(true)
                      setOpsMessage('Revoking all winners across all months...')
                      // Try server bulk-revoke endpoint; if it fails, fallback to client-side by-id deletes
                      let ok = false
                      try {
                        const res = await fetch(`/api/admin/leaderboards/winners/revoke-all`, { method: 'POST' })
                        ok = res.ok
                      } catch {}

                      if (!ok) {
                        // Fallback: paginate through winners and delete one by one
                        try {
                          let page = 1
                          const limit = 100
                          while (true) {
                            const list = await fetch(`/api/admin/leaderboards/winners?limit=${limit}&page=${page}`).then(r => r.json())
                            const items = list?.data?.items || []
                            if (!items.length) break
                            // delete page in parallel to speed up
                            await Promise.all((items as Array<{ id: string }>).map((w) => (
                              fetch(`/api/admin/leaderboards/winners/by-id/${w.id}`, { method: 'DELETE' })
                            )))
                            if (items.length < limit) break
                            page++
                          }
                          ok = true
                        } catch {}
                      }

                      if (ok) {
                        const [p, h] = await Promise.all([
                          fetch(`/api/admin/leaderboards/month/${month}/preview`).then(r => r.json()),
                          fetch(`/api/admin/leaderboards/winners?limit=12&page=${historyPage}`).then(r => r.json()),
                        ])
                        setPreview(p?.data || null)
                        setHistory(h?.data?.items || [])
                        setHistoryTotal(h?.data?.totalCount || 0)
                        setOpsMessage(`Revoked all winners (all months)`)                        
                      } else {
                        setOpsMessage(`Failed to revoke all winners (all months)`)                        
                      }
                      setRevokeAllLoading(false)
                    }}>Delete all</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Month</TableHead>
                      <TableHead>Winner (Rank/XP)</TableHead>
                      <TableHead>Awarded At</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(history || []).length ? (
                      history.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell>{w.month}</TableCell>
                          <TableCell>{w.user?.username || w.userId} {w.rank ? `( #${w.rank}${typeof w.xpAwarded === 'number' ? ` · ${w.xpAwarded.toLocaleString()} XP` : ''} )` : ''}</TableCell>
                          <TableCell>{new Date(w.awardedAt).toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="sm" variant="ghost">Actions</Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={async () => {
                                  await fetch(`/api/admin/leaderboards/winners/by-id/${w.id}`, { method: 'DELETE' })
                                  const h = await fetch(`/api/admin/leaderboards/winners?limit=12&page=${historyPage}`).then(r => r.json())
                                  setHistory(h?.data?.items || [])
                                  setHistoryTotal(h?.data?.totalCount || 0)
                                  // Also refresh the currently selected month's preview so eligibility updates instantly
                                  if (month) {
                                    const p = await fetch(`/api/admin/leaderboards/month/${month}/preview`).then(r => r.json())
                                    setPreview(p?.data || null)
                                  }
                                  setOpsMessage(`Revoked winner for ${w.month}`)
                                }}>Revoke</DropdownMenuItem>
                                {null}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow><TableCell colSpan={3}>No winners yet.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4">
                <Pagination
                  pagination={{ page: historyPage, limit: 12, totalCount: historyTotal, totalPages: Math.ceil(historyTotal / 12), hasNextPage: historyPage < Math.ceil(historyTotal / 12), hasPrevPage: historyPage > 1 }}
                  onPageChange={({ page }) => setHistoryPage(page)}
                  showPageSizeSelector={false}
                  loading={loading}
                />
              </div>
            </CardContent>
          </Card>

          <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Override Winner</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <Input placeholder="Search user (name or email)" value={searchUser} onChange={(e) => setSearchUser(e.target.value)} />
                {userResults.length > 0 && (
                  <div className="max-h-40 overflow-auto border rounded-md p-2">
                    {userResults.map((u) => (
                      <div key={u.id} className="py-1 px-2 hover:bg-muted cursor-pointer rounded" onClick={() => { setOverrideUserId(u.id); setSearchUser(u.username || u.email || u.id); }}>
                        <div className="font-medium">{u.username || '(no username)'}</div>
                        <div className="text-xs text-muted-foreground">{u.email} · {u.id}</div>
                      </div>
                    ))}
                  </div>
                )}
                <Input placeholder="Selected userId" value={overrideUserId} onChange={(e) => setOverrideUserId(e.target.value)} />
                <Input placeholder="Reason (optional)" value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOverrideOpen(false)}>Cancel</Button>
                <Button onClick={handleOverride}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </AdminGuard>
    </AuthGuard>
  )
}
