import React from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Activity,
    CheckCircle2,
    XCircle,
    Clock,
    Filter,
    Search,
    MoreHorizontal,
    ArrowUpRight,
    Vote,
    Users,
    LayoutDashboard
} from 'lucide-react'
import { ConsensusEvent } from '@/app/admin/live-monitor/types'

interface LiveFeedProps {
    data: {
        recentConsensus: ConsensusEvent[]
    } | null
    onViewChange: (view: 'dashboard' | 'feed' | 'watchlist') => void
}

export function LiveFeed({ data, onViewChange }: LiveFeedProps) {
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
                        <Button variant="ghost" className="justify-start gap-3 px-3 py-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary">
                            <Activity className="h-5 w-5" />
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

                {/* Feed Header */}
                <div className="flex flex-col border-b border-border bg-card sticky top-0 z-10">
                    <div className="px-4 md:px-8 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h1 className="text-2xl md:text-3xl font-black leading-tight tracking-tight text-foreground">Activity Feed</h1>
                            <p className="text-muted-foreground text-sm font-normal leading-normal">
                                Real-time stream of consensus events and validator actions.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="relative hidden sm:block">
                                <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                                <input className="h-10 w-64 bg-muted text-foreground border-none rounded-lg pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary outline-none" placeholder="Search events..." type="text" />
                            </div>
                            <Button variant="outline" className="h-10 w-10 p-0 rounded-lg border-border">
                                <Filter className="h-5 w-5 text-muted-foreground" />
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Feed Content */}
                <div className="flex-1 overflow-y-auto p-4 md:p-8">
                    <div className="max-w-3xl mx-auto flex flex-col gap-6">
                        {/* Timeline */}
                        <div className="relative pl-4 md:pl-8 border-l-2 border-border space-y-8">
                            {data?.recentConsensus.map((event, index) => (
                                <FeedItem key={event.id} event={event} index={index} />
                            ))}

                            {/* Empty State */}
                            {!data?.recentConsensus.length && (
                                <div className="text-center py-12 text-muted-foreground">
                                    <Activity className="h-12 w-12 mx-auto mb-4 opacity-20" />
                                    <p>No recent activity recorded</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Right Sidebar (Stats) - Hidden on mobile */}
            <aside className="w-80 bg-card border-l border-border hidden xl:flex flex-col p-6 gap-6 overflow-y-auto">
                <div>
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Live Stats</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="bg-muted/50 p-4 rounded-xl border border-border">
                            <p className="text-xs text-muted-foreground font-bold uppercase">Events/Hr</p>
                            <p className="text-2xl font-black text-foreground mt-1">--</p>
                        </div>
                        <div className="bg-muted/50 p-4 rounded-xl border border-border">
                            <p className="text-xs text-muted-foreground font-bold uppercase">Avg Time</p>
                            <p className="text-2xl font-black text-foreground mt-1">--</p>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="text-sm font-bold text-foreground uppercase tracking-wider mb-4">Top Contributors</h3>
                    <div className="flex flex-col gap-3">
                        <p className="text-sm text-muted-foreground italic">No active contributors yet.</p>
                    </div>
                </div>
            </aside>
        </div>
    )
}

function FeedItem({ event, index }: { event: ConsensusEvent, index: number }) {
    const time = new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

    return (
        <div className="relative group">
            <div className="absolute -left-[41px] md:-left-[57px] top-0 size-5 rounded-full border-4 border-background bg-primary shadow-sm z-10 group-hover:scale-125 transition-transform"></div>
            <div className="bg-card rounded-xl border border-border p-5 shadow-sm hover:shadow-md transition-all hover:border-primary/50">
                <div className="flex justify-between items-start mb-2">
                    <div className="flex items-center gap-2">
                        <Badge className="bg-primary hover:bg-primary text-primary-foreground border-none">Consensus</Badge>
                        <span className="text-xs text-muted-foreground font-mono">{time}</span>
                    </div>
                    <button className="text-muted-foreground hover:text-primary">
                        <ArrowUpRight className="h-4 w-4" />
                    </button>
                </div>
                <h3 className="text-lg font-bold text-foreground mb-1">{event.title}</h3>
                <p className="text-xs text-muted-foreground font-mono mb-4">ID: {event.submissionId}</p>

                <div className="flex flex-wrap gap-2">
                    {event.impact.map((imp, idx) => (
                        <div key={idx} className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${imp.status === 'VALIDATED' ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-red-500/10 border-red-500/20 text-red-600'}`}>
                            {imp.status === 'VALIDATED' ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            <span className="text-xs font-bold">{imp.username}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    )
}
