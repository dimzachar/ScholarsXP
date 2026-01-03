import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Users,
    Search,
    Filter,
    MoreHorizontal,
    Shield,
    Download,
    LayoutDashboard,
    Vote,
    Activity,
    CheckCircle2,
    AlertTriangle
} from 'lucide-react'
import { WatchlistReviewer } from '@/app/admin/live-monitor/types'

interface LiveWatchlistProps {
    data: {
        watchlist: WatchlistReviewer[]
    } | null
    onViewChange: (view: 'dashboard' | 'feed' | 'watchlist') => void
}

export function LiveWatchlist({ data, onViewChange }: LiveWatchlistProps) {
    return (
        <div className="flex h-screen bg-background overflow-hidden font-sans text-foreground flex-col md:flex-row">
            {/* Sidebar Navigation (Desktop) */}
            <aside className="w-64 bg-card border-r border-border flex-col z-20 hidden md:flex shrink-0">
                <div className="h-16 flex items-center px-6 border-b border-border">
                    <div className="flex items-center gap-2 text-primary">
                        <Vote className="h-8 w-8" />
                        <span className="text-xl font-bold tracking-tight text-foreground">ConsensusLive</span>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto py-6 px-4 flex flex-col gap-6">
                    <nav className="flex flex-col gap-1">
                        <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Main Menu</p>
                        <Button variant="ghost" className="justify-start gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted" onClick={() => onViewChange('dashboard')}>
                            <LayoutDashboard className="h-5 w-5" />
                            <span className="text-sm font-medium">Dashboard</span>
                        </Button>
                        <Button variant="ghost" className="justify-start gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-muted" onClick={() => onViewChange('feed')}>
                            <Activity className="h-5 w-5" />
                            <span className="text-sm font-medium">Activity Feed</span>
                        </Button>
                        <Button variant="ghost" className="justify-start gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary">
                            <Users className="h-5 w-5" />
                            <span className="text-sm font-medium">Reviewers</span>
                        </Button>
                    </nav>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col h-full overflow-hidden relative bg-background">
                {/* Top Header (Mobile/Tablet) */}
                <header className="md:hidden h-16 flex items-center justify-between px-4 border-b border-border bg-card shrink-0 z-10">
                    <div className="flex items-center gap-2 text-primary">
                        <Vote className="h-6 w-6" />
                        <span className="text-lg font-bold tracking-tight text-foreground">ConsensusLive</span>
                    </div>
                    <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-6 w-6" />
                    </Button>
                </header>

                {/* Page Header */}
                <div className="flex flex-col border-b border-border bg-card sticky top-0 z-10">
                    <div className="px-4 md:px-8 py-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-tight text-foreground">Reviewer Watchlist</h1>
                            <p className="text-muted-foreground text-sm font-normal leading-normal">
                                Monitor reviewer reliability, reputation scores, and activity.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <Button variant="outline" className="gap-2 border-border text-foreground hover:bg-muted">
                                <Download className="h-4 w-4" />
                                Export Data
                            </Button>
                        </div>
                    </div>

                    {/* Toolbar */}
                    <div className="px-4 md:px-8 pb-4 flex flex-col sm:flex-row gap-4 justify-between items-center">
                        <div className="relative w-full sm:w-auto">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <input className="h-10 w-full sm:w-80 bg-muted text-foreground border-none rounded-lg pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Search reviewers..." type="text" />
                        </div>
                        <div className="flex gap-2 w-full sm:w-auto overflow-x-auto">
                            <Button variant="ghost" size="sm" className="bg-foreground text-background hover:bg-foreground/90 font-medium rounded-full px-4">All Reviewers</Button>
                            <Button variant="ghost" size="sm" className="text-muted-foreground hover:bg-muted font-medium rounded-full px-4">High Risk</Button>
                            <Button variant="ghost" size="sm" className="text-muted-foreground hover:bg-muted font-medium rounded-full px-4">Top Performers</Button>
                            <Button variant="ghost" size="icon" className="rounded-full text-muted-foreground hover:bg-muted ml-auto sm:ml-0">
                                <Filter className="h-4 w-4" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Table Content */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="max-w-[1400px] mx-auto bg-card rounded-xl border border-border shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="border-b border-border bg-muted/30">
                                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider w-16">Rank</th>
                                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider">Reviewer</th>
                                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Formula A</th>
                                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Shadow V1</th>
                                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Shadow V2</th>
                                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-right">Total Reviews</th>
                                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider text-center">Status</th>
                                        <th className="p-4 text-xs font-bold text-muted-foreground uppercase tracking-wider w-16"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-border">
                                    {data?.watchlist.map((reviewer, index) => (
                                        <ReviewerRow key={reviewer.username} reviewer={reviewer} index={index} />
                                    ))}
                                    {!data?.watchlist.length && (
                                        <tr>
                                            <td colSpan={9} className="p-8 text-center text-muted-foreground">
                                                No reviewers found in watchlist.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </main>
        </div>
    )
}

function ReviewerRow({ reviewer, index }: { reviewer: WatchlistReviewer, index: number }) {
    const status = reviewer.status
    const statusColor = status === 'Excellent' ? 'text-green-600 bg-green-500/10' : status === 'Good' ? 'text-yellow-600 bg-yellow-500/10' : 'text-red-600 bg-red-500/10'
    const statusIcon = status === 'Excellent' ? <CheckCircle2 className="h-3 w-3" /> : status === 'Good' ? <Shield className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />

    const v1 = reviewer.shadowScoreV1 || 0
    const v2 = reviewer.shadowScoreV2 || 0
    const deltaV1 = v1 - reviewer.activeScore
    const deltaV2 = v2 - reviewer.activeScore

    const deltaV1Color = deltaV1 > 0 ? 'text-green-600' : deltaV1 < 0 ? 'text-red-600' : 'text-muted-foreground'
    const deltaV1Icon = deltaV1 > 0 ? '↑' : deltaV1 < 0 ? '↓' : '-'

    const deltaV2Color = deltaV2 > 0 ? 'text-green-600' : deltaV2 < 0 ? 'text-red-600' : 'text-muted-foreground'
    const deltaV2Icon = deltaV2 > 0 ? '↑' : deltaV2 < 0 ? '↓' : '-'

    return (
        <tr className="group hover:bg-muted/50 transition-colors">
            <td className="p-4 text-sm font-medium text-muted-foreground">#{index + 1}</td>
            <td className="p-4">
                <div className="flex items-center gap-3">
                    <div className="size-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">
                        {reviewer.username.substring(0, 2).toUpperCase()}
                    </div>
                    <div>
                        <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{reviewer.username}</p>
                        <p className="text-xs text-muted-foreground">ID: {reviewer.id.substring(0, 8)}</p>
                    </div>
                </div>
            </td>
            <td className="p-4 text-right">
                <span className="text-sm font-bold text-foreground">{(reviewer.activeScore * 100).toFixed(1)}</span>
            </td>
            <td className="p-4 text-right">
                <div className="flex flex-col items-end">
                    <span className="text-sm font-bold text-muted-foreground">{(v1 * 100).toFixed(1)}</span>
                    <span className={`text-[10px] font-bold ${deltaV1Color}`}>
                        {deltaV1 > 0 ? '+' : ''}{(deltaV1 * 100).toFixed(1)}% {deltaV1 !== 0 && deltaV1Icon}
                    </span>
                </div>
            </td>
            <td className="p-4 text-right">
                <div className="flex flex-col items-end">
                    <span className="text-sm font-bold text-foreground">{(v2 * 100).toFixed(1)}</span>
                    <span className={`text-[10px] font-bold ${deltaV2Color}`}>
                        {deltaV2 > 0 ? '+' : ''}{(deltaV2 * 100).toFixed(1)}% {deltaV2 !== 0 && deltaV2Icon}
                    </span>
                </div>
            </td>
            <td className="p-4 text-right text-sm font-medium text-foreground">
                {reviewer.metrics.totalReviews}
            </td>
            <td className="p-4">
                <div className={`flex items-center justify-center gap-1.5 px-2 py-1 rounded-full w-fit mx-auto text-xs font-bold ${statusColor}`}>
                    {statusIcon}
                    {status}
                </div>
            </td>
            <td className="p-4 text-right">
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground">
                    <MoreHorizontal className="h-4 w-4" />
                </Button>
            </td>
        </tr>
    )
}
