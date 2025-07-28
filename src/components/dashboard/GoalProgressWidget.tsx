'use client'

import React from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Target, TrendingUp, CheckCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getTaskType } from '@/lib/task-types'
import type { TaskTypeId } from '@/types/task-types'

interface GoalProgressData {
  taskType: string
  current: number
  maximum: number
  percentage: number
  xpEarned?: number
  weeklyTarget?: number
}

interface GoalProgressWidgetProps {
  goalProgress: GoalProgressData[]
  className?: string
  showDetails?: boolean
  onGoalClick?: (taskType: string) => void
}

// Get task type display names from the actual task configuration
const getTaskTypeDisplayName = (taskType: string): string => {
  try {
    const taskConfig = getTaskType(taskType as TaskTypeId)
    return `Task ${taskType} - ${taskConfig.name}`
  } catch (error) {
    return `Task ${taskType}`
  }
}

const taskTypeColors: Record<string, string> = {
  'A': 'bg-chart-1',
  'B': 'bg-chart-2',
  'C': 'bg-chart-3',
  'D': 'bg-warning',
  'E': 'bg-destructive',
  'F': 'bg-purple'
}

export function GoalProgressWidget({ 
  goalProgress, 
  className, 
  showDetails = true,
  onGoalClick 
}: GoalProgressWidgetProps) {
  if (!goalProgress || goalProgress.length === 0) {
    return (
      <Card className={cn("", className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-5 w-5" />
            Weekly Goals
          </CardTitle>
          <CardDescription>Track your progress towards weekly task limits</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">No goal data available</p>
        </CardContent>
      </Card>
    )
  }

  const completedGoals = goalProgress.filter(goal => goal.percentage >= 100).length
  const totalGoals = goalProgress.length

  return (
    <Card className={cn("h-full", className)}>
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
              <Target className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="font-semibold">Weekly Goals</div>
              <div className="text-sm text-muted-foreground font-normal">Task completion progress</div>
            </div>
          </span>
          <Badge
            variant={completedGoals === totalGoals ? "default" : "secondary"}
            className="text-xs px-2 py-1"
          >
            {completedGoals}/{totalGoals} Complete
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {goalProgress.map((goal, index) => {
            const isComplete = goal.percentage >= 100
            const isNearComplete = goal.percentage >= 80 && goal.percentage < 100
            
            return (
              <div 
                key={index}
                className={cn(
                  "p-4 rounded-lg border transition-colors",
                  onGoalClick && "cursor-pointer hover:bg-muted/50",
                  isComplete && "bg-green-50 border-green-200 dark:bg-green-950 dark:border-green-800"
                )}
                onClick={() => onGoalClick?.(goal.taskType)}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div 
                      className={cn(
                        "w-3 h-3 rounded-full",
                        taskTypeColors[goal.taskType] || "bg-gray-500"
                      )}
                    />
                    <span className="font-medium text-sm">
                      {getTaskTypeDisplayName(goal.taskType)}
                    </span>
                    {isComplete && <CheckCircle className="h-4 w-4 text-green-600" />}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold">
                      {goal.current}/{goal.maximum}
                    </span>
                    {showDetails && goal.xpEarned && (
                      <Badge variant="outline" className="text-xs">
                        {goal.xpEarned} XP
                      </Badge>
                    )}
                  </div>
                </div>
                
                <Progress 
                  value={Math.min(goal.percentage, 100)} 
                  className={cn(
                    "h-2",
                    isComplete && "bg-green-100 dark:bg-green-900"
                  )}
                />
                
                {showDetails && (
                  <div className="flex items-center justify-between mt-2 text-xs text-muted-foreground">
                    <span>
                      {goal.percentage.toFixed(0)}% complete
                    </span>
                    {goal.weeklyTarget && (
                      <span className="flex items-center gap-1">
                        <TrendingUp className="h-3 w-3" />
                        Target: {goal.weeklyTarget}
                      </span>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
        
        {showDetails && (
          <div className="mt-4 p-3 bg-muted/50 rounded-lg">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">
                {((completedGoals / totalGoals) * 100).toFixed(0)}% of goals completed
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
