'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { supabase } from '@/lib/supabase-client'
import { useAuth } from '@/contexts/AuthContext'
import {
  Bell,
  BellRing,
  Check,
  X,
  Zap,
  Users,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react'

interface Notification {
  id: string
  userId: string
  type: 'XP_AWARDED' | 'REVIEW_ASSIGNED' | 'REVIEW_COMPLETED' | 'SUBMISSION_PROCESSED' | 'WEEKLY_SUMMARY' | 'STREAK_ACHIEVED' | 'PENALTY_APPLIED' | 'ADMIN_MESSAGE'
  title: string
  message: string
  data?: any
  read: boolean
  createdAt: Date | string
}

export default function NotificationCenter() {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user) {
      fetchNotifications()
      setupRealtimeSubscription()
    }
  }, [user])

  const setupRealtimeSubscription = () => {
    if (!user) return

    const channel = supabase
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
          console.log('New notification received!', payload.new)
          const newNotification = payload.new as Notification
          setNotifications((prev) => [newNotification, ...prev])
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
          console.log('Notification updated!', payload.new)
          const updatedNotification = payload.new as Notification
          setNotifications((prev) =>
            prev.map((notif) =>
              notif.id === updatedNotification.id ? updatedNotification : notif
            )
          )
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  const fetchNotifications = async () => {
    if (!user) return

    setLoading(true)
    try {
      const response = await fetch('/api/notifications?limit=20')
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications || [])
      } else if (response.status === 401) {
        console.log('User not authenticated')
      }
    } catch (error) {
      console.error('Error fetching notifications:', error)
    } finally {
      setLoading(false)
    }
  }

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
      case 'xp_awarded':
        return <Zap className="h-4 w-4 text-primary" />
      case 'review_assigned':
        return <Users className="h-4 w-4 text-secondary-foreground" />
      case 'review_completed':
        return <CheckCircle className="h-4 w-4 text-primary" />
      case 'system_alert':
        return <AlertCircle className="h-4 w-4 text-destructive" />
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
        className="relative p-2"
      >
        {unreadCount > 0 ? (
          <BellRing className="h-5 w-5" />
        ) : (
          <Bell className="h-5 w-5" />
        )}
        {unreadCount > 0 && (
          <Badge 
            variant="destructive" 
            className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
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
          <div className="absolute right-0 top-full mt-2 w-80 z-50">
            <Card className="border-0 shadow-2xl">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Bell className="h-5 w-5" />
                    Notifications
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setIsOpen(false)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                {unreadCount > 0 && (
                  <div className="flex items-center justify-between">
                    <CardDescription>
                      {unreadCount} unread notification{unreadCount > 1 ? 's' : ''}
                    </CardDescription>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={markAllAsRead}
                      className="text-xs"
                    >
                      Mark all read
                    </Button>
                  </div>
                )}
              </CardHeader>

              <CardContent className="p-0">
                {loading ? (
                  <div className="p-4 text-center">
                    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
                    <p className="text-sm text-muted-foreground mt-2">Loading notifications...</p>
                  </div>
                ) : notifications.length === 0 ? (
                  <div className="p-6 text-center">
                    <Bell className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">No notifications yet</p>
                  </div>
                ) : (
                  <div className="max-h-96 overflow-y-auto">
                    {notifications.map((notification, index) => (
                      <div key={notification.id}>
                        <div
                          className={`p-4 hover:bg-accent cursor-pointer transition-colors ${
                            !notification.read ? 'bg-primary/5' : ''
                          }`}
                          onClick={() => !notification.isRead && markAsRead(notification.id)}
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              {getNotificationIcon(notification.type)}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <p className={`text-sm font-medium ${
                                  !notification.isRead ? 'text-foreground' : 'text-muted-foreground'
                                }`}>
                                  {notification.title}
                                </p>
                                {!notification.isRead && (
                                  <div className="w-2 h-2 bg-primary rounded-full"></div>
                                )}
                              </div>

                              <p className="text-xs text-muted-foreground mb-2">
                                {notification.message}
                              </p>

                              <div className="flex items-center justify-between">
                                <p className="text-xs text-muted-foreground">
                                  {new Date(notification.createdAt).toLocaleDateString()}
                                </p>
                                
                                {notification.metadata?.xpAmount && (
                                  <Badge variant="outline" className="text-xs">
                                    +{notification.metadata.xpAmount} XP
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {!notification.read && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  markAsRead(notification.id)
                                }}
                                className="p-1 h-auto"
                              >
                                <Check className="h-3 w-3" />
                              </Button>
                            )}
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
                    <div className="p-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={fetchNotifications}
                        className="w-full text-xs"
                      >
                        <Clock className="h-3 w-3 mr-2" />
                        Refresh
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

