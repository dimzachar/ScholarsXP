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

interface XpBreakdownChartProps {
  data: XpBreakdownData
  title?: string
  timeframe?: string
}

export default function XpBreakdownChart({ 
  data, 
  title = "XP Breakdown", 
  timeframe = "Current Week" 
}: XpBreakdownChartProps) {
  if (!data || data.total === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{timeframe}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No XP data available</p>
        </CardContent>
      </Card>
    )
  }

  // Calculate percentages and prepare data for visualization
  const categories = [
    {
      name: 'Submissions',
      value: data.submissions,
      color: '#3b82f6', // blue
      bgColor: 'bg-blue-500',
      lightBg: 'bg-blue-50',
      textColor: 'text-blue-600'
    },
    {
      name: 'Reviews',
      value: data.reviews,
      color: '#10b981', // green
      bgColor: 'bg-green-500',
      lightBg: 'bg-green-50',
      textColor: 'text-green-600'
    },
    {
      name: 'Streaks',
      value: data.streaks,
      color: '#f59e0b', // orange
      bgColor: 'bg-orange-500',
      lightBg: 'bg-orange-50',
      textColor: 'text-orange-600'
    },
    {
      name: 'Achievements',
      value: data.achievements,
      color: '#8b5cf6', // purple
      bgColor: 'bg-purple-500',
      lightBg: 'bg-purple-50',
      textColor: 'text-purple-600'
    },
    {
      name: 'Admin Adjustments',
      value: data.adminAdjustments,
      color: '#6b7280', // gray
      bgColor: 'bg-gray-500',
      lightBg: 'bg-gray-50',
      textColor: 'text-gray-600'
    }
  ].filter(category => category.value !== 0) // Only show categories with values

  // Add penalties if they exist (negative values)
  if (data.penalties < 0) {
    categories.push({
      name: 'Penalties',
      value: Math.abs(data.penalties),
      color: '#ef4444', // red
      bgColor: 'bg-red-500',
      lightBg: 'bg-red-50',
      textColor: 'text-red-600'
    })
  }

  const totalAbsolute = categories.reduce((sum, cat) => sum + Math.abs(cat.value), 0)

  // Calculate angles for pie chart
  let currentAngle = 0
  const pieData = categories.map(category => {
    const percentage = totalAbsolute > 0 ? (Math.abs(category.value) / totalAbsolute) * 100 : 0
    const angle = (percentage / 100) * 360
    const startAngle = currentAngle
    const endAngle = currentAngle + angle
    currentAngle = endAngle

    return {
      ...category,
      percentage,
      startAngle,
      endAngle,
      angle
    }
  })

  // Generate SVG path for pie slice
  const generatePieSlice = (centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) => {
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

  const centerX = 120
  const centerY = 120
  const radius = 80

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
            <div className="relative">
              <svg width="240" height="240" className="transform -rotate-90">
                {pieData.map((slice, index) => (
                  <path
                    key={index}
                    d={generatePieSlice(centerX, centerY, radius, slice.startAngle, slice.endAngle)}
                    fill={slice.color}
                    stroke="white"
                    strokeWidth="2"
                    className="hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    <title>{slice.name}: {slice.value} XP ({slice.percentage.toFixed(1)}%)</title>
                  </path>
                ))}
                
                {/* Center circle with total */}
                <circle
                  cx={centerX}
                  cy={centerY}
                  r="45"
                  fill="white"
                  stroke="#e5e7eb"
                  strokeWidth="2"
                />
              </svg>
              
              {/* Center text */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-900">
                    {data.total}
                  </div>
                  <div className="text-xs text-gray-500">
                    Total XP
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="space-y-3">
            {pieData.map((slice, index) => (
              <div key={index} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-4 h-4 rounded-full"
                    style={{ backgroundColor: slice.color }}
                  ></div>
                  <span className="text-sm font-medium">{slice.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {slice.percentage.toFixed(1)}%
                  </span>
                  <Badge variant="outline" className={slice.textColor}>
                    {slice.name === 'Penalties' ? '-' : '+'}{slice.value} XP
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
                    {category.name === 'Penalties' ? '-' : '+'}{category.value} XP
                  </span>
                </div>
                <Progress 
                  value={totalAbsolute > 0 ? (Math.abs(category.value) / totalAbsolute) * 100 : 0} 
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
