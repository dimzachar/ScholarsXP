'use client'

import Image from 'next/image'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import {
  ArrowRight,
  BookOpen,
  Compass,
  Palette,
  Shield,
  Sparkles,
  Telescope,
  Zap,
} from 'lucide-react'

const noiseTexture =
  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iOCIgaGVpZ2h0PSI4IiB2aWV3Qm94PSIwIDAgOCA4IiBmaWxsPSJub25lIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiMwMDAiLz48Y2lyY2xlIGN4PSIxIiBjeT0iMyIgcj0iMC4zIiBmaWxsPSIjZmZmIiBvcGFjaXR5PSIwLjA1Ii8+PGNpcmNsZSBjeD0iNCIgY3k9IjEiIHI9IjAuNCIgZmlsbD0iI2ZmZDgzMiIgb3BhY2l0eT0iMC4wMyIvPjxjaXJjbGUgY3g9IjciIGN5PSI2IiByPSIwLjQiIGZpbGw9IiNmZmYiIG9wYWNpdHk9IjAuMDYiLz48L3N2Zz4='

const guilds = [
  {
    name: 'Spartans',
    description: 'Stress Testing & Security Reviews',
    accent: String.fromCodePoint(0x2694, 0xfe0f),
    icon: Shield,
  },
  {
    name: 'Pathfinders',
    description: 'Community Building & Onboarding',
    accent: String.fromCodePoint(0x1f9ed),
    icon: Compass,
  },
  {
    name: 'Explorers',
    description: 'Ecosystem Discovery & Growth',
    accent: String.fromCodePoint(0x1f50d),
    icon: Telescope,
  },
  {
    name: 'Scholars',
    description: 'Technical Documentation & Research',
    accent: String.fromCodePoint(0x1f4da),
    icon: BookOpen,
  },
  {
    name: 'Creators',
    description: 'Content & Creative Contributions',
    accent: String.fromCodePoint(0x1f3a8),
    icon: Palette,
  },
]

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-stone-50 text-stone-900 dark:bg-neutral-900 dark:text-neutral-100">
      <div className="hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-[#050505] to-[#0D0D0D]" />
        <div
          className="absolute inset-0 opacity-40 mix-blend-soft-light"
          style={{ backgroundImage: `url(${noiseTexture})` }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,216,50,0.18),_transparent_65%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(0,0,0,0),_rgba(13,13,13,0.9)_65%)]" />

        <div className="absolute -left-24 top-24 hidden xl:block">
          <div className="relative h-72 w-48 -rotate-6 overflow-hidden rounded-[36px] bg-gradient-to-b from-white via-[#F7F7F7] to-[#C4C4C4] shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
            <div className="absolute inset-0 rounded-[36px] border-[3px] border-[#FFD832]/70" />
            <div className="absolute inset-x-8 top-10 h-3 rounded-full bg-[#FFD832]/70 blur-[6px]" />
            <div className="absolute inset-x-12 bottom-10 h-2 rounded-full bg-gradient-to-r from-[#FFD832]/60 via-white/80 to-[#FFD832]/60 blur-[4px]" />
          </div>
        </div>

        <div className="absolute -right-28 top-10 hidden lg:block">
          <div className="relative h-80 w-52 rotate-6 overflow-hidden rounded-[40px] bg-gradient-to-b from-white via-[#F2F2F2] to-[#D1D1D1] shadow-[0_40px_80px_rgba(0,0,0,0.5)]">
            <div className="absolute inset-0 rounded-[40px] border-[3px] border-[#FFD832]/60" />
            <div className="absolute inset-x-10 top-12 h-3 rounded-full bg-[#FFD832]/60 blur-[5px]" />
            <div className="absolute inset-x-14 bottom-12 h-2 rounded-full bg-white/70 blur-[6px]" />
          </div>
        </div>

        <div className="absolute left-1/4 top-16 hidden md:block">
          <div className="h-32 w-32 rounded-full bg-[#FFD832]/40 blur-3xl" />
        </div>
        <div className="absolute right-1/4 bottom-24 hidden md:block">
          <div className="h-28 w-28 rounded-full bg-[#FFD832]/30 blur-3xl" />
        </div>

        <div className="absolute left-8 top-1/3 hidden lg:block">
          <div className="h-px w-72 bg-gradient-to-r from-transparent via-white/35 to-transparent" />
          <div className="absolute left-1/3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white" />
          <div className="absolute left-2/3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#FFD832] shadow-[0_0_10px_rgba(255,216,50,0.8)]" />
        </div>

        <div className="absolute right-20 top-1/2 hidden lg:block">
          <div className="h-px w-60 bg-gradient-to-l from-transparent via-white/30 to-transparent" />
          <div className="absolute right-16 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-white" />
          <div className="absolute right-28 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-[#FFD832] shadow-[0_0_10px_rgba(255,216,50,0.8)]" />
        </div>

        <div className="absolute left-[18%] bottom-[22%] hidden lg:flex items-center gap-2">
          <div className="h-10 w-10 rounded-full border border-white/30 bg-black/60 shadow-[0_0_25px_rgba(255,216,50,0.35)] flex items-center justify-center">
            <Shield className="h-5 w-5 text-[#FFD832]" />
          </div>
          <span className="text-xs uppercase tracking-[0.4em] text-white/60">Guild XP</span>
        </div>

        <div className="absolute right-[18%] top-[22%] hidden lg:flex items-center gap-2">
          <div className="h-10 w-10 rounded-full border border-[#408783]/50 bg-black/60 shadow-[0_0_20px_rgba(64,135,131,0.45)] flex items-center justify-center">
            <div className="h-3 w-3 rounded-full bg-[#408783]" />
          </div>
          <span className="text-xs uppercase tracking-[0.4em] text-white/60">Movement</span>
        </div>
      </div>

      <div className="relative z-10">
        <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-8 md:px-12">
          <Link href="/" className="flex items-center space-x-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-300 bg-white text-stone-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-stone-500 dark:text-neutral-400">Movement</p>
              <span className="text-xl font-medium">Guild XP</span>
            </div>
          </Link>
          <div className="flex items-center space-x-3">
            <ThemeToggle />
            <Link href="/login">
              <Button
                size="sm"
                className="rounded-full border border-stone-300 bg-white px-5 text-sm font-medium text-stone-900 hover:bg-stone-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                Sign In
              </Button>
            </Link>
          </div>
        </header>

        <main className="mx-auto flex min-h-[70vh] w-full max-w-5xl flex-col items-center justify-center px-6 pb-24 pt-24 md:px-12">
          <div className="mb-6 flex items-center gap-3 rounded-full border border-stone-300 bg-white px-4 py-2 text-xs uppercase tracking-[0.35em] text-stone-600 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-200 text-amber-800">
              <Sparkles className="h-3 w-3" />
            </span>
            Movement Blockchain • Scholar Reputation
          </div>

          <h1 className="text-center text-4xl font-medium leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Elevate your scholarly work with intention
          </h1>

          <p className="mt-6 max-w-2xl text-center text-lg text-stone-600 dark:text-neutral-300 sm:text-xl">
            Join a guild, contribute thoughtfully, and earn recognition for work that advances the Movement ecosystem.
          </p>

          <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row">
            <Link href="/login?intent=guild">
              <Button
                size="lg"
                className="min-w-[12rem] rounded-full bg-amber-600 px-8 py-6 text-base font-medium text-white transition-colors hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600"
              >
                Join a Guild
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/login?intent=submit">
              <Button
                size="lg"
                variant="outline"
                className="min-w-[12rem] rounded-full border border-stone-300 bg-white px-8 py-6 text-base font-medium text-stone-900 transition-colors hover:bg-stone-100 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:bg-neutral-800"
              >
                Submit Your Work
              </Button>
            </Link>
          </div>

          <div className="mt-14 grid w-full gap-6 rounded-3xl border border-stone-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 sm:grid-cols-3">
            <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-500 dark:text-neutral-400">Guilds Live</p>
              <p className="mt-3 text-2xl font-medium text-amber-700 dark:text-amber-400">5 Core Paths</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-500 dark:text-neutral-400">XP Earned</p>
              <p className="mt-3 text-2xl font-medium text-stone-900 dark:text-neutral-100">1.2M+</p>
            </div>
            <div className="rounded-2xl border border-stone-200 bg-white p-4 text-center dark:border-neutral-800 dark:bg-neutral-900">
              <p className="text-sm uppercase tracking-[0.25em] text-stone-500 dark:text-neutral-400">Recognition</p>
              <p className="mt-3 text-2xl font-medium text-amber-700 dark:text-amber-400">Top Scholars</p>
            </div>
          </div>
        </main>
      </div>

      <section className="relative z-10 border-y border-neutral-200 bg-transparent py-20 dark:border-neutral-800">
        
        <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-12 px-6 md:px-12 lg:flex-row lg:items-center">
          <div className="max-w-xl space-y-6">
            <p className="text-xs uppercase tracking-[0.35em] text-stone-500 dark:text-neutral-400">Movement Atlas</p>
            <h2 className="text-3xl font-semibold text-stone-900 dark:text-neutral-100 sm:text-4xl">
              Navigate the ecosystems powering Guild XP achievements
            </h2>
            <p className="text-base text-stone-600 dark:text-neutral-300">
              Explore the Movement landscape where guilds scout talent, stress test protocols, and guide creators.
              Use the atlas to uncover expansion zones and align your contributions with the missions that matter most.
            </p>
            <div className="flex flex-col gap-3 text-sm text-stone-600 dark:text-neutral-300 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-900">
                <span className="h-2 w-2 rounded-full bg-amber-500" />
                Live Guild Territories
              </div>
              <div className="flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-900">
                <span className="h-2 w-2 rounded-full bg-teal-500" />
                Movement Growth Corridors
              </div>
            </div>
          </div>

          <div className="relative flex w-full max-w-3xl flex-1 flex-col">
            
            <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
              <div className="relative aspect-[4/3] w-full">
                <Image
                  src="/MOVEMENTMAP3.png"
                  alt="Illustrated map showing the Movement blockchain lands and guild territories."
                  fill
                  priority
                  className="object-contain"
                />
              </div>
            </div>
            <p className="mt-4 text-center text-xs uppercase tracking-[0.35em] text-stone-500 dark:text-neutral-400">
              Updated for Movement Season • Tap zones to plan submissions (coming soon)
            </p>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-neutral-200 bg-transparent py-20 dark:border-neutral-800">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col px-6 md:px-12">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs uppercase tracking-[0.35em] text-stone-500 dark:text-neutral-400">Guild Network</p>
            <h2 className="mt-4 text-3xl font-semibold text-stone-900 dark:text-neutral-100 sm:text-4xl">
              Choose your guild, master your craft, boost your Guild XP
            </h2>
          </div>

          <div className="relative mt-14">
            
            <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {guilds.map(({ name, description, accent, icon: Icon }) => (
                <div
                  key={name}
                  className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-6 transition-transform hover:-translate-y-1 dark:border-neutral-800 dark:bg-neutral-900"
                >
                  <div className="relative flex h-full flex-col items-center text-center">
                    <span className="mb-3 text-2xl" aria-hidden>{accent}</span>
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-stone-300 bg-white dark:border-neutral-700 dark:bg-neutral-900">
                      <Icon className="h-8 w-8 text-stone-900 dark:text-neutral-100" />
                    </div>
                    <h3 className="text-xl font-semibold text-stone-900 dark:text-neutral-100">{name}</h3>
                    <p className="mt-2 text-sm text-stone-600 dark:text-neutral-300">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t border-neutral-200 bg-transparent py-10 dark:border-neutral-800">
        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-6 text-center text-sm text-stone-500 dark:text-neutral-400 md:flex-row md:justify-between">
          <p>&copy; {new Date().getFullYear()} Guild XP - Built on Movement.</p>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-amber-500" />
            <span>Elevate scholarship. Earn recognition.</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
