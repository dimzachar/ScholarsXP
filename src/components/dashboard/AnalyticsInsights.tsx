'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Lightbulb, 
  Target, 
  TrendingUp, 
  Award, 
  Flame, 
  AlertCircle,
  CheckCircle,
  ArrowRight,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface AnalyticsInsight {
  id: string
  type: 'achievement' | 'streak' | 'goal' | 'performance' | 'recommendation'
  title: string
  description: string
  priority: 'high' | 'medium' | 'low'
  actionable?: boolean
  actionText?: string
  actionUrl?: string
  icon?: React.ComponentType
}

interface AnalyticsInsightsProps {
  insights: AnalyticsInsight[]
  className?: string
  maxInsights?: number
  showActions?: boolean
}

const getInsightIcon = (type: AnalyticsInsight['type'], customIcon?: React.ComponentType) => {
  if (customIcon) {
    const Icon = customIcon
    return <Icon />
  }

  switch (type) {
    case 'achievement':
      return <Award className="h-4 w-4" />
    case 'streak':
      return <Flame className="h-4 w-4" />
    case 'goal':
      return <Target className="h-4 w-4" />
    case 'performance':
      return <TrendingUp className="h-4 w-4" />
    case 'recommendation':
      return <Lightbulb className="h-4 w-4" />
    default:
      return <Zap className="h-4 w-4" />
  }
}

const getPriorityColor = (priority: AnalyticsInsight['priority']) => {
  switch (priority) {
    case 'high':
      return 'text-red-600 bg-red-50 border-red-200 dark:bg-red-950 dark:border-red-800'
    case 'medium':
      return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:bg-yellow-950 dark:border-yellow-800'
    case 'low':
      return 'text-blue-600 bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800'
    default:
      return 'text-muted-foreground bg-muted border-border'
  }
}

const getPriorityBadgeVariant = (priority: AnalyticsInsight['priority']) => {
  switch (priority) {
    case 'high':
      return 'destructive'
    case 'medium':
      return 'default'
    case 'low':
      return 'secondary'
    default:
      return 'outline'
  }
}

const getTypeDisplayName = (type: AnalyticsInsight['type']) => {
  switch (type) {
    case 'achievement':
      return 'Achievement'
    case 'streak':
      return 'Streak'
    case 'goal':
      return 'Goal'
    case 'performance':
      return 'Performance'
    case 'recommendation':
      return 'Recommendation'
    default:
      return 'Insight'
  }
}

export function AnalyticsInsights({ 
  insights, 
  className, 
  maxInsights = 5,
  showActions = true 
}: AnalyticsInsightsProps) {
  if (!insights || insights.length === 0) {
    return (
      <Card className={cn("", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Analytics Insights
          </CardTitle>
          <CardDescription>Personalized recommendations and performance insights</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
            <p className="text-muted-foreground">Great job! No insights to show right now.</p>
            <p className="text-sm text-muted-foreground mt-1">Keep up the excellent work!</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Sort insights by priority and limit to maxInsights
  const sortedInsights = insights
    .sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 }
      return priorityOrder[b.priority] - priorityOrder[a.priority]
    })
    .slice(0, maxInsights)

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Analytics Insights
          </span>
          <Badge variant="outline">
            {insights.length} insight{insights.length !== 1 ? 's' : ''}
          </Badge>
        </CardTitle>
        <CardDescription>
          Personalized recommendations and performance insights
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sortedInsights.map((insight) => (
            <div 
              key={insight.id}
              className={cn(
                "p-4 rounded-lg border transition-colors",
                getPriorityColor(insight.priority)
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {getInsightIcon(insight.type, insight.icon)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-sm">{insight.title}</h4>
                    <Badge 
                      variant={getPriorityBadgeVariant(insight.priority)}
                      className="text-xs"
                    >
                      {insight.priority}
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {getTypeDisplayName(insight.type)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    {insight.description}
                  </p>
                  
                  {showActions && insight.actionable && insight.actionText && (
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => {
                        if (insight.actionUrl) {
                          window.open(insight.actionUrl, '_blank')
                        }
                      }}
                    >
                      {insight.actionText}
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
          
          {insights.length > maxInsights && (
            <div className="text-center pt-2 border-t">
              <p className="text-sm text-muted-foreground">
                Showing {maxInsights} of {insights.length} insights
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
