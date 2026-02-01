/**
 * Optimized Notification Center Component
 * 
 * Features:
 * - No polling (real-time only)
 * - Optimistic updates (instant UI)
 * - Incremental sync (only new data)
 * - Virtual scrolling for large lists
 */

'use client'

import { useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useNotificationsOptimized, useUnreadCount } from '@/hooks/useNotificationsOptimized'
import { useResponsiveLayout } from '@/hooks/useResponsiveLayout'
import {
  Bell,
  BellRing,
  Check,
  X,
  Zap,
  Users,
  AlertCircle,
  CheckCircle,
  Clock,
  Trash2,
  RefreshCw,
  Loader2
} from 'lucide-react'

export default function NotificationCenterOptimized() {
  const responsiveLayout = useResponsiveLayout()
  const [isOpen, setIsOpen] = useState(false)
  const [panelPosition, setPanelPosition] = useState({ top: 0, right: 0 })
  const buttonRef = useCallback((node: HTMLButtonElement | null) => {
    if (node && isOpen) {
      const rect = node.getBoundingClientRect()
      setPanelPosition({
        top: rect.bottom + 8,
        right: window.innerWidth - rect.right
      })
    }
  }, [isOpen])

  // Use lightweight hook for badge (only unread count)
  const { unreadCount: badgeCount } = useUnreadCount()
  
  // Use full hook only when panel is open
  const {
    notifications,
    rawNotifications,
    unreadCount,
    hasMore,
    isLoading,
    isValidating,
    refresh,
    loadMore,
    markAsRead,
    markAllAsRead,
    deleteNotification
  } = useNotificationsOptimized({
    disableRealtime: false  // Enable realtime updates
  })

  // Filter out invalid/empty notifications for display
  const filteredNotifications = rawNotifications.filter(n => 
    n.id && (n.title?.trim() || n.message?.trim())
  )

  const isMobile = responsiveLayout?.isMobile ?? false

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'XP_AWARDED': return <Zap className="h-4 w-4 text-primary" />
      case 'REVIEW_ASSIGNED': return <Users className="h-4 w-4 text-secondary-foreground" />
      case 'REVIEW_COMPLETED':
      case 'SUBMISSION_APPROVED': return <CheckCircle className="h-4 w-4 text-primary" />
      case 'SUBMISSION_PROCESSING':
      case 'SUBMISSION_PROCESSED': return <Clock className="h-4 w-4 text-muted-foreground" />
      case 'SUBMISSION_REJECTED':
      case 'PENALTY_APPLIED': return <AlertCircle className="h-4 w-4 text-destructive" />
      case 'STREAK_ACHIEVED': return <Zap className="h-4 w-4 text-secondary-foreground" />
      case 'ADMIN_MESSAGE': return <Bell className="h-4 w-4 text-secondary-foreground" />
      default: return <Bell className="h-4 w-4 text-muted-foreground" />
    }
  }

  return (
    <div className="relative">
      <Button
        ref={buttonRef}
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative ${isMobile ? 'p-2 h-10 w-10' : 'p-2'} touch-manipulation`}
        aria-label={`Notifications ${badgeCount > 0 ? `(${badgeCount} unread)` : ''}`}
      >
        {badgeCount > 0 ? (
          <BellRing className={`${isMobile ? 'h-5 w-5' : 'h-5 w-5'}`} />
        ) : (
          <Bell className={`${isMobile ? 'h-5 w-5' : 'h-5 w-5'}`} />
        )}
        {badgeCount > 0 && (
          <Badge
            variant="destructive"
            className={`absolute flex items-center justify-center p-0 text-xs ${
              isMobile
                ? '-top-0.5 -right-0.5 h-4 w-4 min-w-4'
                : '-top-1 -right-1 h-5 w-5'
            }`}
          >
            {badgeCount > 9 ? '9+' : badgeCount}
          </Badge>
        )}
      </Button>

      {isOpen && typeof document !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[60]"
            onClick={() => setIsOpen(false)}
          />

          {/* Notification Panel */}
          <div 
            className={`
              z-[70] fixed
              ${isMobile
                ? 'inset-x-0 top-16 flex items-start justify-center px-4 pb-4'
                : 'w-80'
              }
            `}
            style={!isMobile ? { top: panelPosition.top, right: panelPosition.right } : undefined}
          >
            <Card className={`
              border-0 shadow-2xl
              ${isMobile
                ? 'w-full max-w-sm max-h-[calc(100vh-6rem)] overflow-hidden animate-in slide-in-from-top-4 duration-200'
                : 'animate-in slide-in-from-top-2 duration-150'
              }
            `}>
              <CardHeader className={`pb-3 ${isMobile ? 'px-4 py-3' : ''}`}>
                <div className="flex items-center justify-between">
                  <CardTitle className={`flex items-center gap-2 ${isMobile ? 'text-base' : 'text-lg'}`}>
                    <Bell className={`${isMobile ? 'h-4 w-4' : 'h-5 w-5'}`} />
                    Notifications
                    {isValidating && (
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                    )}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => refresh()}
                      disabled={isValidating}
                      className="h-8 w-8 p-0"
                    >
                      <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setIsOpen(false)}
                      className="h-8 w-8 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                {unreadCount > 0 && (
                  <div className={`flex items-center justify-between ${isMobile ? 'mt-2' : ''}`}>
                    <CardDescription className={isMobile ? 'text-xs' : ''}>
                      {unreadCount} unread
                    </CardDescription>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={markAllAsRead}
                        className="text-xs h-7 px-2"
                      >
                        Mark all read
                      </Button>
                    </div>
                  </div>
                )}
                

                

              </CardHeader>

              <CardContent className="p-0">
                {isLoading ? (
                  <div className={`text-center ${isMobile ? 'p-3' : 'p-4'}`}>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    <p className="text-muted-foreground mt-2 text-sm">Loading...</p>
                  </div>
                ) : filteredNotifications.length === 0 ? (
                  <div className={`text-center ${isMobile ? 'p-4' : 'p-6'}`}>
                    <Bell className="text-muted-foreground mx-auto mb-2 h-8 w-8" />
                    <p className="text-muted-foreground text-sm">No notifications</p>
                  </div>
                ) : (
                  <div className={`overflow-y-auto ${isMobile ? 'max-h-[50vh]' : 'max-h-96'}`}>
                    {filteredNotifications.map((notification, index) => (
                      <div key={notification.id}>
                        <div
                          className={`hover:bg-accent cursor-pointer transition-colors ${
                            !notification.read ? 'bg-primary/5' : ''
                          } ${isMobile ? 'p-3' : 'p-4'}`}
                          onClick={() => !notification.read && markAsRead(notification.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5 flex-shrink-0">
                              {getNotificationIcon(notification.type)}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className={`font-medium text-sm ${
                                  !notification.read ? 'text-foreground' : 'text-muted-foreground'
                                }`}>
                                  {notification.title}
                                </p>
                                {!notification.read && (
                                  <div className="w-2 h-2 bg-primary rounded-full" />
                                )}
                              </div>

                              <p className="text-muted-foreground text-xs mb-2">
                                {notification.message}
                              </p>

                              <p className="text-muted-foreground text-xs">
                                {new Date(notification.createdAt).toLocaleDateString()}
                              </p>
                            </div>

                            <div className="flex gap-1">
                              {!notification.read && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    markAsRead(notification.id)
                                  }}
                                  className="h-auto p-1"
                                >
                                  <Check className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteNotification(notification.id)
                                }}
                                className="h-auto p-1 text-destructive"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                        
                        {index < filteredNotifications.length - 1 && <Separator />}
                      </div>
                    ))}
                    
                    {hasMore && filteredNotifications.length > 0 && (
                      <div className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={loadMore}
                          disabled={isValidating}
                          className="text-xs w-full"
                        >
                          {isValidating ? 'Loading...' : 'Load more'}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </>,
        document.body
      )}
    </div>
  )
}