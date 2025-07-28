'use client'

import React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface AnalyticsLoadingSkeletonProps {
  className?: string
  variant?: 'chart' | 'widget' | 'insights'
}

export function AnalyticsLoadingSkeleton({ 
  className, 
  variant = 'chart' 
}: AnalyticsLoadingSkeletonProps) {
  return (
    <Card className={cn("animate-pulse", className)}>
      <CardHeader>
        <div className="space-y-2">
          <div className="h-5 bg-muted rounded w-1/3"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      </CardHeader>
      <CardContent>
        {variant === 'chart' && (
          <div className="space-y-4">
            {/* Chart area */}
            <div className="h-64 bg-muted rounded-lg"></div>
            {/* Legend */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </div>
              <div className="space-y-2">
                <div className="h-3 bg-muted rounded w-2/3"></div>
                <div className="h-3 bg-muted rounded w-3/4"></div>
              </div>
            </div>
          </div>
        )}
        
        {variant === 'widget' && (
          <div className="space-y-4">
            {/* Progress bars */}
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <div className="flex justify-between">
                  <div className="h-4 bg-muted rounded w-1/3"></div>
                  <div className="h-4 bg-muted rounded w-1/6"></div>
                </div>
                <div className="h-2 bg-muted rounded"></div>
              </div>
            ))}
          </div>
        )}
        
        {variant === 'insights' && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-3 border rounded-lg space-y-2">
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 bg-muted rounded"></div>
                  <div className="h-4 bg-muted rounded w-1/4"></div>
                  <div className="h-5 bg-muted rounded w-16"></div>
                </div>
                <div className="space-y-1">
                  <div className="h-3 bg-muted rounded w-full"></div>
                  <div className="h-3 bg-muted rounded w-3/4"></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default AnalyticsLoadingSkeleton
