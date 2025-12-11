'use client'

import { RANK_THRESHOLDS } from '@/lib/gamified-ranks'
import { GamifiedRankBadge } from '@/components/gamified'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import Link from 'next/link'
import { ArrowLeft, Trophy } from 'lucide-react'

export default function RanksPage() {
    // Group ranks by category
    const ranksByCategory = RANK_THRESHOLDS.reduce((acc, rank) => {
        if (!acc[rank.category]) {
            acc[rank.category] = []
        }
        acc[rank.category].push(rank)
        return acc
    }, {} as Record<string, typeof RANK_THRESHOLDS>)

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-muted/50 to-muted">
        <div className="container mx-auto py-8 px-4">
            {/* Header with back navigation */}
            <div className="mb-8">
                <Link href="/leaderboard">
                    <Button variant="ghost" size="sm" className="mb-4 -ml-2">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Leaderboard
                    </Button>
                </Link>
                <div className="flex items-center gap-3 mb-2">
                    <Trophy className="h-8 w-8 text-primary" />
                    <h1 className="text-4xl font-bold">Rank System</h1>
                </div>
                <p className="text-muted-foreground">
                    Progress through {RANK_THRESHOLDS.length} ranks across 5 categories. Earn XP through submissions and reviews to climb the ranks!
                </p>
            </div>

            <div className="space-y-8">
                {Object.entries(ranksByCategory).map(([category, ranks]) => {
                    const CategoryIcon = ranks[0]?.icon

                    return (
                        <Card key={category}>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-3">
                                    {CategoryIcon && (
                                        <CategoryIcon
                                            className="h-6 w-6"
                                            style={{ color: ranks[0].color }}
                                            strokeWidth={2.5}
                                        />
                                    )}
                                    {category}
                                    <span className="text-sm font-normal text-muted-foreground">
                                        ({ranks.length} {ranks.length === 1 ? 'rank' : 'tiers'})
                                    </span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
                                    {ranks.map((rank) => (
                                        <div key={rank.displayName} className="space-y-3">
                                            <GamifiedRankBadge
                                                rank={rank}
                                                size="lg"
                                                animated={true}
                                                className="w-full justify-center"
                                            />
                                            <div className="text-center space-y-1">
                                                <p className="text-sm font-medium">
                                                    {rank.minXp.toLocaleString()} - {rank.maxXp === Infinity ? '∞' : rank.maxXp.toLocaleString()} XP
                                                </p>
                                                <p className="text-xs text-muted-foreground">
                                                    {rank.tier || 'Entry Level'}
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )
                })}
            </div>

            {/* All Ranks in One View */}
            {/* <Card className="mt-8">
                <CardHeader>
                    <CardTitle>All Ranks (Linear View)</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-wrap gap-3">
                        {RANK_THRESHOLDS.map((rank) => (
                            <GamifiedRankBadge
                                key={rank.displayName}
                                rank={rank}
                                size="md"
                                animated={false}
                            />
                        ))}
                    </div>
                </CardContent>
            </Card> */}

            {/* Size Comparison */}
            {/* <Card className="mt-8">
                <CardHeader>
                    <CardTitle>Size Variants</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
                            <div key={size} className="space-y-2">
                                <p className="text-sm font-medium text-muted-foreground uppercase">{size}</p>
                                <GamifiedRankBadge
                                    rank={RANK_THRESHOLDS[10]} // Gold Journeyman
                                    size={size}
                                    animated={true}
                                />
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card> */}
        </div>
        </div>
    )
}
