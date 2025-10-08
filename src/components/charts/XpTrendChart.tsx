'use client'

import React, { useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'

interface XpTrendData {
  week: number
  weekStart: string
  weekEnd: string
  xpEarned: number
  submissions: number
  reviews: number
  streaks: number
}

interface XpTrendChartProps {
  data: XpTrendData[]
  title?: string
  showDetails?: boolean
  totalSubmissions?: number
  totalXpOverride?: number
  timeframe?: 'current_week' | 'last_12_weeks' | 'all_time'
  summaryCounts?: {
    submissions?: number
    reviews?: number
    streaks?: number
  }
}

const chartConfig = {
  xpEarned: {
    label: "XP Earned",
    color: "hsl(var(--chart-1))",
  },
  submissions: {
    label: "Submissions",
    color: "hsl(var(--chart-2))",
  },
  reviews: {
    label: "Reviews",
    color: "hsl(var(--chart-3))",
  },
  streaks: {
    label: "Streaks",
    color: "hsl(var(--chart-4))",
  },
} satisfies ChartConfig

export default function XpTrendChart({
  data,
  title = "Progress Trends",
  showDetails = true,
  totalSubmissions,
  totalXpOverride,
  timeframe,
  summaryCounts
}: XpTrendChartProps) {
  const [activeMetrics, setActiveMetrics] = useState(['xpEarned'])

  const timeframeKey = timeframe || 'last_12_weeks'

  const displayData = React.useMemo(() => {
    if (!data || data.length === 0) return []

    switch (timeframeKey) {
      case 'current_week':
        return data.slice(-1)
      case 'last_12_weeks':
        return data.slice(-12)
      case 'all_time':
      default:
        return data
    }
  }, [data, timeframeKey])

  if (!displayData || displayData.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-muted-foreground" />
            {title}
          </CardTitle>
          <CardDescription>
            Weekly XP progression over time
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-24 h-16 bg-muted/20 rounded-lg flex items-end justify-center space-x-1 p-2">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className={`w-2 bg-muted/40 rounded-sm`} style={{ height: `${i * 25}%` }}></div>
              ))}
            </div>
            <div className="text-center space-y-2">
              <p className="text-muted-foreground font-medium">No trend data available</p>
              <p className="text-sm text-muted-foreground">Complete activities over multiple weeks to see trends</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Calculate trend
  const recentWeeks = displayData.slice(-4)
  const olderWeeks = displayData.slice(0, -4)
  const recentAvg = recentWeeks.reduce((sum, d) => sum + d.xpEarned, 0) / recentWeeks.length
  const olderAvg = olderWeeks.length > 0
    ? olderWeeks.reduce((sum, d) => sum + d.xpEarned, 0) / olderWeeks.length
    : recentAvg

  const trendPercentage = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0
  const isPositiveTrend = trendPercentage > 5
  const isNegativeTrend = trendPercentage < -5

  const totalXp = typeof totalXpOverride === 'number'
    ? totalXpOverride
    : displayData.reduce((sum, d) => sum + d.xpEarned, 0)

  const latestWeek = displayData[displayData.length - 1]
  const submissionsFromData = displayData.reduce((sum, d) => sum + d.submissions, 0)
  const reviewsFromData = displayData.reduce((sum, d) => sum + d.reviews, 0)
  const streaksFromData = displayData.reduce((sum, d) => sum + d.streaks, 0)

  const submissionsValue = summaryCounts?.submissions ?? (() => {
    switch (timeframeKey) {
      case 'current_week':
        return latestWeek?.submissions || 0
      case 'all_time':
        return typeof totalSubmissions === 'number' ? totalSubmissions : submissionsFromData
      case 'last_12_weeks':
      default:
        return submissionsFromData
    }
  })()

  const reviewsValue = summaryCounts?.reviews ?? (timeframeKey === 'current_week'
    ? latestWeek?.reviews || 0
    : reviewsFromData)

  const streaksValue = summaryCounts?.streaks ?? (timeframeKey === 'current_week'
    ? latestWeek?.streaks || 0
    : streaksFromData)

  const periodsConsidered = timeframeKey === 'current_week'
    ? 1
    : timeframeKey === 'last_12_weeks'
      ? displayData.length
      : displayData.length

  const averageXp = periodsConsidered > 0 ? Math.round(totalXp / periodsConsidered) : 0

  // Toggle metric visibility
  const toggleMetric = (metric: string) => {
    setActiveMetrics(prev =>
      prev.includes(metric)
        ? prev.filter(m => m !== metric)
        : [...prev, metric]
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {title}
              {isPositiveTrend && <TrendingUp className="h-4 w-4 text-success" />}
              {isNegativeTrend && <TrendingDown className="h-4 w-4 text-destructive" />}
              {!isPositiveTrend && !isNegativeTrend && <Minus className="h-4 w-4 text-muted-foreground" />}
            </CardTitle>
            <CardDescription>
              Weekly XP progression over time
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">
              {Math.round(recentAvg)}
            </div>
            <div className={`text-sm flex items-center gap-1 ${
              isPositiveTrend ? 'text-success' : isNegativeTrend ? 'text-destructive' : 'text-muted-foreground'
            }`}>
              {isPositiveTrend && <TrendingUp className="h-3 w-3" />}
              {isNegativeTrend && <TrendingDown className="h-3 w-3" />}
              {Math.abs(trendPercentage).toFixed(1)}% avg
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Metric Toggle Buttons */}
          <div className="flex flex-wrap gap-2">
            {Object.entries(chartConfig).map(([key, config]) => (
              <Button
                key={key}
                variant={activeMetrics.includes(key) ? "default" : "outline"}
                size="sm"
                onClick={() => toggleMetric(key)}
                className="h-8 text-xs"
              >
                <div
                  className="w-2 h-2 rounded-full mr-2"
                  style={{ backgroundColor: config.color }}
                />
                {config.label}
              </Button>
            ))}
          </div>

          {/* Interactive Chart */}
          <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
            <AreaChart
              accessibilityLayer
              data={displayData}
              margin={{
                left: 12,
                right: 12,
                top: 12,
                bottom: 12,
              }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="week"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `W${value}`}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => `${value}`}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => `Week ${value}`}
                    formatter={(value, name) => [
                      value,
                      chartConfig[name as keyof typeof chartConfig]?.label || name
                    ]}
                  />
                }
              />
              {activeMetrics.includes('xpEarned') && (
                <Area
                  dataKey="xpEarned"
                  type="monotone"
                  fill="var(--color-xpEarned)"
                  fillOpacity={0.4}
                  stroke="var(--color-xpEarned)"
                  strokeWidth={2}
                />
              )}
              {activeMetrics.includes('submissions') && (
                <Area
                  dataKey="submissions"
                  type="monotone"
                  fill="var(--color-submissions)"
                  fillOpacity={0.2}
                  stroke="var(--color-submissions)"
                  strokeWidth={2}
                />
              )}
              {activeMetrics.includes('reviews') && (
                <Area
                  dataKey="reviews"
                  type="monotone"
                  fill="var(--color-reviews)"
                  fillOpacity={0.2}
                  stroke="var(--color-reviews)"
                  strokeWidth={2}
                />
              )}
              {activeMetrics.includes('streaks') && (
                <Area
                  dataKey="streaks"
                  type="monotone"
                  fill="var(--color-streaks)"
                  fillOpacity={0.2}
                  stroke="var(--color-streaks)"
                  strokeWidth={2}
                />
              )}
            </AreaChart>
          </ChartContainer>

          {/* Legend and Details */}
          {showDetails && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-6 text-sm">
                {Object.entries(chartConfig).map(([key, config]) => (
                  <div key={key} className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: config.color }}
                    />
                    <span>{config.label}</span>
                  </div>
                ))}
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-lg font-bold text-blue-600">
                    {totalXp}
                  </div>
                  <div className="text-xs text-blue-600">Total XP</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-lg font-bold text-green-600">
                    {submissionsValue}
                  </div>
                  <div className="text-xs text-green-600">Submissions</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-lg font-bold text-purple-600">
                    {reviewsValue}
                  </div>
                  <div className="text-xs text-purple-600">Reviews</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-lg font-bold text-orange-600">
                    {averageXp}
                  </div>
                  <div className="text-xs text-orange-600">Avg/Week</div>
                </div>
              </div>

              {/* Trend Analysis */}
              <div className="p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium mb-2">Trend Analysis</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-muted-foreground">Recent 4 weeks avg:</span>
                    <span className="font-medium ml-2">{Math.round(recentAvg)} XP</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Previous weeks avg:</span>
                    <span className="font-medium ml-2">{Math.round(olderAvg)} XP</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Trend:</span>
                    <Badge 
                      variant={isPositiveTrend ? 'default' : isNegativeTrend ? 'destructive' : 'secondary'}
                      className="ml-2"
                    >
                      {trendPercentage > 0 ? '+' : ''}{trendPercentage.toFixed(1)}%
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
