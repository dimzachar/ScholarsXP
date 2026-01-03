"use client"
import { useEffect, useMemo, useState } from 'react'
import { useAuthenticatedFetch } from '@/hooks/useAuthenticatedFetch'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Users, Zap, TrendingUp, Crown, Medal, Award } from 'lucide-react'

type Standing = {
  userId: string
  total: number
  user?: { id: string; username: string | null; email?: string; profileImageUrl?: string | null }
}

function formatMonthLabel(month: string) {
  const [y, m] = month.split('-').map(Number)
  const date = new Date(Date.UTC(y, (m - 1), 1))
  return date.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

export default function MonthlyLeaderboard() {
  const { authenticatedFetch } = useAuthenticatedFetch()
  const [months, setMonths] = useState<string[]>([])
  const [activeMonth, setActiveMonth] = useState<string>('')
  const [standings, setStandings] = useState<Standing[]>([])
  const [winners, setWinners] = useState<unknown[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const run = async () => {
      const res = await authenticatedFetch('/api/leaderboard/months')
      const json = await res.json()
      const list: string[] = json?.data?.months || []
      setMonths(list)
      if (list.length && !activeMonth) setActiveMonth(list[0])
    }
    run()
  }, [authenticatedFetch])

  useEffect(() => {
    if (!activeMonth) return
    setLoading(true)
    const run = async () => {
      const res = await authenticatedFetch(`/api/leaderboard/month?month=${activeMonth}`)
      const json = await res.json()
      setStandings(json?.data?.items || [])
      setWinners(json?.data?.winners || [])
      setLoading(false)
    }
    run()
  }, [activeMonth, authenticatedFetch])

  const tabItems = useMemo(() => months.map((m) => (
    <TabsTrigger key={m} value={m}>{formatMonthLabel(m)}</TabsTrigger>
  )), [months])

  return (
    <Card className="border-0 shadow-xl">
      <CardHeader>
        <CardTitle>Monthly Leaderboards</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs value={activeMonth} onValueChange={setActiveMonth} className="w-full space-y-6">
          <TabsList className="flex-wrap gap-2">
            {tabItems}
          </TabsList>

          {months.map((m) => (
            <TabsContent key={m} value={m} className="space-y-6">
              {/* Stat cards aligned with other tabs */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-primary/20 rounded-lg">
                        <Users className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{standings.length}</p>
                        <p className="text-muted-foreground">Active Participants</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-secondary/20 rounded-lg">
                        <Zap className="h-6 w-6 text-secondary-foreground" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{standings.reduce((s, r) => s + (r.total || 0), 0).toLocaleString()}</p>
                        <p className="text-muted-foreground">Total XP Awarded</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                  <CardContent className="p-6">
                    <div className="flex items-center space-x-4">
                      <div className="p-3 bg-accent/20 rounded-lg">
                        <TrendingUp className="h-6 w-6 text-accent-foreground" />
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-foreground">{standings.length ? Math.round(standings.reduce((s, r) => s + (r.total || 0), 0) / standings.length).toLocaleString() : 0}</p>
                        <p className="text-muted-foreground">Average XP</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Winners badges (Top 3) */}
              {winners && winners.length && winners[0].month === m ? (
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="mr-2">Best of {formatMonthLabel(m)}</Badge>
                  {winners.sort((a,b) => (a.rank||0) - (b.rank||0)).map((w) => {
                    const entry = standings.find(s => s.userId === w.userId)
                    const username = entry?.user?.username || w.userId
                    const label = `#${w.rank} · ${(w.xpAwarded || (w.rank===1?2000:w.rank===2?1500:1000)).toLocaleString()} XP`
                    return (
                      <div key={w.id} className="flex items-center gap-2 px-3 py-1 rounded-full bg-muted/60">
                        {w.rank === 1 ? (
                          <Crown className="h-4 w-4 text-primary" />
                        ) : w.rank === 2 ? (
                          <Medal className="h-4 w-4 text-muted-foreground" />
                        ) : w.rank === 3 ? (
                          <Award className="h-4 w-4 text-secondary-foreground" />
                        ) : null}
                        <span className="text-sm font-medium">{username}</span>
                        <span className="text-xs text-muted-foreground">{label}</span>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {/* Standings list styled like other tabs */}
              <Card className="border-0 shadow-xl">
                <CardHeader>
                  <CardTitle>{formatMonthLabel(m)} Rankings</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-muted-foreground">Loading...</div>
                  ) : standings.length ? (
                    <div className="space-y-4">
                      {standings.map((s, i) => {
                        const username = s.user?.username || s.userId
                        const rank = i + 1
                        return (
                          <div key={s.userId + i} className="flex items-center space-x-4 p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                            <div className="flex items-center justify-center w-10 h-10">
                              {rank === 1 ? (
                                <Crown className="h-5 w-5 text-primary" />
                              ) : rank === 2 ? (
                                <Medal className="h-5 w-5 text-muted-foreground" />
                              ) : rank === 3 ? (
                                <Award className="h-5 w-5 text-secondary-foreground" />
                              ) : (
                                <span className="text-sm font-bold text-muted-foreground">#{rank}</span>
                              )}
                            </div>
                            <Avatar className="h-10 w-10">
                              <AvatarImage src={s.user?.profileImageUrl || undefined} />
                              <AvatarFallback className="bg-primary text-primary-foreground">
                                {username.slice(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <p className="font-semibold">{username}</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-primary">{s.total.toLocaleString()} XP</p>
                              <p className="text-xs text-muted-foreground">this month</p>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="text-muted-foreground">No activity.</div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  )
}
