"use client"

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { useResponsiveLayout, TOUCH_TARGET_SIZE } from '@/hooks/useResponsiveLayout'
import { cn } from '@/lib/utils'
import { LucideIcon } from 'lucide-react'

interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  badge?: {
    count: number
    variant?: 'default' | 'secondary' | 'destructive' | 'outline'
  }
  requiresAuth?: boolean
  roles?: string[]
}

interface MobileBottomNavProps {
  items: NavItem[]
  className?: string
  userRole?: string
  isAuthenticated?: boolean
}

export function MobileBottomNav({
  items,
  className,
  userRole,
  isAuthenticated = false
}: MobileBottomNavProps) {
  const pathname = usePathname()
  const { isMobile, isTablet } = useResponsiveLayout()

  // Filter items based on authentication and role
  const visibleItems = items.filter(item => {
    if (item.requiresAuth && !isAuthenticated) return false
    if (item.roles && userRole && !item.roles.includes(userRole)) return false
    return true
  })

  // Show on mobile and tablet, hide on desktop (lg breakpoint and above)
  if (!isMobile && !isTablet) return null

  return (
    <nav className={cn(
      'fixed bottom-0 left-0 right-0 z-50',
      'bg-background/95 backdrop-blur-sm border-t border-border',
      'safe-area-inset-bottom', // Handle iPhone notch
      className
    )}>
      <div className="w-full px-2 sm:px-4 max-w-full overflow-x-hidden">
        <div className={cn(
          'flex items-center justify-around',
          `min-h-[${TOUCH_TARGET_SIZE.comfortable}px]`,
          'py-2',
          'gap-1'
        )}>
          {visibleItems.map((item) => {
            const isActive = pathname === item.href || 
                           (item.href !== '/' && pathname.startsWith(item.href))
            
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center justify-center gap-1 relative',
                  'transition-all duration-200 rounded-lg',
                  `min-h-[${TOUCH_TARGET_SIZE.minimum}px]`,
                  'px-2 sm:px-3 py-2 flex-1 max-w-[72px] sm:max-w-[80px]',
                  // Active state
                  isActive && [
                    'text-primary bg-primary/10',
                    'scale-105'
                  ],
                  // Inactive state
                  !isActive && [
                    'text-muted-foreground hover:text-foreground',
                    'hover:bg-muted/50 active:scale-95'
                  ],
                  // Focus states for accessibility
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                )}
              >
                <div className="relative">
                  <item.icon className={cn(
                    'transition-all duration-200',
                    isMobile ? 'h-5 w-5' : 'h-6 w-6',
                    isActive && 'scale-110'
                  )} />
                  
                  {/* Badge for notifications/counts */}
                  {item.badge && item.badge.count > 0 && (
                    <Badge
                      variant={item.badge.variant || 'destructive'}
                      className={cn(
                        'absolute -top-2 -right-2 h-5 w-5 p-0',
                        'flex items-center justify-center text-xs font-bold',
                        'min-w-[20px] rounded-full',
                        // Ensure visibility on all backgrounds
                        'border-2 border-background'
                      )}
                    >
                      {item.badge.count > 99 ? '99+' : item.badge.count}
                    </Badge>
                  )}
                </div>
                
                <span className={cn(
                  'text-[10px] sm:text-xs font-medium transition-all duration-200 truncate w-full text-center',
                  isActive && 'font-semibold'
                )}>
                  {item.label}
                </span>
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}

// Collapsible mobile navigation for more complex navigation structures
interface CollapsibleMobileNavProps {
  items: NavItem[]
  isOpen: boolean
  onToggle: () => void
  className?: string
  userRole?: string
  isAuthenticated?: boolean
}

export function CollapsibleMobileNav({
  items,
  isOpen,
  onToggle,
  className,
  userRole,
  isAuthenticated = false
}: CollapsibleMobileNavProps) {
  const pathname = usePathname()
  const { isMobile } = useResponsiveLayout()

  // Filter items based on authentication and role
  const visibleItems = items.filter(item => {
    if (item.requiresAuth && !isAuthenticated) return false
    if (item.roles && userRole && !item.roles.includes(userRole)) return false
    return true
  })

  if (!isMobile) return null

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40"
          onClick={onToggle}
        />
      )}
      
      {/* Sliding Navigation */}
      <nav className={cn(
        'fixed top-0 left-0 h-full w-80 max-w-[85vw] z-50',
        'bg-background border-r border-border shadow-xl',
        'transform transition-transform duration-300 ease-in-out',
        isOpen ? 'translate-x-0' : '-translate-x-full',
        className
      )}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <h2 className="text-lg font-semibold">Navigation</h2>
            <button
              onClick={onToggle}
              aria-label="Close navigation menu"
              className={cn(
                'p-2 rounded-lg hover:bg-muted transition-colors',
                `min-h-[${TOUCH_TARGET_SIZE.minimum}px] min-w-[${TOUCH_TARGET_SIZE.minimum}px]`
              )}
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Navigation Items */}
          <div className="flex-1 overflow-y-auto py-4">
            <div className="space-y-2 px-4">
              {visibleItems.map((item) => {
                const isActive = pathname === item.href || 
                               (item.href !== '/' && pathname.startsWith(item.href))
                
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onToggle} // Close nav on item click
                    className={cn(
                      'flex items-center gap-3 px-3 py-3 rounded-lg transition-all duration-200',
                      `min-h-[${TOUCH_TARGET_SIZE.minimum}px]`,
                      // Active state
                      isActive && [
                        'bg-primary text-primary-foreground',
                        'shadow-sm'
                      ],
                      // Inactive state
                      !isActive && [
                        'text-foreground hover:bg-muted',
                        'active:scale-[0.98]'
                      ],
                      // Focus states
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2'
                    )}
                  >
                    <div className="relative">
                      <item.icon className="h-5 w-5" />
                      
                      {/* Badge for notifications/counts */}
                      {item.badge && item.badge.count > 0 && (
                        <Badge
                          variant={isActive ? 'secondary' : (item.badge.variant || 'destructive')}
                          className={cn(
                            'absolute -top-2 -right-2 h-4 w-4 p-0',
                            'flex items-center justify-center text-xs font-bold',
                            'min-w-[16px] rounded-full'
                          )}
                        >
                          {item.badge.count > 99 ? '99+' : item.badge.count}
                        </Badge>
                      )}
                    </div>
                    
                    <span className="font-medium">{item.label}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      </nav>
    </>
  )
}

// Utility function to create nav items
export function createNavItem(
  href: string,
  label: string,
  icon: LucideIcon,
  options: Partial<Omit<NavItem, 'href' | 'label' | 'icon'>> = {}
): NavItem {
  return {
    href,
    label,
    icon,
    ...options
  }
}
