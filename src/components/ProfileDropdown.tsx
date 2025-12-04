'use client'

import * as React from 'react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { User, LogOut } from 'lucide-react'
import { UserProfile } from '@/contexts/AuthContext'
import { User as SupabaseUser } from '@supabase/supabase-js'
import { getGamifiedRank, type RankTier } from '@/lib/gamified-ranks'
import { ScrambleText } from '@/components/ui/scramble-text'

// Theme-aware colors for rank tiers (light theme needs darker colors for visibility)
const tierStyles: Record<RankTier | 'base', string> = {
  base: 'bg-slate-500/10 text-slate-600 dark:text-slate-400',
  Bronze: 'bg-amber-500/10 text-amber-700 dark:text-amber-500',
  Silver: 'bg-slate-400/15 text-slate-600 dark:text-slate-300',
  Gold: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  Platinum: 'bg-slate-400/15 text-slate-600 dark:text-slate-300',
  Diamond: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-400',
}

interface ProfileDropdownProps extends React.HTMLAttributes<HTMLDivElement> {
  user: SupabaseUser
  userProfile: UserProfile | null
  onSignOut: () => void
}

export default function ProfileDropdown({
  user,
  userProfile,
  onSignOut,
  className,
  ...props
}: ProfileDropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false)

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'User'
  const avatarUrl = user.user_metadata?.avatar_url
  const initial = displayName[0].toUpperCase()

  const totalXp = userProfile?.totalXp ?? 0
  const gamifiedRank = getGamifiedRank(totalXp)
  const RankIcon = gamifiedRank?.icon


  return (
    <div className={cn('relative', className)} {...props}>
      <DropdownMenu onOpenChange={setIsOpen} modal={false}>
        <div className="group relative">
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-4 py-2 pl-3 pr-2 rounded-2xl focus:outline-none"
              aria-label={`User menu for ${displayName}`}
            >
              {/* Name (top), XP + Rank badges (bottom) */}
              <div className="text-right hidden sm:block min-h-[44px]">
                <div className="text-sm font-semibold text-foreground tracking-tight truncate max-w-[150px]">
                  <ScrambleText 
                    text={displayName} 
                    duration={1200}
                    delay={200}
                    scrambleOnHover
                  />
                </div>
                <div className="flex items-center justify-end gap-1.5 mt-1 flex-wrap min-h-[22px]">
                  <span className="text-xs font-semibold px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-500">
                    {totalXp.toLocaleString()} XP
                  </span>
                  {gamifiedRank && RankIcon && (
                    <span className={cn(
                      'text-xs font-medium px-1.5 py-0.5 rounded flex items-center gap-1',
                      tierStyles[gamifiedRank.tier || 'base']
                    )}>
                      <RankIcon className="w-3 h-3" />
                      <span className="hidden md:inline">{gamifiedRank.displayName}</span>
                      <span className="md:hidden">{gamifiedRank.tier || gamifiedRank.category}</span>
                    </span>
                  )}
                </div>
              </div>

              {/* Avatar with gradient border */}
              <div className="relative">
                <div className={cn(
                  "w-11 h-11 rounded-full p-0.5",
                  gamifiedRank ? `bg-gradient-to-br ${gamifiedRank.gradient}` : "bg-gradient-to-br from-purple-500 via-pink-500 to-orange-400"
                )}>
                  <Avatar className="w-full h-full">
                    <AvatarImage src={avatarUrl} alt={displayName} className="object-cover" />
                    <AvatarFallback className="bg-background text-foreground font-semibold">
                      {initial}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </button>
          </DropdownMenuTrigger>

          {/* Curved line indicator */}
          <div
            className={cn(
              'absolute -right-3 top-1/2 -translate-y-1/2 transition-all duration-200',
              isOpen ? 'opacity-100' : 'opacity-60 group-hover:opacity-100'
            )}
          >
            <svg
              width="12"
              height="24"
              viewBox="0 0 12 24"
              fill="none"
              className={cn(
                'transition-all duration-200',
                isOpen
                  ? 'text-primary scale-110'
                  : 'text-muted-foreground group-hover:text-foreground'
              )}
              aria-hidden="true"
            >
              <path
                d="M2 4C6 8 6 16 2 20"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>

          <DropdownMenuContent
            align="end"
            sideOffset={8}
            className="w-56 p-1.5 bg-popover border border-border rounded-xl shadow-xl"
          >
            {/* Profile */}
            <DropdownMenuItem asChild>
              <Link
                href="/profile"
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent rounded-lg transition-all duration-200 cursor-pointer"
              >
                <User className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">
                  Profile
                </span>
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator className="my-1.5" />

            {/* Sign Out */}
            <DropdownMenuItem asChild>
              <button
                type="button"
                onClick={onSignOut}
                className="w-full flex items-center gap-3 px-3 py-2.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg cursor-pointer transition-all duration-200"
              >
                <LogOut className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-500">
                  Sign out
                </span>
              </button>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </div>
      </DropdownMenu>
    </div>
  )
}
