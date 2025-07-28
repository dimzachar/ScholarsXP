"use client"

import React from 'react'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useResponsiveLayout, TOUCH_TARGET_SIZE } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface TabItem {
  value: string
  label: string
  icon: LucideIcon
  mobileLabel?: string // Shorter label for mobile
}

interface MobileTabNavigationProps {
  tabs: TabItem[]
  className?: string
}

export function MobileTabNavigation({ tabs, className }: MobileTabNavigationProps) {
  const { isMobile, isTablet } = useResponsiveLayout()
  
  // Use shorter labels on mobile if available
  const getTabLabel = (tab: TabItem) => {
    if (isMobile && tab.mobileLabel) {
      return tab.mobileLabel
    }
    return tab.label
  }

  // Determine if we should show icons based on screen size
  const showIcons = !isMobile || tabs.length <= 3

  return (
    <div className={cn('w-full', className)}>
      <TabsList 
        className={cn(
          'grid w-full mb-6 h-auto',
          // Dynamic grid columns based on tab count
          tabs.length === 2 && 'grid-cols-2',
          tabs.length === 3 && 'grid-cols-3',
          tabs.length === 4 && 'grid-cols-2 sm:grid-cols-4',
          tabs.length === 5 && 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
          // Mobile-specific styling
          isMobile && 'gap-1 p-1',
          // Tablet and desktop styling
          !isMobile && 'gap-2 p-2'
        )}
      >
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className={cn(
              'flex items-center gap-2 transition-all duration-200',
              // Touch target sizing for mobile - using static Tailwind classes
              isMobile && 'min-h-11', // 44px minimum touch target
              isTablet && 'min-h-12', // 48px comfortable touch target
              // Text sizing adjustments
              isMobile && 'text-sm px-3 py-2',
              isTablet && 'text-sm px-4 py-3',
              !isMobile && !isTablet && 'text-base px-6 py-3',
              // Enhanced focus states for accessibility
              'focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
              // Active state enhancements
              'data-[state=active]:bg-primary data-[state=active]:text-primary-foreground',
              'data-[state=active]:shadow-sm',
              // Hover states (disabled on touch devices)
              'hover:bg-muted/50 data-[state=active]:hover:bg-primary/90'
            )}
          >
            {showIcons && (
              <tab.icon 
                className={cn(
                  'shrink-0',
                  isMobile ? 'h-4 w-4' : 'h-5 w-5'
                )} 
              />
            )}
            <span className={cn(
              'truncate',
              // Hide text on very small screens if we have many tabs
              isMobile && tabs.length > 3 && 'sr-only'
            )}>
              {getTabLabel(tab)}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </div>
  )
}

// Enhanced tab navigation with swipe gesture support
export function SwipeableTabNavigation({ 
  tabs, 
  activeTab, 
  onTabChange, 
  className 
}: MobileTabNavigationProps & {
  activeTab: string
  onTabChange: (value: string) => void
}) {
  const { isMobile } = useResponsiveLayout()
  const [touchStart, setTouchStart] = React.useState<number | null>(null)
  const [touchEnd, setTouchEnd] = React.useState<number | null>(null)

  // Minimum swipe distance (in px)
  const minSwipeDistance = 50

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe || isRightSwipe) {
      const currentIndex = tabs.findIndex(tab => tab.value === activeTab)
      
      if (isLeftSwipe && currentIndex < tabs.length - 1) {
        // Swipe left - next tab
        onTabChange(tabs[currentIndex + 1].value)
      } else if (isRightSwipe && currentIndex > 0) {
        // Swipe right - previous tab
        onTabChange(tabs[currentIndex - 1].value)
      }
    }
  }

  return (
    <div 
      className={cn('w-full', className)}
      onTouchStart={isMobile ? handleTouchStart : undefined}
      onTouchMove={isMobile ? handleTouchMove : undefined}
      onTouchEnd={isMobile ? handleTouchEnd : undefined}
    >
      <MobileTabNavigation tabs={tabs} />
      
      {/* Swipe indicator for mobile */}
      {isMobile && tabs.length > 1 && (
        <div className="flex justify-center mb-2">
          <div className="flex gap-1">
            {tabs.map((tab, index) => (
              <div
                key={tab.value}
                className={cn(
                  'h-1 w-6 rounded-full transition-colors duration-200',
                  tab.value === activeTab ? 'bg-primary' : 'bg-muted'
                )}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Utility function to create tab items
export function createTabItem(
  value: string,
  label: string,
  icon: LucideIcon,
  mobileLabel?: string
): TabItem {
  return {
    value,
    label,
    icon,
    mobileLabel
  }
}
