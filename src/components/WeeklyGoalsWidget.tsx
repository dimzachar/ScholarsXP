'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { getTaskType } from '@/lib/task-types'
import type { TaskTypeId } from '@/types/task-types'
import {
  Target,
  Calendar,
  TrendingUp,
  CheckCircle,
  Clock,
  Zap,
  Award,
  AlertCircle,
  RefreshCw,
  ChevronRight
} from 'lucide-react'

interface GoalProgress {
  taskType: string
  current: number
  maximum: number
  percentage: number
}

interface WeeklyGoalsWidgetProps {
  goalProgress?: GoalProgress[]
  currentWeekXp?: number
  projectedWeeklyXp?: number
  className?: string
  showDetails?: boolean
}

export default function WeeklyGoalsWidget({
  goalProgress = [],
  currentWeekXp = 0,
  projectedWeeklyXp = 0,
  className = '',
  showDetails = true
}: WeeklyGoalsWidgetProps) {
  const [selectedTab, setSelectedTab] = useState('overview')
  const [weeklyData, setWeeklyData] = useState<any>(null)

  // Calculate week progress
  const currentWeek = Math.ceil(new Date().getDate() / 7)
  const daysInWeek = 7
  const currentDayOfWeek = new Date().getDay()
  const weekProgress = (currentDayOfWeek / daysInWeek) * 100

  // Calculate completion statistics
  const completedGoals = goalProgress.filter(goal => goal.percentage >= 100).length
  const totalGoals = goalProgress.length
  const overallProgress = totalGoals > 0 ? (completedGoals / totalGoals) * 100 : 0

  // Calculate potential XP
  const taskTypeXpValues = {
    'A': 30, 'B': 150, 'C': 30, 'D': 75, 'E': 75, 'F': 75
  }

  const maxPossibleXp = goalProgress.reduce((sum, goal) => {
    const maxXp = taskTypeXpValues[goal.taskType as keyof typeof taskTypeXpValues] || 0
    return sum + (maxXp * goal.maximum)
  }, 0)

  const earnedXp = goalProgress.reduce((sum, goal) => {
    const maxXp = taskTypeXpValues[goal.taskType as keyof typeof taskTypeXpValues] || 0
    return sum + (maxXp * goal.current)
  }, 0)

  // Get task type details using the actual task type configuration
  const getTaskTypeDetails = (taskType: string) => {
    try {
      const taskConfig = getTaskType(taskType as TaskTypeId)
      const colorMap = {
        'A': { color: 'bg-chart-1', lightBg: 'bg-primary/10', textColor: 'text-chart-1' },
        'B': { color: 'bg-chart-2', lightBg: 'bg-secondary/10', textColor: 'text-chart-2' },
        'C': { color: 'bg-chart-3', lightBg: 'bg-accent/10', textColor: 'text-chart-3' },
        'D': { color: 'bg-warning', lightBg: 'bg-warning/10', textColor: 'text-warning' },
        'E': { color: 'bg-destructive', lightBg: 'bg-destructive/10', textColor: 'text-destructive' },
        'F': { color: 'bg-purple', lightBg: 'bg-purple/10', textColor: 'text-purple' }
      }
      const colors = colorMap[taskType as keyof typeof colorMap] || { color: 'bg-chart-5', lightBg: 'bg-muted/10', textColor: 'text-muted-foreground' }

      return {
        name: taskConfig.name,
        ...colors
      }
    } catch (error) {
      // Fallback for invalid task types
      return {
        name: taskType,
        color: 'bg-chart-5',
        lightBg: 'bg-muted/10',
        textColor: 'text-muted-foreground'
      }
    }
  }

  // Calculate time remaining in week
  const getTimeRemainingInWeek = () => {
    const now = new Date()
    const endOfWeek = new Date(now)
    endOfWeek.setDate(now.getDate() + (7 - now.getDay()))
    endOfWeek.setHours(23, 59, 59, 999)
    
    const timeRemaining = endOfWeek.getTime() - now.getTime()
    const daysRemaining = Math.floor(timeRemaining / (1000 * 60 * 60 * 24))
    const hoursRemaining = Math.floor((timeRemaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
    
    return { days: daysRemaining, hours: hoursRemaining }
  }

  const timeRemaining = getTimeRemainingInWeek()

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Weekly Goals
            </CardTitle>
            <CardDescription>
              Week {currentWeek} • {timeRemaining.days}d {timeRemaining.hours}h remaining
            </CardDescription>
          </div>
          <Badge variant={overallProgress >= 80 ? 'default' : 'secondary'}>
            {Math.round(overallProgress)}% Complete
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        {showDetails ? (
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="progress">Progress</TabsTrigger>
              <TabsTrigger value="insights">Insights</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4 mt-4">
              {/* Week Progress Bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Week Progress</span>
                  <span>{Math.round(weekProgress)}%</span>
                </div>
                <Progress value={weekProgress} className="h-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Monday</span>
                  <span>Sunday</span>
                </div>
              </div>

              {/* XP Summary */}
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-4 bg-primary/10 rounded-lg">
                  <div className="text-2xl font-bold text-primary">
                    {currentWeekXp}
                  </div>
                  <div className="text-sm text-primary/80">Current XP</div>
                </div>
                <div className="text-center p-4 bg-green-50 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {maxPossibleXp}
                  </div>
                  <div className="text-sm text-green-600">Max Possible</div>
                </div>
              </div>

              {/* Quick Goal Status */}
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Goal Status</h4>
                {goalProgress.length > 0 ? (
                  goalProgress.map(goal => {
                    const details = getTaskTypeDetails(goal.taskType)
                    return (
                      <div key={goal.taskType} className="flex items-center justify-between p-2 rounded-lg border">
                        <div className="flex items-center gap-2">
                          <div className={`w-3 h-3 rounded-full ${details.color}`}></div>
                          <span className="text-sm font-medium">{details.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground">
                            {goal.current}/{goal.maximum}
                          </span>
                          {goal.percentage >= 100 ? (
                            <CheckCircle className="h-4 w-4 text-green-600" />
                          ) : (
                            <Clock className="h-4 w-4 text-orange-600" />
                          )}
                        </div>
                      </div>
                    )
                  })
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No goal data available
                  </p>
                )}
              </div>
            </TabsContent>

            {/* Progress Tab */}
            <TabsContent value="progress" className="space-y-4 mt-4">
              {goalProgress.length > 0 ? (
                goalProgress.map(goal => {
                  const details = getTaskTypeDetails(goal.taskType)
                  const maxXp = taskTypeXpValues[goal.taskType as keyof typeof taskTypeXpValues] || 0
                  const earnedFromThisTask = maxXp * goal.current
                  const potentialFromThisTask = maxXp * goal.maximum

                  return (
                    <div key={goal.taskType} className={`p-4 rounded-lg border ${details.lightBg}`}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-full ${details.color} flex items-center justify-center text-primary-foreground font-bold text-sm`}>
                            {goal.taskType}
                          </div>
                          <div>
                            <h4 className="font-medium">{details.name}</h4>
                            <p className="text-xs text-muted-foreground">
                              {earnedFromThisTask}/{potentialFromThisTask} XP
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={goal.percentage >= 100 ? 'success' : 'secondary'}
                        >
                          {goal.percentage}%
                        </Badge>
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex justify-between text-sm">
                          <span>Progress</span>
                          <span>{goal.current} / {goal.maximum}</span>
                        </div>
                        <Progress value={goal.percentage} className="h-3" />
                        
                        {goal.percentage >= 100 ? (
                          <div className="flex items-center gap-1 text-sm text-green-600">
                            <CheckCircle className="h-4 w-4" />
                            Goal completed! Maximum XP earned.
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">
                            {goal.maximum - goal.current} more needed to complete
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-8">
                  <Target className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-muted-foreground">No goals set for this week</p>
                </div>
              )}
            </TabsContent>

            {/* Insights Tab */}
            <TabsContent value="insights" className="space-y-4 mt-4">
              <div className="space-y-4">
                {/* Performance Insights */}
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-2">Performance Insights</h4>
                  <div className="space-y-2 text-sm text-blue-800">
                    {overallProgress >= 80 && (
                      <div className="flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        <span>Excellent progress! You're on track to complete most goals.</span>
                      </div>
                    )}
                    {overallProgress < 50 && timeRemaining.days <= 2 && (
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4" />
                        <span>Consider focusing on easier tasks to maximize XP before week ends.</span>
                      </div>
                    )}
                    {projectedWeeklyXp > currentWeekXp && (
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        <span>Projected to earn {projectedWeeklyXp} XP this week based on your pace.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Recommendations */}
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-2">Recommendations</h4>
                  <div className="space-y-2 text-sm text-green-800">
                    {goalProgress.some(g => g.percentage < 50) && (
                      <div className="flex items-center gap-2">
                        <Target className="h-4 w-4" />
                        <span>Focus on Task Types with low completion rates first.</span>
                      </div>
                    )}
                    {completedGoals === totalGoals && totalGoals > 0 && (
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4" />
                        <span>All goals completed! Consider reviewing submissions for bonus XP.</span>
                      </div>
                    )}
                    {currentWeekXp < maxPossibleXp * 0.5 && (
                      <div className="flex items-center gap-2">
                        <ChevronRight className="h-4 w-4" />
                        <span>You have {Math.round((maxPossibleXp - earnedXp) / 2)} XP potential remaining.</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Weekly Stats */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <div className="text-lg font-bold text-purple-600">
                      {Math.round((earnedXp / maxPossibleXp) * 100) || 0}%
                    </div>
                    <div className="text-xs text-purple-600">XP Efficiency</div>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <div className="text-lg font-bold text-orange-600">
                      {Math.round(currentWeekXp / Math.max(currentDayOfWeek, 1))}
                    </div>
                    <div className="text-xs text-orange-600">Daily Avg XP</div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        ) : (
          // Simplified view when showDetails is false
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Overall Progress</span>
              <span className="text-sm text-muted-foreground">
                {completedGoals}/{totalGoals} goals
              </span>
            </div>
            <Progress value={overallProgress} className="h-3" />
            
            {goalProgress.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                {goalProgress.slice(0, 4).map(goal => {
                  const details = getTaskTypeDetails(goal.taskType)
                  return (
                    <div key={goal.taskType} className="flex items-center gap-2 text-sm">
                      <div className={`w-2 h-2 rounded-full ${details.color}`}></div>
                      <span>{details.name}: {goal.current}/{goal.maximum}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
