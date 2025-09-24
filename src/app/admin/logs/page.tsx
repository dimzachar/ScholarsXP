'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Calendar, Filter, RefreshCw, Search, ListFilter, SortDesc, SortAsc, ShieldCheck, User as UserIcon, FileText, Award } from 'lucide-react'
import type { NormalizedLogRow } from '@/lib/audit-log'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthGuard from '@/components/Auth/AuthGuard'
import { AdminGuard } from '@/components/Auth/RoleGuard'

type EventType = NormalizedLogRow['eventType']

const EVENT_TYPE_META: Record<EventType, { label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>>; badgeClass: string }> = {
  // Use only tokens defined in tailwind.config.ts for consistent theming
  admin_action: { label: 'Admin Action', icon: ShieldCheck, badgeClass: 'bg-purple/10 text-purple border-purple/20' },
  submission: { label: 'Submission', icon: FileText, badgeClass: 'bg-primary/10 text-primary border-primary/20' },
  peer_review: { label: 'Peer Review', icon: UserIcon, badgeClass: 'bg-success/10 text-success border-success/20' },
  xp_transaction: { label: 'XP Transaction', icon: Award, badgeClass: 'bg-warning/10 text-warning border-warning/20' },
}

export default function AdminLogsPage() {
  const router = useRouter()
  const sp = useSearchParams()

  const [items, setItems] = useState<NormalizedLogRow[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(() => parseInt(sp.get('page') || '1', 10))
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [q, setQ] = useState(sp.get('q') || '')
  const initialTimeframeParam = sp.get('timeframe')
  const initialTimeframe: '24h' | '7d' | '30d' | 'all' =
    initialTimeframeParam === '24h' || initialTimeframeParam === '7d' || initialTimeframeParam === '30d' || initialTimeframeParam === 'all'
      ? initialTimeframeParam
      : '7d'
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>(initialTimeframe)
  const initialTypes = ((sp.get('eventTypes') || '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean) as EventType[])
  const [selectedTypes, setSelectedTypes] = useState<EventType[]>(
    initialTypes.length ? initialTypes : ['admin_action', 'submission', 'peer_review', 'xp_transaction']
  )
  const initialSortByParam = sp.get('sortBy')
  const initialSortBy: 'createdAt' | 'action' = initialSortByParam === 'action' ? 'action' : 'createdAt'
  const [sortBy, setSortBy] = useState<'createdAt' | 'action'>(initialSortBy)
  const initialSortDirParam = sp.get('sortDir')
  const initialSortDir: 'asc' | 'desc' = initialSortDirParam === 'asc' ? 'asc' : 'desc'
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(initialSortDir)

  const dateRange = useMemo(() => {
    if (timeframe === 'all') return { dateFrom: undefined, dateTo: undefined }
    const to = new Date()
    const from = new Date()
    if (timeframe === '24h') from.setDate(to.getDate() - 1)
    if (timeframe === '7d') from.setDate(to.getDate() - 7)
    if (timeframe === '30d') from.setDate(to.getDate() - 30)
    return { dateFrom: from.toISOString(), dateTo: to.toISOString() }
  }, [timeframe])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      params.set('sortBy', sortBy)
      params.set('sortDir', sortDir)
      if (q) params.set('q', q)
      if (selectedTypes.length > 0) params.set('eventTypes', selectedTypes.join(','))
      if (dateRange.dateFrom) params.set('dateFrom', dateRange.dateFrom)
      if (dateRange.dateTo) params.set('dateTo', dateRange.dateTo)

      const res = await fetch(`/api/admin/logs?${params.toString()}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || 'Failed to load logs')

      setItems(data.items || [])
      setTotal(data.total || 0)
    } catch (err) {
      console.error('Failed to load logs', err)
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchLogs()
    // Reflect in URL (lightweight sync for shareability)
    const params = new URLSearchParams()
    params.set('page', String(page))
    params.set('timeframe', timeframe)
    if (q) params.set('q', q)
    if (selectedTypes.length > 0) params.set('eventTypes', selectedTypes.join(','))
    params.set('sortBy', sortBy)
    params.set('sortDir', sortDir)
    const qs = params.toString()
    router.replace(`/admin/logs?${qs}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, timeframe, q, selectedTypes.join(','), sortBy, sortDir])

  const toggleType = (t: EventType) => {
    setPage(1)
    setSelectedTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]))
  }

  const onSort = (field: 'createdAt' | 'action') => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(field)
      setSortDir('desc')
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))

  return (
    <AuthGuard>
      <AdminGuard>
    <div className="container mx-auto px-4 pt-6 pb-28 md:pb-6 overflow-x-hidden">
      <Card className="border-0 shadow-xl">
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ListFilter className="h-5 w-5" /> Audit Logs
              </CardTitle>
              <CardDescription>Monitor key actions and events across the platform. Filter and sort to investigate changes.</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={fetchLogs} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
            <div className="flex-1 flex items-center gap-2">
              <div className="relative w-full md:w-96">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => {
                    setPage(1)
                    setQ(e.target.value)
                  }}
                  placeholder="Search actions, targets, details"
                  className="pl-8"
                />
              </div>
              <Select value={timeframe} onValueChange={(v: string) => { setPage(1); setTimeframe((v === '24h' || v === '7d' || v === '30d' || v === 'all') ? v : '7d') }}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Timeframe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="24h">Last 24h</SelectItem>
                  <SelectItem value="7d">Last 7 days</SelectItem>
                  <SelectItem value="30d">Last 30 days</SelectItem>
                  <SelectItem value="all">All time</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 overflow-x-auto md:overflow-visible flex-nowrap md:flex-wrap max-w-full">
              {(['admin_action', 'submission', 'peer_review', 'xp_transaction'] as EventType[]).map((t) => {
                const meta = EVENT_TYPE_META[t]
                const Icon = meta.icon
                const active = selectedTypes.includes(t)
                return (
                  <button
                    key={t}
                    onClick={() => toggleType(t)}
                    aria-pressed={active}
                    className={`inline-flex shrink-0 items-center gap-1 px-3 py-1.5 rounded-full border text-sm transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-primary/10 text-primary border-primary/20 ring-1 ring-primary/30'
                        : 'border-muted text-muted-foreground hover:bg-muted/40'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" /> {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Logs */}
          <div className="border rounded-lg overflow-hidden">
            <div className="hidden xl:block bg-muted/40 px-4 py-2 border-b">
              <div className="grid grid-cols-12 gap-4 font-medium text-sm">
                <button
                  type="button"
                  onClick={() => onSort('createdAt')}
                  className="col-span-3 flex items-center gap-1 text-left text-foreground transition-colors hover:text-foreground/80"
                >
                  <Calendar className="h-4 w-4" />
                  Time
                  {sortBy === 'createdAt' && (sortDir === 'desc' ? <SortDesc className="h-3.5 w-3.5 ml-1" /> : <SortAsc className="h-3.5 w-3.5 ml-1" />)}
                </button>
                <button
                  type="button"
                  onClick={() => onSort('action')}
                  className="col-span-3 flex items-center gap-1 text-left text-foreground transition-colors hover:text-foreground/80"
                >
                  <Filter className="h-4 w-4" />
                  Event
                  {sortBy === 'action' && (sortDir === 'desc' ? <SortDesc className="h-3.5 w-3.5 ml-1" /> : <SortAsc className="h-3.5 w-3.5 ml-1" />)}
                </button>
                <div className="col-span-3">Actor</div>
                <div className="col-span-3">Target</div>
              </div>
            </div>

            <div className="hidden xl:block max-h-[70vh] overflow-y-auto">
              <Table>
                <TableHeader className="sr-only">
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Target</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-6 text-muted-foreground">Loading logs…</TableCell>
                    </TableRow>
                  ) : items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No logs found for current filters.</TableCell>
                    </TableRow>
                  ) : (
                    items.map((row) => {
                      const meta = EVENT_TYPE_META[row.eventType]
                      const Icon = meta.icon
                      return (
                        <TableRow key={row.id} className="hover:bg-muted/30">
                          <TableCell className="align-top">
                            <div className="text-sm font-medium text-foreground whitespace-nowrap">
                              {new Date(row.createdAt).toLocaleString()}
                            </div>
                            {row.summary && (
                              <div className="text-xs text-muted-foreground">{row.summary}</div>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex items-center gap-2">
                              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs ${meta.badgeClass}`}>
                                <Icon className="h-3.5 w-3.5" />
                                {meta.label}
                              </span>
                              <span className="text-sm font-medium truncate max-w-[240px] lg:max-w-[360px] xl:max-w-none">{row.action}</span>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            {row.actor ? (
                              <div className="text-sm">
                                <span className="font-medium">{row.actor.name || row.actor.id}</span>
                                {row.actor.role && (
                                  <Badge variant="secondary" className="ml-2 text-[10px]">{row.actor.role}</Badge>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="text-sm">
                              <span className="font-medium capitalize">{row.target?.type || '—'}</span>
                              {row.target?.label && (
                                <span className="text-xs text-muted-foreground block truncate">{row.target.label}</span>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="xl:hidden p-4 overflow-x-hidden">
              {loading ? (
                <div className="rounded-lg border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                  Loading logs…
                </div>
              ) : items.length === 0 ? (
                <div className="rounded-lg border bg-muted/20 px-4 py-6 text-center text-sm text-muted-foreground">
                  No logs found for current filters.
                </div>
              ) : (
                <div className="space-y-3 w-full">
                  {items.map((row) => {
                    const meta = EVENT_TYPE_META[row.eventType]
                    const Icon = meta.icon
                    return (
                      <div key={row.id} className="rounded-lg border bg-card text-card-foreground p-4 shadow-sm overflow-hidden">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0 max-w-full">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs ${meta.badgeClass}`}>
                              <Icon className="h-3.5 w-3.5" />
                              {meta.label}
                            </span>
                            <span className="text-sm font-semibold text-foreground break-all max-w-full">{row.action}</span>
                          </div>
                          <time dateTime={row.createdAt} className="text-xs text-muted-foreground">
                            {new Date(row.createdAt).toLocaleString()}
                          </time>
                        </div>
                        {row.summary && (
                          <p className="mt-2 text-sm text-muted-foreground break-words break-all">{row.summary}</p>
                        )}
                        <dl className="mt-3 space-y-3 text-sm">
                          <div>
                            <dt className="text-xs font-medium uppercase text-muted-foreground">Actor</dt>
                            <dd className="mt-1">
                              {row.actor ? (
                                <div className="text-sm text-foreground">
                                  <span className="font-medium">{row.actor.name || row.actor.id}</span>
                                  {row.actor.role && (
                                    <Badge variant="secondary" className="ml-2 text-[10px]">{row.actor.role}</Badge>
                                  )}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium uppercase text-muted-foreground">Target</dt>
                            <dd className="mt-1">
                              <div className="text-sm text-foreground">
                                <span className="font-medium capitalize">{row.target?.type || '-'}</span>
                                {row.target?.label && (
                                  <span className="block text-xs text-muted-foreground break-all">{row.target.label}</span>
                                )}
                              </div>
                            </dd>
                          </div>
                        </dl>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Pagination */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
            <div className="text-sm text-muted-foreground">{total.toLocaleString()} results</div>
            <Pagination
              pagination={{
                page,
                limit,
                totalCount: total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPrevPage: page > 1,
              }}
              onPageChange={(p) => setPage(p)}
              onLimitChange={(l) => { setPage(1); setLimit(l) }}
              showPageSizeSelector
            />
          </div>
        </CardContent>
      </Card>
    </div>
      </AdminGuard>
    </AuthGuard>
  )
}
