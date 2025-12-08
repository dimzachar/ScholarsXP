'use client'

import { RANK_THRESHOLDS } from '@/lib/gamified-ranks'
import { GamifiedRankBadge } from '@/components/gamified'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default function RanksTestPage() {
    // Group ranks by category
    const ranksByCategory = RANK_THRESHOLDS.reduce((acc, rank) => {
        if (!acc[rank.category]) {
            acc[rank.category] = []
        }
        acc[rank.category].push(rank)
        return acc
    }, {} as Record<string, typeof RANK_THRESHOLDS>)

    return (
        <div className="container mx-auto py-8 px-4">
            <div className="mb-8">
                <h1 className="text-4xl font-bold mb-2">Rank System</h1>
                <p className="text-muted-foreground">
                    All 21 progression levels
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
    )
}
