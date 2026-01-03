import React from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    LayoutDashboard,
    Vote,
    Search,
    Bell,
    RefreshCw,
    Users,
    AlertTriangle,
    TrendingUp,
    ExternalLink
} from 'lucide-react'
import { ActiveVote } from '@/app/admin/live-monitor/types'

interface LiveDashboardProps {
    data: {
        activeVotes: ActiveVote[]
        voteStats?: {
            global: {
                totalVotes: number
                totalHighVotes: number
                totalLowVotes: number
                highVotePct: number
                uniqueVoters: number
                flaggedVoters: number
                avgVotesPerUser: number
            }
            voters: Array<{
                wallet: string
                totalVotes: number
                highVotes: number
                lowVotes: number
                highPct: number
                avgTime: number | null
                flagged: boolean
                flags: string[]
            }>
            hourlyVelocity: Array<{ hour: number; label: string; count: number }>
            peakVPH: number
            peakHourLabel: string | null
            clickAnalytics?: {
                totalEvents: number
                positionBias: { leftClicks: number; rightClicks: number; leftPct: number }
                xpBias: { clickedHighXp: number; clickedLowXp: number; highXpPct: number }
                timeSpentBuckets: { under5: number; '5to15': number; '15to30': number; '30to60': number; over60: number }
                skipCount: number
                avgTimeSpentMs: number
            }
        }
    } | null
    onRefresh: () => void
    loading: boolean
    onViewChange: (view: 'dashboard' | 'feed' | 'watchlist') => void
}

