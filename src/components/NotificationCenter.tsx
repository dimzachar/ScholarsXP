'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase-client'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { useAuth } from '@/contexts/AuthContext'
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
  Trash2
} from 'lucide-react'

interface Notification {
  id: string
  userId: string
  type:
    | 'XP_AWARDED'
    | 'REVIEW_ASSIGNED'
    | 'REVIEW_COMPLETED'
    | 'SUBMISSION_PROCESSED'
    | 'SUBMISSION_PROCESSING'
    | 'SUBMISSION_APPROVED'
    | 'SUBMISSION_REJECTED'
    | 'WEEKLY_SUMMARY'
    | 'STREAK_ACHIEVED'
    | 'PENALTY_APPLIED'
    | 'ADMIN_MESSAGE'
  title: string
  message: string
  data?: any
  metadata?: any
  read: boolean
  createdAt: Date | string
}

export default function NotificationCenter() {
  const { user } = useAuth()
  const responsiveLayout = useResponsiveLayout()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [lastFetchTime, setLastFetchTime] = useState<number>(0)
  const [subscriptionStatus, setSubscriptionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected')
  const [retryCount, setRetryCount] = useState(0)
  const channelRef = useRef<RealtimeChannel | null>(null)
  const lastFetchTimeRef = useRef<number>(0)

  const normalizeNotification = useCallback((raw: any): Notification => ({
    id: raw.id,
    userId: raw.userId ?? raw.user_id,
    type: raw.type,
    title: raw.title,
    message: raw.message,
    data: raw.data ?? raw.metadata,
    metadata: raw.data ?? raw.metadata,
    read: Boolean(raw.read),
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString()
  }), [])

  // Fallback mobile detection if hook fails
  const isMobile = responsiveLayout?.isMobile ?? (typeof window !== 'undefined' && window.innerWidth < 768)
  const isTablet = responsiveLayout?.isTablet ?? (typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024)

  // Debug: Log mobile state when component renders
  console.log('NotificationCenter render:', {
    isMobile,
    isTablet,
    windowWidth: typeof window !== 'undefined' ? window.innerWidth : 'SSR',
    hookResult: responsiveLayout
  })

  useEffect(() => {
    let channel: any = null

    const setupSubscription = async () => {
      if (!user) return
      return

      /*
      if (notifications.length === 0) {
        await fetchNotifications()
      }

      console.log('🔗 Setting up notification subscription for user:', user.id)

      channel = supabase
        .channel('realtime-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `userId=eq.${user.id}`,
          },
          (payload) => {
            console.log('📨 New notification received!', payload.new)
            const newNotification = payload.new as Notification
            setNotifications((prev) => {
              // Check if notification already exists to prevent duplicates
              const exists = prev.some(n => n.id === newNotification.id)
              if (exists) return prev
              return [newNotification, ...prev]
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `userId=eq.${user.id}`,
          },
          (payload) => {
            console.log('📝 Notification updated!', payload.new)
            const updatedNotification = payload.new as Notification
            setNotifications((prev) => {
              const updated = prev.map((notif) =>
                notif.id === updatedNotification.id ? updatedNotification : notif
              )
              // Only update state if something actually changed
              const hasChanges = updated.some((notif, index) =>
                notif.id === updatedNotification.id &&
                (notif.read !== prev[index]?.read || notif.message !== prev[index]?.message)
              )
              return hasChanges ? updated : prev
            })
          }
        )
        .subscribe((status) => {
          console.log('📡 Notification subscription status:', status)
          setSubscriptionStatus(
            status === 'SUBSCRIBED' ? 'connected' :
            status === 'CHANNEL_ERROR' ? 'disconnected' : 'connecting'
          )

          // Reset retry count on successful connection
          if (status === 'SUBSCRIBED') {
            setRetryCount(0)
          }
        })
    }

    */

    if (user) {
      setupSubscription()
    }

    return () => {
      if (channel) {
        console.log('🧹 Cleaning up notification subscription for user:', user?.id)
        supabase.removeChannel(channel)
        channel = null
      }
    }
  }, [user])

  useEffect(() => {
    if (!user) {
      if (channelRef.current) {
        console.log('🧹 Cleaning up notification subscription for user: none (signed out)')
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
      setSubscriptionStatus('disconnected')
      setNotifications([])
      setRetryCount(0)
      return
    }

    let isActive = true

    const setupSubscription = async () => {
      if (!isActive) return

      if (channelRef.current) {
        console.log('🧹 Cleaning up notification subscription for user:', user.id)
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }

      await fetchNotifications(true)

      console.log('🔗 Setting up notification subscription for user:', user.id)

      const channelName = `realtime-notifications-${user.id}-${retryCount}`
      const channel = supabase
        .channel(channelName)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `userId=eq.${user.id}`,
          },
          (payload) => {
            console.log('🔔 New notification received!', payload.new)
            const newNotification = normalizeNotification(payload.new)
            setNotifications((prev) => {
              const exists = prev.some((n) => n.id === newNotification.id)
              if (exists) return prev
              return [newNotification, ...prev]
            })
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `userId=eq.${user.id}`,
          },
          (payload) => {
            console.log('🔔 Notification updated!', payload.new)
            const updatedNotification = normalizeNotification(payload.new)
            setNotifications((prev) => {
              let hasChanges = false
              const updated = prev.map((notif) => {
                if (notif.id === updatedNotification.id) {
                  hasChanges =
                    notif.read !== updatedNotification.read ||
                    notif.message !== updatedNotification.message
                  return updatedNotification
                }
                return notif
              })
              return hasChanges ? updated : prev
            })
          }
        )

      setSubscriptionStatus('connecting')

      channel.subscribe((status) => {
        console.log('📡 Notification subscription status:', status)
        setSubscriptionStatus(
          status === 'SUBSCRIBED'
            ? 'connected'
            : status === 'CHANNEL_ERROR'
              ? 'disconnected'
              : 'connecting'
        )

        if (status === 'SUBSCRIBED') {
          setRetryCount(0)
        }

        if (status === 'CHANNEL_ERROR') {
          supabase.removeChannel(channel)
          channelRef.current = null
        }
      })

      channelRef.current = channel
    }

    setupSubscription()

    return () => {
      isActive = false
      if (channelRef.current) {
        console.log('🧹 Cleaning up notification subscription for user:', user.id)
        supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [user?.id, retryCount, fetchNotifications, normalizeNotification])

  // Retry logic for failed connections
  useEffect(() => {
    const maxRetries = 3

    if (subscriptionStatus === 'disconnected' && retryCount < maxRetries && user) {
      const retryDelay = 5000 * Math.pow(2, retryCount) // Exponential backoff: 5s, 10s, 20s

      console.log(`🔄 Scheduling retry ${retryCount + 1}/${maxRetries} in ${retryDelay}ms`)

      const retryTimer = setTimeout(() => {
        console.log(`🔄 Retrying notification subscription (attempt ${retryCount + 1}/${maxRetries})`)
        setRetryCount(prev => prev + 1)
      }, retryDelay)

      return () => clearTimeout(retryTimer)
    }
  }, [subscriptionStatus, retryCount, user])

  const fetchNotifications = useCallback(async (force: boolean = false) => {
    if (!user) return

    const now = Date.now()
    if (!force && now - lastFetchTimeRef.current < 5000) {
      return
    }

    setLoading(true)
    try {
      const response = await fetch('/api/notifications?limit=20', {
        credentials: 'include'
      })

      if (response.ok) {
        const body = await response.json()
        const payload = body?.data
        const items = Array.isArray(payload?.notifications)
          ? payload.notifications.map((item: any) => normalizeNotification(item))
          : []

        setNotifications(items)
        setLastFetchTime(now)
        lastFetchTimeRef.current = now
      } else if (response.status === 401) {
        console.log('User not authenticated')
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }, [user?.id, normalizeNotification])

  const markAsRead = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        setNotifications(prev =>
          prev.map(notif =>
            notif.id === notificationId ? { ...notif, read: true } : notif
          )
        )
      }
    } catch (error) {
      console.error('Error marking notification as read:', error)
    }
  }

  const deleteNotification = async (notificationId: string) => {
    try {
      const response = await fetch(`/api/notifications/${notificationId}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        setNotifications(prev =>
          prev.filter(notif => notif.id !== notificationId)
        )
      }
    } catch (error) {
      console.error('Error deleting notification:', error)
    }
  }

  const markAllAsRead = async () => {
    try {
      const response = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (response.ok) {
        setNotifications(prev =>
          prev.map(notif => ({ ...notif, read: true }))
        )
      }
    } catch (error) {
      console.error('Error marking all notifications as read:', error)
    }
  }

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'XP_AWARDED':
        return <Zap className="h-4 w-4 text-primary" />
      case 'REVIEW_ASSIGNED':
        return <Users className="h-4 w-4 text-secondary-foreground" />
      case 'REVIEW_COMPLETED':
      case 'SUBMISSION_APPROVED':
        return <CheckCircle className="h-4 w-4 text-primary" />
      case 'SUBMISSION_PROCESSING':
      case 'SUBMISSION_PROCESSED':
        return <Clock className="h-4 w-4 text-muted-foreground" />
      case 'SUBMISSION_REJECTED':
      case 'PENALTY_APPLIED':
        return <AlertCircle className="h-4 w-4 text-destructive" />
      case 'STREAK_ACHIEVED':
        return <Zap className="h-4 w-4 text-secondary-foreground" />
      case 'ADMIN_MESSAGE':
        return <Bell className="h-4 w-4 text-secondary-foreground" />
      default:
        return <Bell className="h-4 w-4 text-muted-foreground" />
    }
  }



  const unreadCount = notifications.filter(n => !n.read).length

  return (
    <div className="relative">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative ${isMobile ? 'p-2 h-10 w-10' : 'p-2'} touch-manipulation`}
        aria-label={`Notifications ${unreadCount > 0 ? `(${unreadCount} unread)` : ''} ${isMobile ? '(Mobile)' : ''} - ${subscriptionStatus}`}
        title={`${isMobile ? 'Mobile ' : ''}Notification Center - ${subscriptionStatus === 'connected' ? 'Real-time updates active' : subscriptionStatus === 'connecting' ? 'Connecting...' : 'Offline'}`}
      >
        {unreadCount > 0 ? (
          <BellRing className={`${isMobile ? 'h-5 w-5' : 'h-5 w-5'}`} />
        ) : (
          <Bell className={`${isMobile ? 'h-5 w-5' : 'h-5 w-5'}`} />
        )}
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className={`absolute flex items-center justify-center p-0 text-xs ${
              isMobile
                ? '-top-0.5 -right-0.5 h-4 w-4 min-w-4'
                : '-top-1 -right-1 h-5 w-5'
            }`}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsOpen(false)}
          />

          {/* Notification Panel */}
          <div className={`
            z-50
            ${isMobile
              ? 'fixed inset-0 flex items-start justify-center pt-16 px-4 pb-4'
              : `absolute mt-2 ${isTablet ? 'right-0 top-full w-96' : 'right-0 top-full w-80'}`
            }
          `}>
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
                    <div className={`flex items-center gap-1 ${isMobile ? 'ml-1' : 'ml-2'}`}>
                      <div className={`w-2 h-2 rounded-full ${
                        subscriptionStatus === 'connected' ? 'bg-green-500' :
                        subscriptionStatus === 'connecting' ? 'bg-yellow-500 animate-pulse' :
                        'bg-red-500'
                      }`} title={`Real-time status: ${subscriptionStatus}`} />
                    </div>
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsOpen(false)}
                    className={isMobile ? 'h-9 w-9 p-0 rounded-full' : 'h-8 w-8 p-0'}
                    aria-label="Close notifications"
                  >
                    <X className={isMobile ? 'h-5 w-5' : 'h-4 w-4'} />
                  </Button>
                </div>
                {unreadCount > 0 && (
                  <div className={`flex items-center justify-between ${isMobile ? 'mt-2' : ''}`}>
                    <CardDescription className={isMobile ? 'text-xs' : ''}>
                      {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
                    </CardDescription>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={markAllAsRead}
                      className={`${isMobile ? 'text-xs h-7 px-2' : 'text-xs'}`}
                    >
                      Mark all read
                    </Button>
                  </div>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {loading ? (
                  <div className={`text-center ${isMobile ? 'p-3' : 'p-4'}`}>
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    <p className={`text-muted-foreground mt-2 ${isMobile ? 'text-xs' : 'text-sm'}`}>Loading notifications...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className={`text-center ${isMobile ? 'p-4' : 'p-6'}`}>
                    <Bell className={`text-muted-foreground mx-auto mb-2 ${isMobile ? 'h-6 w-6' : 'h-8 w-8'}`} />
                    <p className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-sm'}`}>No notifications yet</p>
                  </div>
                ) : (
                  <div className={`overflow-y-auto ${isMobile ? 'max-h-[50vh]' : 'max-h-96'}`}>
                    {notifications.map((notification, index) => (
                      <div key={notification.id}>
                        <div
                          className={`hover:bg-accent cursor-pointer transition-colors ${
                            !notification.read ? 'bg-primary/5' : ''
                          } ${isMobile ? 'p-3' : 'p-4'}`}
                          onClick={() => !notification.read && markAsRead(notification.id)}
                        >
                          <div className={`flex items-start ${isMobile ? 'gap-2' : 'gap-3'}`}>
                            <div className="mt-0.5 flex-shrink-0">
                              {getNotificationIcon(notification.type)}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className={`flex items-center gap-2 ${isMobile ? 'mb-0.5' : 'mb-1'}`}>
                                <p className={`font-medium ${
                                  !notification.read ? 'text-foreground' : 'text-muted-foreground'
                                } ${isMobile ? 'text-xs' : 'text-sm'}`}>
                                  {notification.title}
                                </p>
                                {!notification.read && (
                                  <div className={`bg-primary rounded-full ${isMobile ? 'w-1.5 h-1.5' : 'w-2 h-2'}`}></div>
                                )}
                              </div>

                              <p className={`text-muted-foreground mb-2 ${isMobile ? 'text-xs leading-tight' : 'text-xs'}`}>
                                {notification.message}
                              </p>

                              <div className={`flex items-center justify-between ${isMobile ? 'gap-2' : ''}`}>
                                <p className={`text-muted-foreground ${isMobile ? 'text-xs' : 'text-xs'}`}>
                                  {isMobile
                                    ? new Date(notification.createdAt).toLocaleDateString('en-US', {
                                        month: 'short',
                                        day: 'numeric'
                                      })
                                    : new Date(notification.createdAt).toLocaleDateString()
                                  }
                                </p>

                                {(notification.metadata ?? notification.data)?.xpAmount && (
                                  <Badge variant="outline" className={`${isMobile ? 'text-xs px-1.5 py-0.5' : 'text-xs'}`}>
                                    +{(notification.metadata ?? notification.data)?.xpAmount} XP
                                  </Badge>
                                )}
                              </div>
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
                                  className={`h-auto flex-shrink-0 ${isMobile ? 'p-1 w-6 h-6' : 'p-1'}`}
                                  title="Mark as read"
                                >
                                  <Check className={`${isMobile ? 'h-3 w-3' : 'h-3 w-3'}`} />
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  deleteNotification(notification.id)
                                }}
                                className={`h-auto flex-shrink-0 ${isMobile ? 'p-1 w-6 h-6' : 'p-1'} text-destructive hover:text-destructive`}
                                title="Delete notification"
                              >
                                <Trash2 className={`${isMobile ? 'h-3 w-3' : 'h-3 w-3'}`} />
                              </Button>
                            </div>
                          </div>
                        </div>
                        
                        {index < notifications.length - 1 && <Separator />}
                      </div>
                    ))}
                  </div>
                )}

                {notifications.length > 0 && (
                  <>
                    <Separator />
                    <div className={isMobile ? 'p-2' : 'p-3'}>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => fetchNotifications(true)}
                        disabled={loading}
                        className={`w-full ${isMobile ? 'text-xs h-8' : 'text-xs'}`}
                      >
                        <Clock className={`mr-2 ${isMobile ? 'h-3 w-3' : 'h-3 w-3'}`} />
                        {loading ? 'Refreshing...' : 'Refresh'}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

