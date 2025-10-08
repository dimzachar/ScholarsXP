'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

interface XpBreakdownData {
  submissions: number
  reviews: number
  streaks: number
  achievements: number
  penalties: number
  adminAdjustments: number
  total: number
}

type TransactionsByType = Record<string, Array<{ amount: number }>>
type PercentageBreakdown = Record<string, number>
type BreakdownCategoryKey = Exclude<keyof XpBreakdownData, 'total'>

interface XpBreakdownChartProps {
  data: XpBreakdownData
  title?: string
  timeframe?: string
  transactionsByType?: TransactionsByType
  percentageBreakdown?: PercentageBreakdown | null
}

export default function XpBreakdownChart({
  data,
  title = "XP Breakdown",
  timeframe = "Current Week",
  transactionsByType,
  percentageBreakdown
}: XpBreakdownChartProps) {


  if (!data || data.total === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted"></div>
            {title}
          </CardTitle>
          <CardDescription>{timeframe}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <div className="w-24 h-24 rounded-full bg-muted/20 flex items-center justify-center">
              <div className="w-12 h-12 rounded-full bg-muted/40"></div>
            </div>
            <div className="text-center space-y-2">
              <p className="text-muted-foreground font-medium">No XP data available</p>
              <p className="text-sm text-muted-foreground">Start submitting content to see your breakdown</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Calculate percentages and prepare data for visualization using theme colors
  type Category = {
    key: BreakdownCategoryKey
    name: string
    value: number
    rawValue: number
    color: string
    lightBg: string
    textColor: string
  }

  const categories: Category[] = []

  const addCategory = (
    key: BreakdownCategoryKey,
    name: string,
    rawValue: number,
    color: string,
    lightBg: string,
    textColor: string
  ) => {
    if (!rawValue) return
    categories.push({
      key,
      name,
      rawValue,
      value: Math.abs(rawValue),
      color,
      lightBg,
      textColor
    })
  }

  const sumTransactionsForTypes = (types: string[]): number => {
    if (!transactionsByType) return 0

    return types.reduce((total, type) => {
      const group = transactionsByType[type]
      if (!group) return total

      const groupTotal = group.reduce((sum, transaction) => {
        const amount = typeof transaction.amount === 'number' ? transaction.amount : 0
        return sum + amount
      }, 0)

      return total + groupTotal
    }, 0)
  }

  const CATEGORY_CONFIG: Array<{
    key: BreakdownCategoryKey
    label: string
    transactionTypes: string[]
    color: string
    lightBg: string
    textColor: string
  }> = [
    {
      key: 'submissions',
      label: 'Submissions',
      transactionTypes: ['SUBMISSION_REWARD'],
      color: 'hsl(var(--chart-1))',
      lightBg: 'bg-primary/10',
      textColor: 'text-chart-1'
    },
    {
      key: 'reviews',
      label: 'Reviews',
      transactionTypes: ['REVIEW_REWARD'],
      color: 'hsl(var(--chart-2))',
      lightBg: 'bg-secondary/10',
      textColor: 'text-chart-2'
    },
    {
      key: 'streaks',
      label: 'Streaks',
      transactionTypes: ['STREAK_BONUS'],
      color: 'hsl(var(--chart-3))',
      lightBg: 'bg-accent/10',
      textColor: 'text-chart-3'
    },
    {
      key: 'achievements',
      label: 'Achievements',
      transactionTypes: ['ACHIEVEMENT_BONUS'],
      color: 'hsl(var(--purple))',
      lightBg: 'bg-purple/10',
      textColor: 'text-purple'
    },
    {
      key: 'adminAdjustments',
      label: 'Admin Adjustments',
      transactionTypes: ['ADMIN_ADJUSTMENT'],
      color: 'hsl(var(--chart-5))',
      lightBg: 'bg-muted/20',
      textColor: 'text-chart-5'
    },
    {
      key: 'penalties',
      label: 'Penalties',
      transactionTypes: ['PENALTY'],
      color: 'hsl(var(--destructive))',
      lightBg: 'bg-destructive/10',
      textColor: 'text-destructive'
    }
  ]

  CATEGORY_CONFIG.forEach(config => {
    const transactionTotal = sumTransactionsForTypes(config.transactionTypes)
    const fallbackValue = data?.[config.key] ?? 0
    const rawValue = transactionTotal !== 0 ? transactionTotal : fallbackValue

    addCategory(config.key, config.label, rawValue, config.color, config.lightBg, config.textColor)
  })

  const totalAbsolute = categories.reduce((sum, cat) => sum + cat.value, 0)



  // Calculate angles for pie chart
  let currentAngle = 0
  const pieData = categories.map(category => {
    const actualPercentage = totalAbsolute > 0 ? (category.value / totalAbsolute) * 100 : 0
    const angle = (actualPercentage / 100) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle

    const overridePercentage = percentageBreakdown?.[category.key]
    const displayPercentage = typeof overridePercentage === 'number'
      ? Math.abs(overridePercentage)
      : actualPercentage

    return {
      ...category,
      percentage: displayPercentage,
      actualPercentage,
      startAngle,
      endAngle,
      angle
    }
  })



  // Generate SVG path for pie slice
  const generatePieSlice = (centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) => {
    // Handle full circle case (360 degrees)
    if (Math.abs(endAngle - startAngle) >= 359.9) {
      return `M ${centerX - radius} ${centerY} A ${radius} ${radius} 0 1 0 ${centerX + radius} ${centerY} A ${radius} ${radius} 0 1 0 ${centerX - radius} ${centerY}`
    }

    const start = polarToCartesian(centerX, centerY, radius, endAngle)
    const end = polarToCartesian(centerX, centerY, radius, startAngle)
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1"

    return [
      "M", centerX, centerY,
      "L", start.x, start.y,
      "A", radius, radius, 0, largeArcFlag, 0, end.x, end.y,
      "Z"
    ].join(" ")
  }

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0
    return {
      x: centerX + (radius * Math.cos(angleInRadians)),
      y: centerY + (radius * Math.sin(angleInRadians))
    }
  }

  // Increased size for better visibility
  const centerX = 180
  const centerY = 180
  const radius = 120
  const labelRadius = radius * 0.7 // Position labels at 70% of radius

  // Helper function to calculate label position
  const getLabelPosition = (startAngle: number, endAngle: number) => {
    const midAngle = (startAngle + endAngle) / 2
    const x = centerX + Math.cos(midAngle) * labelRadius
    const y = centerY + Math.sin(midAngle) * labelRadius
    return { x, y, midAngle }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{timeframe} • {data.total} Total XP</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Pie Chart */}
          <div className="flex items-center justify-center">
            <div className="relative w-full max-w-md">
              <svg
                width="360"
                height="360"
                viewBox="0 0 360 360"
                className="transform -rotate-90 w-full h-auto"
              >
                {/* Pie slices */}
                {pieData.map((slice, index) => (
                  <path
                    key={index}
                    d={generatePieSlice(centerX, centerY, radius, slice.startAngle, slice.endAngle)}
                    fill={slice.color}
                    stroke="white"
                    strokeWidth="3"
                    className="hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <title>{slice.name}: {slice.value} XP ({slice.percentage.toFixed(1)}%)</title>
                  </path>
                ))}

                {/* Segment labels */}
                {pieData.map((slice, index) => {
                  // Only show labels for slices > 5% to avoid clutter
                  if (slice.actualPercentage < 5) return null

                  const { x, y } = getLabelPosition(slice.startAngle, slice.endAngle)

                  return (
                    <g key={`label-${index}`} className="transform rotate-90">
                      <text
                        x={x}
                        y={y}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-white text-xs font-semibold drop-shadow-sm"
                        style={{
                          filter: 'drop-shadow(1px 1px 1px rgba(0,0,0,0.5))',
                          fontSize: slice.actualPercentage > 15 ? '14px' : '12px'
                        }}
                      >
                        {slice.percentage.toFixed(0)}%
                      </text>
                    </g>
                  )
                })}

                {/* Center circle with total */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r="60"
                  fill="white"
                  stroke="#e5e7eb"
                  strokeWidth="3"
                />
              </svg>

              {/* Center text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-gray-900 dark:text-gray-900">
                    {data.total}
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-700">
                    Total XP
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-3">
            {pieData.map((slice, index) => (
              <div key={index} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className="w-4 h-4 rounded-full flex-shrink-0"
                    style={{ backgroundColor: slice.color }}
                  ></div>
                  <span className="text-sm font-medium truncate">{slice.name}</span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-sm text-muted-foreground font-medium">
                    {slice.percentage.toFixed(1)}%
                  </span>
                  <Badge variant="outline" className={`${slice.textColor} text-xs`}>
                    {slice.rawValue >= 0 ? '+' : '-'}{slice.value} XP
                  </Badge>
                </div>
              </div>
            ))}
          </div>

          {/* Detailed Breakdown */}
          <div className="space-y-3">
            <h4 className="font-medium text-sm">Detailed Breakdown</h4>
            {categories.map((category, index) => (
              <div key={index} className={`p-3 rounded-lg ${category.lightBg}`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">{category.name}</span>
                  <span className={`text-sm font-bold ${category.textColor}`}>
                    {category.rawValue >= 0 ? '+' : '-'}{category.value} XP
                  </span>
                </div>
                <Progress 
                  value={totalAbsolute > 0 ? (category.value / totalAbsolute) * 100 : 0} 
                  className="h-2"
                />
              </div>
            ))}
          </div>

          {/* Insights */}
          <div className="p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium mb-2 text-sm">Insights</h4>
            <div className="space-y-1 text-xs text-muted-foreground">
              {data.submissions > data.reviews && (
                <p>• You're earning more from submissions than reviews</p>
              )}
              {data.reviews > data.submissions && (
                <p>• You're very active in peer reviewing!</p>
              )}
              {data.streaks > 0 && (
                <p>• Great job maintaining your streak!</p>
              )}
              {data.achievements > 0 && (
                <p>• You've earned achievement bonuses this period</p>
              )}
              {data.penalties < 0 && (
                <p>• Consider staying more active to avoid penalties</p>
              )}
              {data.total === 0 && (
                <p>• Start submitting content or reviewing to earn XP</p>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