export function LiveDashboard({ data, onRefresh, loading, onViewChange }: LiveDashboardProps) {
    // Calculate real stats
    const totalVotes = data?.activeVotes.reduce((acc, vote) => acc + vote.voteCount, 0) || 0
    const activeCases = data?.activeVotes.length || 0
    const voteStats = data?.voteStats

    return (
        <div className="flex h-screen bg-background overflow-hidden font-sans text-foreground">
            {/* Sidebar */}
            <aside className="w-64 bg-card border-r border-border flex flex-col z-20 hidden md:flex shrink-0">
                <div className="h-16 flex items-center px-6 border-b border-border">
                    <div className="flex items-center gap-2 text-primary">
                        <Vote className="h-8 w-8" />
                        <span className="text-xl font-bold tracking-tight text-foreground">ConsensusLive</span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-6">
                    {/* Navigation Links */}
                    <nav className="flex flex-col gap-1">
                        <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Main Menu</p>
                        <Button variant="ghost" className="justify-start gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary">
                            <LayoutDashboard className="h-5 w-5" />
                            <span className="text-sm font-medium">Dashboard</span>
                        </Button>
                        <Button variant="ghost" className="justify-start gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted" onClick={() => onViewChange('feed')}>
                            <Vote className="h-5 w-5" />
                            <span className="text-sm font-medium">Activity Feed</span>
                        </Button>
                        <Button variant="ghost" className="justify-start gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted" onClick={() => onViewChange('watchlist')}>
                            <Users className="h-5 w-5" />
                            <span className="text-sm font-medium">Reviewers</span>
                        </Button>
                    </nav>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative">
                {/* Top Header */}
                <header className="h-16 flex items-center justify-between px-6 border-b border-border bg-card shrink-0 z-10">
                    {/* Search Bar */}
                    <div className="hidden md:flex flex-1 max-w-lg">
                        <label className="relative flex w-full items-center">
                            <span className="absolute left-3 text-muted-foreground">
                                <Search className="h-5 w-5" />
                            </span>
                            <input className="w-full bg-muted/50 text-foreground border-none rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-primary placeholder-muted-foreground outline-none" placeholder="Search cases..." type="text" />
                        </label>
                    </div>
                    {/* Right Actions */}
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
                            <Bell className="h-6 w-6" />
                        </Button>
                    </div>
                </header>

                {/* Scrollable Area */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-background">
                    <div className="max-w-[1400px] mx-auto flex flex-col gap-8">
                        {/* Page Heading & Actions */}
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                            <div>
                                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-foreground mb-2">Live Voting Grid</h1>
                                <p className="text-muted-foreground">Real-time consensus tracking across active divergent cases.</p>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    className="bg-primary hover:bg-primary/90 text-primary-foreground px-4 py-2 rounded-lg font-medium shadow-lg transition-all flex items-center gap-2"
                                    onClick={onRefresh}
                                    disabled={loading}
                                >
                                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                                    Refresh Data
                                </Button>
                            </div>
                        </div>

                        {/* Stats Row */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                            <StatsCard icon={<Vote className="h-6 w-6" />} color="blue" label="Active Cases" value={activeCases} />
                            <StatsCard icon={<Users className="h-6 w-6" />} color="purple" label="Total Votes" value={voteStats?.global.totalVotes || totalVotes} />
                            <StatsCard icon={<Users className="h-6 w-6" />} color="green" label="Unique Voters" value={voteStats?.global.uniqueVoters || 0} />
                            <StatsCard icon={<TrendingUp className="h-6 w-6" />} color="cyan" label="Avg Votes/User" value={(voteStats?.global.avgVotesPerUser || 0).toFixed(1)} />
                            <StatsCard icon={<AlertTriangle className="h-6 w-6" />} color="orange" label="Flagged Voters" value={voteStats?.global.flaggedVoters || 0} />
                        </div>

                        {/* Vote Bias Section */}
                        {voteStats && (
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Global Vote Split - New Design */}
                                <Card className="p-6">
                                    <h3 className="text-lg font-bold text-foreground mb-6">Global Vote Split</h3>
                                    <div className="space-y-6">
                                        {/* High XP Option */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-foreground font-medium">High XP</span>
                                                <span className="text-2xl font-bold text-foreground">{voteStats.global.highVotePct.toFixed(0)}%</span>
                                            </div>
                                            <div className="h-3 bg-muted rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-primary rounded-full transition-all" 
                                                    style={{ width: `${voteStats.global.highVotePct}%` }} 
                                                />
                                            </div>
                                            <p className="text-sm text-muted-foreground">{voteStats.global.totalHighVotes.toLocaleString()} votes</p>
                                        </div>
                                        
                                        {/* Low XP Option */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center">
                                                <span className="text-foreground font-medium">Low XP</span>
                                                <span className="text-2xl font-bold text-foreground">{(100 - voteStats.global.highVotePct).toFixed(0)}%</span>
                                            </div>
                                            <div className="h-3 bg-muted rounded-full overflow-hidden">
                                                <div 
                                                    className="h-full bg-purple-500 rounded-full transition-all" 
                                                    style={{ width: `${100 - voteStats.global.highVotePct}%` }} 
                                                />
                                            </div>
                                            <p className="text-sm text-muted-foreground">{voteStats.global.totalLowVotes.toLocaleString()} votes</p>
                                        </div>
                                    </div>
                                    {/* Bias insight */}
                                    <p className="text-xs text-muted-foreground mt-4 pt-4 border-t border-border">
                                        {voteStats.global.highVotePct > 55 
                                            ? `⚠️ Voters choose high XP ${(voteStats.global.highVotePct - 50).toFixed(0)}% more often`
                                            : voteStats.global.highVotePct < 45
                                            ? `⚠️ Voters choose low XP ${(50 - voteStats.global.highVotePct).toFixed(0)}% more often`
                                            : '✓ Voting distribution is balanced'
                                        }
                                    </p>
                                </Card>

                                {/* Voting Velocity Chart */}
                                <Card className="p-6 lg:col-span-2">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h3 className="text-lg font-bold text-foreground">Voting Velocity</h3>
                                            <p className="text-sm text-muted-foreground">Votes per hour over the last 24 hours</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold text-foreground">{voteStats.peakVPH}</p>
                                            <p className="text-xs text-muted-foreground">peak VPH</p>
                                        </div>
                                    </div>
                                    <div className="h-32 flex items-end gap-1">
                                        {voteStats.hourlyVelocity.map((hour, i) => {
                                            const heightPct = voteStats.peakVPH > 0 ? (hour.count / voteStats.peakVPH) * 100 : 0
                                            const isPeak = hour.count === voteStats.peakVPH && hour.count > 0
                                            return (
                                                <div key={i} className="flex-1 flex flex-col items-center group relative">
                                                    <div 
                                                        className={`w-full rounded-t transition-all ${isPeak ? 'bg-primary' : 'bg-primary/40 hover:bg-primary/60'}`}
                                                        style={{ height: `${Math.max(heightPct, 2)}%` }}
                                                        title={`${hour.label}: ${hour.count} votes`}
                                                    />
                                                    {/* Tooltip on hover */}
                                                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-10">
                                                        {hour.label}: {hour.count} votes
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <div className="flex justify-between mt-2 text-xs text-muted-foreground">
                                        <span>00:00</span>
                                        <span>06:00</span>
                                        <span>12:00</span>
                                        <span>18:00</span>
                                        <span>24:00</span>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* Click Analytics - Position Heatmap & Time Spent */}
                        {voteStats?.clickAnalytics && voteStats.clickAnalytics.totalEvents > 0 && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                {/* Position Bias Heatmap */}
                                <Card className="p-6">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Position Bias</h3>
                                    <div className="flex gap-4 mb-4">
                                        <div className="flex-1 text-center">
                                            <div 
                                                className="h-20 rounded-lg flex items-center justify-center text-2xl font-bold transition-all"
                                                style={{ 
                                                    backgroundColor: `rgba(var(--primary-rgb, 59, 130, 246), ${Math.min(voteStats.clickAnalytics.positionBias.leftPct / 100, 1)})`,
                                                    color: voteStats.clickAnalytics.positionBias.leftPct > 50 ? 'white' : 'inherit'
                                                }}
                                            >
                                                {voteStats.clickAnalytics.positionBias.leftPct.toFixed(0)}%
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-2">Left clicks</p>
                                            <p className="text-sm font-medium">{voteStats.clickAnalytics.positionBias.leftClicks}</p>
                                        </div>
                                        <div className="flex-1 text-center">
                                            <div 
                                                className="h-20 rounded-lg flex items-center justify-center text-2xl font-bold transition-all"
                                                style={{ 
                                                    backgroundColor: `rgba(168, 85, 247, ${Math.min((100 - voteStats.clickAnalytics.positionBias.leftPct) / 100, 1)})`,
                                                    color: voteStats.clickAnalytics.positionBias.leftPct < 50 ? 'white' : 'inherit'
                                                }}
                                            >
                                                {(100 - voteStats.clickAnalytics.positionBias.leftPct).toFixed(0)}%
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-2">Right clicks</p>
                                            <p className="text-sm font-medium">{voteStats.clickAnalytics.positionBias.rightClicks}</p>
                                        </div>
                                    </div>
                                    <p className="text-xs text-muted-foreground text-center">
                                        {Math.abs(voteStats.clickAnalytics.positionBias.leftPct - 50) > 10 
                                            ? `⚠️ Users prefer ${voteStats.clickAnalytics.positionBias.leftPct > 50 ? 'left' : 'right'} side`
                                            : '✓ No significant position bias'
                                        }
                                    </p>
                                </Card>

                                {/* Time Spent Distribution */}
                                <Card className="p-6">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Time to Vote</h3>
                                    <div className="space-y-2">
                                        {[
                                            { label: '<5s', value: voteStats.clickAnalytics.timeSpentBuckets.under5, color: 'bg-red-500' },
                                            { label: '5-15s', value: voteStats.clickAnalytics.timeSpentBuckets['5to15'], color: 'bg-yellow-500' },
                                            { label: '15-30s', value: voteStats.clickAnalytics.timeSpentBuckets['15to30'], color: 'bg-green-500' },
                                            { label: '30-60s', value: voteStats.clickAnalytics.timeSpentBuckets['30to60'], color: 'bg-blue-500' },
                                            { label: '>60s', value: voteStats.clickAnalytics.timeSpentBuckets.over60, color: 'bg-purple-500' },
                                        ].map((bucket) => {
                                            const total = Object.values(voteStats.clickAnalytics!.timeSpentBuckets).reduce((a, b) => a + b, 0)
                                            const pct = total > 0 ? (bucket.value / total) * 100 : 0
                                            return (
                                                <div key={bucket.label} className="flex items-center gap-2 text-xs">
                                                    <span className="w-12 text-muted-foreground">{bucket.label}</span>
                                                    <div className="flex-1 h-4 bg-muted rounded-full overflow-hidden">
                                                        <div className={`h-full ${bucket.color}`} style={{ width: `${pct}%` }} />
                                                    </div>
                                                    <span className="w-8 text-right text-muted-foreground">{bucket.value}</span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                    <p className="text-xs text-muted-foreground text-center mt-3">
                                        Avg: {(voteStats.clickAnalytics.avgTimeSpentMs / 1000).toFixed(1)}s
                                    </p>
                                </Card>

                                {/* Skip & XP Bias Stats */}
                                <Card className="p-6">
                                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Behavior Stats</h3>
                                    <div className="space-y-4">
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-muted-foreground">Chose High XP</span>
                                                <span className="font-medium">{voteStats.clickAnalytics.xpBias.highXpPct.toFixed(0)}%</span>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full bg-green-500" style={{ width: `${voteStats.clickAnalytics.xpBias.highXpPct}%` }} />
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-sm mb-1">
                                                <span className="text-muted-foreground">Chose Low XP</span>
                                                <span className="font-medium">{(100 - voteStats.clickAnalytics.xpBias.highXpPct).toFixed(0)}%</span>
                                            </div>
                                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                                                <div className="h-full bg-red-500" style={{ width: `${100 - voteStats.clickAnalytics.xpBias.highXpPct}%` }} />
                                            </div>
                                        </div>
                                        <div className="pt-2 border-t border-border">
                                            <div className="flex justify-between text-sm">
                                                <span className="text-muted-foreground">Skipped cases</span>
                                                <span className="font-medium">{voteStats.clickAnalytics.skipCount}</span>
                                            </div>
                                        </div>
                                    </div>
                                </Card>
                            </div>
                        )}

                        {/* Flagged Voters */}
                        {voteStats && voteStats.voters.filter(v => v.flagged).length > 0 && (
                            <Card className="p-6">
                                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">
                                    Flagged Voters ({voteStats.voters.filter(v => v.flagged).length})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {voteStats.voters.filter(v => v.flagged).slice(0, 6).map((voter, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm p-3 bg-destructive/5 border border-destructive/20 rounded-lg">
                                            <span className="font-mono text-xs">{voter.wallet}</span>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs text-muted-foreground">{voter.totalVotes} votes</span>
                                                <Badge variant="destructive" className="text-[10px]">
                                                    {voter.highPct.toFixed(0)}% high
                                                </Badge>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        )}

                        {/* Card Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
                            {data?.activeVotes.map((vote) => (
                                <VoteCard key={vote.id} vote={vote} />
                            ))}
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}

function StatsCard({ icon, color, label, value }: { 
    icon: React.ReactNode
    color: string
    label: string
    value: string | number 
}) {
    const colorClasses: Record<string, string> = {
        blue: 'text-blue-500 bg-blue-500/10',
        purple: 'text-purple-500 bg-purple-500/10',
        green: 'text-green-500 bg-green-500/10',
        orange: 'text-orange-500 bg-orange-500/10',
        cyan: 'text-cyan-500 bg-cyan-500/10',
    }

    return (
        <div className="bg-card p-5 rounded-xl border border-border shadow-sm">
            <div className="flex justify-between items-start mb-4">
                <div className={`p-2 rounded-lg ${colorClasses[color]}`}>
                    {icon}
                </div>
            </div>
            <p className="text-muted-foreground text-sm font-medium">{label}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
        </div>
    )
}

function VoteCard({ vote }: { vote: ActiveVote }) {
    // Consensus requires 50 votes (from vote-consensus.ts MIN_VOTES_FOR_CONSENSUS)
    const targetVotes = 50
    const progress = Math.min((vote.voteCount / targetVotes) * 100, 100)

    // Calculate percentages from voteDistribution
    const totalVotes = Object.values(vote.voteDistribution).reduce((a, b) => a + b, 0) || 0
    const distribution = Object.entries(vote.voteDistribution).map(([label, count]) => ({
        label: `${label} XP`,
        count,
        percentage: totalVotes > 0 ? (count / totalVotes) * 100 : 0
    }))

    // Extract domain from URL for display
    const getDisplayUrl = (url: string) => {
        try {
            const urlObj = new URL(url)
            return urlObj.hostname + urlObj.pathname.slice(0, 30) + (urlObj.pathname.length > 30 ? '...' : '')
        } catch {
            return url.slice(0, 50) + (url.length > 50 ? '...' : '')
        }
    }

    return (
        <article className="group bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col gap-4 relative overflow-hidden hover:border-primary">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary">
                        Live
                    </span>
                    <span className="text-xs font-mono text-muted-foreground">#{vote.id.slice(0, 8)}</span>
                </div>
                <a 
                    href={vote.url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-sm font-semibold text-foreground leading-tight hover:text-primary transition-colors flex items-center gap-1"
                >
                    {getDisplayUrl(vote.url)}
                    <ExternalLink className="h-3 w-3 opacity-50" />
                </a>
            </div>
            
            <p className="text-sm text-muted-foreground">
                {vote.conflictSummary}
            </p>

            <div className="flex flex-col gap-4 mt-auto">
                {/* Progress Bar */}
                <div className="flex flex-col gap-2">
                    <div className="flex justify-between text-xs font-medium text-muted-foreground">
                        <span>{vote.voteCount} Votes Cast</span>
                        <span>Target: {targetVotes}</span>
                    </div>
                    <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full" style={{ width: `${progress}%` }}></div>
                    </div>
                </div>

                {/* Vote Distribution Chart */}
                <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vote Distribution</span>
                    <div className="space-y-2">
                        {distribution.map((item, i) => (
                            <div key={i} className="flex items-center gap-2 text-xs">
                                <span className="w-8 text-muted-foreground text-right">{Math.round(item.percentage)}%</span>
                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-primary/80"
                                        style={{ width: `${item.percentage}%` }}
                                    ></div>
                                </div>
                                <span className="w-16 truncate text-muted-foreground" title={item.label}>{item.label}</span>
                            </div>
                        ))}
                        {distribution.length === 0 && (
                            <p className="text-xs text-muted-foreground italic">No votes yet</p>
                        )}
                    </div>
                </div>
            </div>
        </article>
    )
}
