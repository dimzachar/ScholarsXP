'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import NotificationCenter from '@/components/NotificationCenter'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Home, Users, Trophy, Settings, Zap, LogOut } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export default function Navigation() {
  const pathname = usePathname()
  const { user, userProfile, signOut, loading, isAdmin, isReviewer } = useAuth()

  const handleSignOut = async () => {
    try {
      await signOut()
    } catch (error) {
      console.error('Sign out failed:', error)
    }
  }

  // Filter navigation items based on user role
  const getNavItems = () => {
    const baseItems = [
      { href: '/dashboard', label: 'Submit', icon: Home },
      { href: '/leaderboard', label: 'Leaderboard', icon: Trophy },
    ]

    // Add review for reviewers and admins
    if (isReviewer) {
      baseItems.splice(1, 0, { href: '/review', label: 'Review', icon: Users })
    }

    // Add admin for admins only
    if (isAdmin) {
      baseItems.push({ href: '/admin', label: 'Admin', icon: Settings })
    }

    return baseItems
  }

  const navItems = getNavItems()

  return (
    <nav className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-sm">
      <div className="container flex h-16 items-center max-w-7xl mx-auto px-4">
        <div className="mr-4 hidden md:flex">
          <Link href="/" className="mr-6 flex items-center space-x-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Zap className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="hidden font-bold sm:inline-block text-xl text-primary">
              ScholarXP
            </span>
          </Link>
          <nav className="flex items-center space-x-2 text-sm font-medium">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`transition-all duration-200 hover:bg-accent flex items-center space-x-2 px-4 py-2 rounded-lg ${
                    isActive
                      ? 'text-primary bg-primary/10 font-semibold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </nav>
        </div>

        {/* Mobile navigation */}
        <div className="flex flex-1 items-center justify-between space-x-2 md:justify-end">
          <div className="w-full flex-1 md:w-auto md:flex-none">
            <div className="md:hidden">
              <Link href="/" className="flex items-center space-x-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
                  <Zap className="h-5 w-5 text-primary-foreground" />
                </div>
                <span className="font-bold text-xl text-primary">
                  ScholarXP
                </span>
              </Link>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <NotificationCenter />
            <ThemeToggle />

            <Separator orientation="vertical" className="h-6" />
            
            {/* User info */}
            {user ? (
              <div className="flex items-center space-x-3">
                <div className="hidden text-right sm:block">
                  <p className="text-sm font-medium leading-none">
                    {user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'}
                  </p>
                  <div className="flex items-center space-x-1 mt-1">
                    {userProfile ? (
                      <>
                        <Badge variant="secondary" className="text-xs">
                          {userProfile.totalXp} XP
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {userProfile.role}
                        </Badge>
                      </>
                    ) : (
                      <>
                        <Badge variant="secondary" className="text-xs">
                          Loading XP...
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          Loading...
                        </Badge>
                      </>
                    )}
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Avatar className="h-9 w-9 cursor-pointer">
                      <AvatarImage src={user.user_metadata?.avatar_url} alt="User" />
                      <AvatarFallback className="bg-primary text-primary-foreground">
                        {(user.user_metadata?.full_name || user.email || 'U')[0].toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleSignOut}>
                      <LogOut className="mr-2 h-4 w-4" />
                      Sign out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
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

      {/* Mobile navigation menu */}
      <div className="border-t md:hidden bg-background shadow-lg">
        <div className="container max-w-7xl mx-auto px-4">
          <div className="flex items-center space-x-2 py-3">
            {navItems.map((item) => {
              const Icon = item.icon
              const isActive = pathname === item.href

              return (
                <Link key={item.href} href={item.href} className="flex-1">
                  <Button
                    variant={isActive ? 'default' : 'ghost'}
                    size="sm"
                    className={`w-full flex flex-col items-center gap-2 h-auto py-3 rounded-xl transition-all duration-200 ${
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-lg'
                        : 'hover:bg-accent'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </Button>
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </nav>
  )
}

