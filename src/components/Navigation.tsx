'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import NotificationCenter from '@/components/NotificationCenter'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import ProfileDropdown from '@/components/ProfileDropdown'
import { MobileBottomNav, createNavItem } from '@/components/navigation/MobileBottomNav'
import { Home, Users, Trophy, Gem, Settings, Zap, Gavel, ClipboardCheck, Shield } from 'lucide-react'
import { usePrivyAuthSync } from '@/contexts/PrivyAuthSyncContext'
import { usePrivyAuth } from '@/hooks/usePrivyAuth'

export default function Navigation() {
  const pathname = usePathname()
  const { user, isAdmin, isReviewer } = usePrivyAuthSync()
  const { logout } = usePrivyAuth()

  const handleSignOut = async () => {
    try {
      await logout()
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  // Filter navigation items based on user role
  const getNavItems = () => {
    const baseItems: Array<{ href: string; label: string; icon: typeof Trophy }> = []

    // Add review for reviewers and admins
    if (isReviewer || isAdmin) {
      baseItems.push({ href: '/review', label: 'Review', icon: ClipboardCheck })
    }

    // Add leaderboard and featured for everyone
    baseItems.push(
      { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
      { href: '/featured', label: 'Featured', icon: Gem },
      { href: '/vote', label: 'Vote', icon: Gavel },
    )

    // Add admin for admins only
    if (isAdmin) {
      baseItems.push({ href: '/admin', label: 'Admin', icon: Shield })
    }

    return baseItems
  }

  const navItems = getNavItems()

  // Mobile navigation items (same order as desktop)
  const mobileNavItems = [
    createNavItem('/dashboard', 'Submit', Home),
    createNavItem('/featured', 'Featured', Gem),
    ...(isReviewer || isAdmin ? [createNavItem('/review', 'Review', Users)] : []),
    createNavItem('/leaderboard', 'Leaderboard', Trophy),
    createNavItem('/vote', 'Vote', Gavel),
    ...(isAdmin ? [createNavItem('/admin', 'Admin', Settings)] : []),
  ]

  return (
    <>
      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        items={mobileNavItems}
        userRole={isAdmin ? 'admin' : isReviewer ? 'reviewer' : 'user'}
        isAuthenticated={!!user}
      />
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm overflow-x-hidden">
      <div className="flex h-16 items-center max-w-7xl mx-auto px-3 sm:px-4 w-full">
        <div className="mr-4 hidden xl:flex">
          <Link href={user ? '/dashboard' : '/'} className="mr-6 flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="hidden font-bold sm:inline-block text-xl text-primary">
              ScholarXP
            </span>
          </Link>
          <nav className="flex items-center space-x-1 text-sm font-medium">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`transition-all duration-200 hover:bg-accent flex items-center px-3 py-2 rounded-lg ${
                    isActive
                      ? 'text-primary bg-primary/10 font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {isActive && (
                    <span className="ml-2 whitespace-nowrap">
                      {item.label}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Mobile navigation */}
        <div className="flex flex-1 items-center justify-between gap-2 xl:justify-end min-w-0">
          {/* Logo - icon only on small mobile, icon+text on larger mobile */}
          <div className="flex-shrink-0 xl:hidden">
            <Link href={user ? '/dashboard' : '/'} className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary flex-shrink-0">
                <Zap className="h-5 w-5 text-primary-foreground" />
              </div>
              {/* Hide title on very small screens (< 400px), show on sm+ */}
              <span className="font-bold text-xl text-primary hidden xs:inline-block sm:inline-block">
                ScholarXP
              </span>
            </Link>
          </div>

          {/* Right side actions - responsive spacing */}
          <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
            <NotificationCenter />
            <ThemeToggle />

            <Separator orientation="vertical" className="h-6 hidden sm:block" />
            
            {/* User info */}
            {user ? (
              <ProfileDropdown
                user={user}
                onSignOut={handleSignOut}
              />
            ) : (
              <Link href="/login">
                <Button variant="default" size="sm">
                  Sign In
                </Button>
              </Link>
            )}
          </div>
        </div>
      </div>


    </nav>
    </>
  )
}
