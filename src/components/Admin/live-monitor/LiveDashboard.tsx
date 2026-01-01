import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
    LayoutDashboard,
    Vote,
    Archive,
    Settings,
    Flame,
    Clock,
    CheckCircle2,
    LogOut,
    Search,
    Bell,
    PlusCircle,
    RefreshCw,
    Users,
    Handshake,
    AlertTriangle,
    MoreHorizontal,
    Filter
} from 'lucide-react'
import { ActiveVote } from '@/app/admin/live-monitor/types'

interface LiveDashboardProps {
    data: {
        activeVotes: ActiveVote[]
    } | null
    onRefresh: () => void
    loading: boolean
    onViewChange: (view: 'dashboard' | 'feed' | 'watchlist') => void
}

export function LiveDashboard({ data, onRefresh, loading, onViewChange }: LiveDashboardProps) {
    // Calculate real stats
    const totalVotes = data?.activeVotes.reduce((acc, vote) => acc + vote.voteCount, 0) || 0
    const activeCases = data?.activeVotes.length || 0
    const consensusReached = 0

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
                        <div className="h-8 w-px bg-border mx-1"></div>
                        <Button variant="ghost" className="flex items-center gap-2 text-sm font-medium text-primary hover:text-primary/80">
                            <PlusCircle className="h-6 w-6" />
                            <span>New Proposal</span>
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            <StatsCard icon={<Vote className="h-6 w-6" />} color="blue" label="Active Votes" value={activeCases} />
                            <StatsCard icon={<Users className="h-6 w-6" />} color="purple" label="Total Votes Cast" value={totalVotes} />
                            <StatsCard icon={<Handshake className="h-6 w-6" />} color="green" label="Consensus Reached" value={consensusReached} />
                            <StatsCard icon={<AlertTriangle className="h-6 w-6" />} color="orange" label="Action Required" value="0" />
                        </div>

                        {/* Card Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 pb-8">
                            {data?.activeVotes.map((vote, index) => (
                                <VoteCard key={vote.id} vote={vote} index={index} />
                            ))}

                            {/* Add New Card */}
                            <button className="bg-transparent border-2 border-dashed border-border rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-4 hover:border-primary hover:bg-muted/50 transition-all cursor-pointer min-h-[340px] group">
                                <div className="size-16 rounded-full bg-muted flex items-center justify-center group-hover:scale-110 transition-transform">
                                    <PlusCircle className="h-8 w-8 text-muted-foreground group-hover:text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-foreground">New Case</h3>
                                    <p className="text-sm text-muted-foreground mt-1 max-w-[200px]">Create a new divergent case for community voting</p>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}

function StatsCard({ icon, color, label, value }: any) {
    const colorClasses: Record<string, string> = {
        blue: 'text-blue-500 bg-blue-500/10',
        purple: 'text-purple-500 bg-purple-500/10',
        green: 'text-green-500 bg-green-500/10',
        orange: 'text-orange-500 bg-orange-500/10',
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

function VoteCard({ vote, index }: { vote: ActiveVote, index: number }) {
    // Calculate real progress
    const targetVotes = 10 // This could be dynamic if available in data
    const progress = Math.min((vote.voteCount / targetVotes) * 100, 100)

    // Calculate percentages from voteDistribution
    const totalVotes = Object.values(vote.voteDistribution).reduce((a, b) => a + b, 0) || 0
    const distribution = Object.entries(vote.voteDistribution).map(([label, count]) => ({
        label,
        count,
        percentage: totalVotes > 0 ? (count / totalVotes) * 100 : 0
    }))

    return (
        <article className="group bg-card rounded-2xl border border-border p-6 shadow-sm hover:shadow-md transition-all duration-300 flex flex-col gap-6 relative overflow-hidden hover:border-primary">
            <div className="absolute top-0 left-0 w-1 h-full bg-primary"></div>
            <div className="flex justify-between items-start">
                <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary flex items-center gap-1">
                            Live
                        </span>
                        <span className="text-xs font-mono text-muted-foreground">#{vote.id.slice(0, 8)}</span>
                    </div>
                    <h3 className="text-lg font-bold text-foreground leading-tight group-hover:text-primary transition-colors cursor-pointer">
                        {vote.title || 'Untitled Submission'}
                    </h3>
                </div>
                <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <MoreHorizontal className="h-5 w-5" />
                </button>
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
                {vote.url}
            </p>

            <div className="flex flex-col gap-4">
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
                                        className="h-full bg-blue-500/80"
                                        style={{ width: `${item.percentage}%`, opacity: 0.5 + (i * 0.2) }}
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

            <Button variant="outline" className="w-full py-2.5 rounded-lg border-primary text-primary hover:bg-primary hover:text-primary-foreground font-medium text-sm transition-all mt-auto bg-transparent">
                View Details
            </Button>
        </article>
    )
}
