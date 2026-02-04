'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pagination } from '@/components/ui/pagination'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { 
  Trophy, 
  Calendar, 
  Filter, 
  RefreshCw, 
  Search, 
  User as UserIcon,
  TrendingUp,
  ArrowRight
} from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import AuthGuard from '@/components/Auth/AuthGuard'
import { AdminGuard } from '@/components/Auth/RoleGuard'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'


interface Promotion {
  id: string
  date: string
  user: {
    username: string
    avatarUrl?: string
    totalXp: number
  }
  promotion: {
    oldRank: string
    newRank: string
    oldCategory: string
    newCategory: string
    xpAtPromotion: number
  }
  isBackfill: boolean
}

const CATEGORY_COLORS: Record<string, string> = {
  'None': 'bg-gray-400',
  'Initiate': 'bg-slate-500',
  'Apprentice': 'bg-orange-500',
  'Journeyman': 'bg-blue-500',
  'Erudite': 'bg-violet-500',
  'Master': 'bg-yellow-500'
}

const CATEGORY_EMOJIS: Record<string, string> = {
  'None': '○',
  'Initiate': '🌱',
  'Apprentice': '🔥',
  'Journeyman': '🧭',
  'Erudite': '📚',
  'Master': '👑'
}

export default function AdminPromotionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { authenticatedFetch } = useAuthenticatedFetch()
  
  const [items, setItems] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(() => parseInt(searchParams.get('page') || '1', 10))
  const [limit, setLimit] = useState(50)
  const [total, setTotal] = useState(0)
  const [category, setCategory] = useState(searchParams.get('category') || 'all')
  const [q, setQ] = useState('')
  
  const totalPages = useMemo(() => Math.ceil(total / limit), [total, limit])
  
  const fetchPromotions = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('page', String(page))
      params.set('limit', String(limit))
      if (category && category !== 'all') params.set('category', category)
      if (q) params.set('userId', q)
      
      const response = await authenticatedFetch(`/api/admin/promotions?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to fetch')
      
      const data = await response.json()
      setItems(data.data.promotions)
      setTotal(data.data.pagination.total)
    } catch (error) {
      console.error('Failed to fetch promotions:', error)
    } finally {
      setLoading(false)
    }
  }, [page, limit, category, q, authenticatedFetch])
  
  useEffect(() => {
    fetchPromotions()
  }, [fetchPromotions])
  
  const onPageChange = (newPage: number) => {
    setPage(newPage)
    const params = new URLSearchParams(searchParams.toString())
    params.set('page', String(newPage))
    router.push(`?${params.toString()}`)
  }
  
  const onCategoryChange = (value: string) => {
    setCategory(value)
    setPage(1)
    const params = new URLSearchParams(searchParams.toString())
    if (value && value !== 'all') {
      params.set('category', value)
    } else {
      params.delete('category')
    }
    params.set('page', '1')
    router.push(`?${params.toString()}`)
  }
  
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }
  
  return (
    <AuthGuard>
      <AdminGuard>
        <div className="container mx-auto py-8 px-4 max-w-7xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Trophy className="h-8 w-8 text-yellow-500" />
              Role Promotions
            </h1>
            <p className="text-muted-foreground mt-1">
              Track users who achieved main Discord role promotions
            </p>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Promotions</p>
                    <p className="text-2xl font-bold">{total}</p>
                  </div>
                  <Trophy className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">This Month</p>
                    <p className="text-2xl font-bold">
                      {items.filter(i => {
                        const d = new Date(i.date)
                        const now = new Date()
                        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
                      }).length}
                    </p>
                  </div>
                  <Calendar className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Latest</p>
                    <p className="text-lg font-bold truncate max-w-[150px]">
                      {items[0]?.user.username || '—'}
                    </p>
                  </div>
                  <TrendingUp className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Top Category</p>
                    <p className="text-lg font-bold">
                      {items.length > 0 
                        ? (() => {
                            const counts: Record<string, number> = {}
                            items.forEach(i => {
                              counts[i.promotion.newCategory] = (counts[i.promotion.newCategory] || 0) + 1
                            })
                            const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
                            return top ? top[0] : '—'
                          })()
                        : '—'
                      }
                    </p>
                  </div>
                  <UserIcon className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Filters */}
          <Card className="mb-6">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by user ID..."
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <Select value={category} onValueChange={onCategoryChange}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Roles</SelectItem>
                    <SelectItem value="Initiate">🌱 Initiate (First)</SelectItem>
                    <SelectItem value="Apprentice">🔥 Apprentice</SelectItem>
                    <SelectItem value="Journeyman">🧭 Journeyman</SelectItem>
                    <SelectItem value="Erudite">📚 Erudite</SelectItem>
                    <SelectItem value="Master">👑 Master</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button 
                  variant="outline" 
                  onClick={fetchPromotions}
                  disabled={loading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardContent>
          </Card>
          
          {/* Promotions Table */}
          <Card>
            <CardHeader>
              <CardTitle>Promotion History</CardTitle>
              <CardDescription>
                Main Discord role promotions (category changes only)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead>Promotion</TableHead>
                      <TableHead>XP at Promotion</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {loading ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8">
                          <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                          <p className="text-muted-foreground">Loading promotions...</p>
                        </TableCell>
                      </TableRow>
                    ) : items.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                          <Trophy className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No promotions found for current filters.</p>
                        </TableCell>
                      </TableRow>
                    ) : (
                      items.map((promo) => (
                        <TableRow key={promo.id}>
                          <TableCell className="whitespace-nowrap">
                            {formatDate(promo.date)}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-3">
                              {promo.user.avatarUrl ? (
                                <img 
                                  src={promo.user.avatarUrl} 
                                  alt={promo.user.username}
                                  className="w-8 h-8 rounded-full"
                                />
                              ) : (
                                <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
                                  <UserIcon className="h-4 w-4" />
                                </div>
                              )}
                              <div>
                                <span className="font-medium">
                                  {promo.user.username}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Badge variant="secondary" className="gap-1">
                                {CATEGORY_EMOJIS[promo.promotion.oldCategory] || '•'}
                                {promo.promotion.oldCategory}
                              </Badge>
                              <ArrowRight className="h-4 w-4 text-muted-foreground" />
                              <Badge className={`gap-1 ${CATEGORY_COLORS[promo.promotion.newCategory] || 'bg-gray-500'} text-white`}>
                                {CATEGORY_EMOJIS[promo.promotion.newCategory] || '•'}
                                {promo.promotion.newCategory}
                              </Badge>
                            </div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {promo.promotion.oldRank} → {promo.promotion.newRank}
                            </div>
                          </TableCell>
                          <TableCell>
                            <span className="font-mono">{promo.promotion.xpAtPromotion.toLocaleString()}</span>
                            <span className="text-xs text-muted-foreground ml-1">XP</span>
                          </TableCell>
                          <TableCell>
                            {promo.isBackfill ? (
                              <Badge variant="outline" className="text-xs">Backfilled</Badge>
                            ) : (
                              <Badge variant="default" className="text-xs bg-green-600">Live</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
              
              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-2">
                  <div className="text-sm text-muted-foreground">
                    Showing {(page - 1) * limit + 1} to {Math.min(page * limit, total)} of {total} promotions
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPageChange(page - 1)}
                      disabled={page === 1 || loading}
                    >
                      Previous
                    </Button>
                    <span className="text-sm px-2">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onPageChange(page + 1)}
                      disabled={page === totalPages || loading}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Legend */}
          <div className="mt-6 p-4 bg-muted rounded-lg">
            <h3 className="font-medium mb-2">Discord Roles</h3>
            <div className="flex flex-wrap gap-3">
              {Object.entries(CATEGORY_EMOJIS)
                .filter(([category]) => category !== 'None')
                .map(([category, emoji]) => (
                  <div key={category} className="flex items-center gap-1 text-sm">
                    <span>{emoji}</span>
                    <span className="font-medium">{category}</span>
                  </div>
                ))}
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              This page only shows promotions between main Discord roles. Tier promotions (Bronze → Silver → Gold, etc.) are not shown here.
            </p>
          </div>
        </div>
      </AdminGuard>
    </AuthGuard>
  )
}
