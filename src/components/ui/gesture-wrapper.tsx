"use client"

import React, { useState, useRef } from 'react'
import { useSwipeable } from 'react-swipeable'
import { motion, AnimatePresence } from 'framer-motion'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'

interface GestureWrapperProps {
  children: React.ReactNode
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onPullToRefresh?: () => Promise<void>
  enablePullToRefresh?: boolean
  className?: string
  swipeThreshold?: number
  pullThreshold?: number
}

export function GestureWrapper({
  children,
  onSwipeLeft,
  onSwipeRight,
  onSwipeUp,
  onSwipeDown,
  onPullToRefresh,
  enablePullToRefresh = false,
  className,
  swipeThreshold = 50,
  pullThreshold = 80
}: GestureWrapperProps) {
  const { isMobile } = useResponsiveLayout()
  const [isPulling, setIsPulling] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const startY = useRef(0)
  const scrollTop = useRef(0)


  // Swipe handlers
  const handlers = useSwipeable({
    onSwipedLeft: () => onSwipeLeft?.(),
    onSwipedRight: () => onSwipeRight?.(),
    onSwipedUp: () => onSwipeUp?.(),
    onSwipedDown: () => onSwipeDown?.(),
    swipeDuration: 500,
    preventScrollOnSwipe: false,
    trackMouse: false, // Only track touch on mobile
    delta: swipeThreshold,
  })

  // Simplified pull-to-refresh handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!enablePullToRefresh || !isMobile) return

    const touch = e.touches[0]
    startY.current = touch.clientY
    scrollTop.current = window.scrollY || document.documentElement.scrollTop
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!enablePullToRefresh || !isMobile || isRefreshing) return

    const touch = e.touches[0]
    const currentY = touch.clientY
    const deltaY = currentY - startY.current

    // Only trigger pull to refresh if we're at the top of the page and pulling down
    if (scrollTop.current <= 10 && deltaY > 0) {
      const distance = Math.min(deltaY * 0.6, pullThreshold * 1.5)
      setPullDistance(distance)
      setIsPulling(distance > pullThreshold)

      // Debug log
      console.log('Pull distance:', distance, 'Threshold:', pullThreshold, 'Pulling:', distance > pullThreshold)
    }
  }

  const handleTouchEnd = async () => {
    if (!enablePullToRefresh || !isMobile || isRefreshing) return

    if (isPulling && pullDistance > pullThreshold && onPullToRefresh) {
      setIsRefreshing(true)
      try {
        await onPullToRefresh()
      } catch (error) {
        console.error('Pull to refresh failed:', error)
      } finally {
        setIsRefreshing(false)
        setIsPulling(false)
        setPullDistance(0)
      }
    } else {
      setIsPulling(false)
      setPullDistance(0)
    }
  }



  // Don't apply gesture handling on desktop unless specifically needed
  if (!isMobile) {
    return <div className={className}>{children}</div>
  }

  return (
    <div
      {...handlers}
      className={cn('relative overflow-hidden', className)}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      style={{ touchAction: enablePullToRefresh && isMobile ? 'pan-x pan-down' : 'auto' }}
    >
      {/* Pull to refresh indicator */}
      <AnimatePresence>
        {enablePullToRefresh && (pullDistance > 0 || isRefreshing) && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center bg-primary/10 backdrop-blur-sm border-b border-primary/20"
            style={{ height: Math.max(pullDistance, 40) }}
          >
            <div className="flex items-center gap-2 text-primary">
              <RefreshCw
                className={cn(
                  'h-5 w-5 transition-transform duration-200',
                  isRefreshing && 'animate-spin',
                  isPulling && !isRefreshing && 'rotate-180'
                )}
              />
              <span className="text-sm font-medium">
                {isRefreshing
                  ? 'Refreshing...'
                  : isPulling
                    ? 'Release to refresh'
                    : 'Pull to refresh'
                }
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content with pull transform */}
      <motion.div
        animate={{
          y: enablePullToRefresh ? pullDistance : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 300,
          damping: 30,
        }}
      >
        {children}
      </motion.div>
    </div>
  )
}

// Swipeable tabs component
interface SwipeableTabsProps {
  tabs: Array<{
    id: string
    label: string
    content: React.ReactNode
  }>
  activeTab: string
  onTabChange: (tabId: string) => void
  className?: string
}

export function SwipeableTabs({
  tabs,
  activeTab,
  onTabChange,
  className
}: SwipeableTabsProps) {
  const { isMobile } = useResponsiveLayout()
  const activeIndex = tabs.findIndex(tab => tab.id === activeTab)

  const handleSwipeLeft = () => {
    const nextIndex = Math.min(activeIndex + 1, tabs.length - 1)
    if (nextIndex !== activeIndex) {
      onTabChange(tabs[nextIndex].id)
    }
  }

  const handleSwipeRight = () => {
    const prevIndex = Math.max(activeIndex - 1, 0)
    if (prevIndex !== activeIndex) {
      onTabChange(tabs[prevIndex].id)
    }
  }

  if (!isMobile) {
    // Desktop fallback - just show active content
    const activeTabContent = tabs.find(tab => tab.id === activeTab)?.content
    return <div className={className}>{activeTabContent}</div>
  }

  return (
    <GestureWrapper
      onSwipeLeft={handleSwipeLeft}
      onSwipeRight={handleSwipeRight}
      className={className}
    >
      <div className="relative overflow-hidden">
        <motion.div
          className="flex"
          animate={{
            x: `-${activeIndex * 100}%`,
          }}
          transition={{
            type: 'spring',
            stiffness: 300,
            damping: 30,
          }}
        >
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className="w-full flex-shrink-0"
            >
              {tab.content}
            </div>
          ))}
        </motion.div>
      </div>

      {/* Swipe indicators */}
      <div className="flex justify-center mt-4 gap-2">
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'h-2 rounded-full transition-all duration-200',
              index === activeIndex 
                ? 'w-8 bg-primary' 
                : 'w-2 bg-muted-foreground/30'
            )}
          />
        ))}
      </div>
    </GestureWrapper>
  )
}

// Touch feedback component
interface TouchFeedbackProps {
  children: React.ReactNode
  onPress?: () => void
  className?: string
  disabled?: boolean
}

export function TouchFeedback({
  children,
  onPress,
  className,
  disabled = false
}: TouchFeedbackProps) {
  const { isMobile } = useResponsiveLayout()
  const [isPressed, setIsPressed] = useState(false)

  if (!isMobile || disabled) {
    return (
      <div className={className} onClick={onPress}>
        {children}
      </div>
    )
  }

  return (
    <motion.div
      className={cn('cursor-pointer', className)}
      onTouchStart={() => setIsPressed(true)}
      onTouchEnd={() => {
        setIsPressed(false)
        onPress?.()
      }}
      onTouchCancel={() => setIsPressed(false)}
      animate={{
        scale: isPressed ? 0.95 : 1,
      }}
      transition={{
        type: 'spring',
        stiffness: 400,
        damping: 25,
      }}
    >
      {children}
    </motion.div>
  )
}
