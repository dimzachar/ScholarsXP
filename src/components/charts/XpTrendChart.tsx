'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'

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
}

export default function XpTrendChart({ 
  data, 
  title = "XP Trend (Last 12 Weeks)", 
  showDetails = true 
}: XpTrendChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No data available</p>
        </CardContent>
      </Card>
    )
  }

  // Calculate chart dimensions and scaling
  const maxXp = Math.max(...data.map(d => d.xpEarned))
  const minXp = Math.min(...data.map(d => d.xpEarned))
  const chartHeight = 200
  const chartWidth = 600
  const padding = 40

  // Calculate trend
  const recentWeeks = data.slice(-4)
  const olderWeeks = data.slice(0, -4)
  const recentAvg = recentWeeks.reduce((sum, d) => sum + d.xpEarned, 0) / recentWeeks.length
  const olderAvg = olderWeeks.length > 0 
    ? olderWeeks.reduce((sum, d) => sum + d.xpEarned, 0) / olderWeeks.length 
    : recentAvg

  const trendPercentage = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0
  const isPositiveTrend = trendPercentage > 5
  const isNegativeTrend = trendPercentage < -5

  // Generate SVG path for the line chart
  const generatePath = (data: XpTrendData[]) => {
    if (data.length === 0) return ''

    const points = data.map((d, index) => {
      const x = padding + (index * (chartWidth - 2 * padding)) / (data.length - 1)
      const y = chartHeight - padding - ((d.xpEarned - minXp) / (maxXp - minXp || 1)) * (chartHeight - 2 * padding)
      return `${x},${y}`
    })

    return `M ${points.join(' L ')}`
  }

  // Generate area path for gradient fill
  const generateAreaPath = (data: XpTrendData[]) => {
    if (data.length === 0) return ''

    const linePath = generatePath(data)
    const firstPoint = data[0]
    const lastPoint = data[data.length - 1]
    
    const firstX = padding
    const lastX = padding + ((data.length - 1) * (chartWidth - 2 * padding)) / (data.length - 1)
    const bottomY = chartHeight - padding

    return `${linePath} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {title}
              {isPositiveTrend && <TrendingUp className="h-4 w-4 text-green-600" />}
              {isNegativeTrend && <TrendingDown className="h-4 w-4 text-red-600" />}
              {!isPositiveTrend && !isNegativeTrend && <Minus className="h-4 w-4 text-gray-600" />}
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
              isPositiveTrend ? 'text-green-600' : isNegativeTrend ? 'text-red-600' : 'text-gray-600'
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
          {/* SVG Chart */}
          <div className="relative">
            <svg 
              width={chartWidth} 
              height={chartHeight} 
              className="w-full h-auto border rounded-lg bg-gradient-to-br from-blue-50 to-purple-50"
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            >
              {/* Grid lines */}
              <defs>
                <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e5e7eb" strokeWidth="1" opacity="0.5"/>
                </pattern>
                <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.05"/>
                </linearGradient>
              </defs>
              
              <rect width="100%" height="100%" fill="url(#grid)" />
              
              {/* Area fill */}
              <path
                d={generateAreaPath(data)}
                fill="url(#areaGradient)"
              />
              
              {/* Line */}
              <path
                d={generatePath(data)}
                fill="none"
                stroke="#3b82f6"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* Data points */}
              {data.map((d, index) => {
                const x = padding + (index * (chartWidth - 2 * padding)) / (data.length - 1)
                const y = chartHeight - padding - ((d.xpEarned - minXp) / (maxXp - minXp || 1)) * (chartHeight - 2 * padding)
                
                return (
                  <g key={index}>
                    <circle
                      cx={x}
                      cy={y}
                      r="4"
                      fill="#3b82f6"
                      stroke="white"
                      strokeWidth="2"
                      className="hover:r-6 transition-all cursor-pointer"
                    />
                    <title>
                      Week {d.week}: {d.xpEarned} XP
                      {'\n'}Submissions: {d.submissions}
                      {'\n'}Reviews: {d.reviews}
                      {'\n'}Streaks: {d.streaks}
                    </title>
                  </g>
                )
              })}
              
              {/* Y-axis labels */}
              <text x="10" y="25" fontSize="12" fill="#6b7280" textAnchor="start">
                {maxXp}
              </text>
              <text x="10" y={chartHeight - 10} fontSize="12" fill="#6b7280" textAnchor="start">
                {minXp}
              </text>
            </svg>
          </div>

          {/* Legend and Details */}
          {showDetails && (
            <div className="space-y-4">
              <div className="flex items-center justify-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                  <span>XP Earned</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                  <span>Submissions</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                  <span>Reviews</span>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="text-center p-3 bg-blue-50 rounded-lg">
                  <div className="text-lg font-bold text-blue-600">
                    {data.reduce((sum, d) => sum + d.xpEarned, 0)}
                  </div>
                  <div className="text-xs text-blue-600">Total XP</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-lg">
                  <div className="text-lg font-bold text-green-600">
                    {data.reduce((sum, d) => sum + d.submissions, 0)}
                  </div>
                  <div className="text-xs text-green-600">Submissions</div>
                </div>
                <div className="text-center p-3 bg-purple-50 rounded-lg">
                  <div className="text-lg font-bold text-purple-600">
                    {data.reduce((sum, d) => sum + d.reviews, 0)}
                  </div>
                  <div className="text-xs text-purple-600">Reviews</div>
                </div>
                <div className="text-center p-3 bg-orange-50 rounded-lg">
                  <div className="text-lg font-bold text-orange-600">
                    {Math.round(data.reduce((sum, d) => sum + d.xpEarned, 0) / data.length)}
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
