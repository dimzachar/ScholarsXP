"use client"

import React, { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight, BookOpen, Compass, Palette, Shield, Telescope, Zap } from "lucide-react"

const guilds = [
  { name: "Spartans", description: "Stress Testing & Security Reviews", accent: String.fromCodePoint(0x2694, 0xfe0f), icon: Shield },
  { name: "Pathfinders", description: "Community Building & Onboarding", accent: String.fromCodePoint(0x1f9ed), icon: Compass },
  { name: "Explorers", description: "Ecosystem Discovery & Growth", accent: String.fromCodePoint(0x1f50d), icon: Telescope },
  { name: "Scholars", description: "Technical Documentation & Research", accent: String.fromCodePoint(0x1f4da), icon: BookOpen },
  { name: "Creators", description: "Content & Creative Contributions", accent: String.fromCodePoint(0x1f3a8), icon: Palette },
]

export default function LandingPage() {
  // Preloader
  const [showPreloader, setShowPreloader] = useState(true)
  const preloaderRef = useRef<HTMLDivElement | null>(null)
  const progressRef = useRef<HTMLDivElement | null>(null)
  const imageRefs = useRef<HTMLDivElement[]>([])

  // Hero refs
  const heroTitleRef = useRef<HTMLHeadingElement | null>(null)
  const heroSectionRef = useRef<HTMLElement | null>(null)
  const heroOverlayRef = useRef<SVGSVGElement | null>(null)
  const heroMaskGroupRef = useRef<SVGGElement | null>(null)
  const heroPlateRef = useRef<SVGRectElement | null>(null)
  const heroStatsRef = useRef<HTMLDivElement | null>(null)
  const marqueeRef = useRef<HTMLDivElement | null>(null)
  const journeyRef = useRef<HTMLDivElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const videoOverlayRef = useRef<HTMLDivElement | null>(null)
  const [soundOn, setSoundOn] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const preloadImages = [
    "https://images.unsplash.com/photo-1517816428104-797678c7cf0d?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?q=80&w=1200&auto=format&fit=crop",
    "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?q=80&w=1200&auto=format&fit=crop",
  ]

  // Preloader timeline + hero intro
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { gsap } = await import("gsap")
      if (!preloaderRef.current || !progressRef.current) return
      const ctx = gsap.context(() => {
        gsap.set(progressRef.current, { scaleX: 0, transformOrigin: "left center" })
        gsap.set(imageRefs.current, { height: 0 })
        gsap.set(imageRefs.current.map((w) => w.querySelector("img")), { scale: 1.2, willChange: "transform" })

        // prepare SVG mask text lines
        const lineSpans = Array.from(
          (heroMaskGroupRef.current?.querySelectorAll(".hero-line") as unknown as NodeListOf<HTMLElement>) || []
        )
        gsap.set(lineSpans, { yPercent: 120 })
        gsap.set(preloaderRef.current, { clipPath: "inset(0% 0% 0% 0%)" })

        const tl = gsap.timeline({ defaults: { ease: "power3.out" } })
        tl.to(progressRef.current, { duration: 1.2, scaleX: 1, ease: "power2.out" })
        imageRefs.current.forEach((wrap, i) => {
          const img = wrap.querySelector("img")
          tl.to(wrap, { duration: 0.6, height: "100%", ease: "power3.out" }, i === 0 ? ">-0.1" : ">-0.25")
          tl.to(img, { duration: 0.9, scale: 1, ease: "power2.out" }, "<")
        })
        tl.to({}, { duration: 0.25 })
        tl.addLabel("revealStart")
        tl.to(
          preloaderRef.current,
          {
            duration: 0.9,
            clipPath: "inset(100% 0% 0% 0%)",
            ease: "power3.inOut",
            onComplete: () => {
              if (mounted) setShowPreloader(false)
            },
          },
          "revealStart"
        )
        tl.to(lineSpans, { duration: 0.7, yPercent: 0, stagger: 0.06, ease: "power3.out" }, "revealStart+=0.15")
      }, preloaderRef)
      return () => ctx.revert()
    })()
    return () => {
      mounted = false
    }
  }, [])

  // Scroll effects: hero out, layers parallax, video overlay dim
  useEffect(() => {
    ;(async () => {
      const { gsap } = await import("gsap")
      const { ScrollTrigger } = await import("gsap/ScrollTrigger")
      gsap.registerPlugin(ScrollTrigger)
      if (!heroSectionRef.current) return

      const titleEl = heroOverlayRef.current
      const plate = heroPlateRef.current
      const overlay = videoOverlayRef.current

      if (plate) {
        // Animate the white plate itself upward to reveal the video
        gsap.set(plate, { transformOrigin: "center top", transformBox: "fill-box", yPercent: 0 })
        gsap.to(plate, {
          yPercent: -100,
          ease: "none",
          scrollTrigger: {
            trigger: heroSectionRef.current,
            start: "top top",
            end: "bottom top",
            scrub: true,
          },
        })
      }

      // no extra layers

      if (overlay) {
        gsap.to(overlay, {
          opacity: 0,
          ease: "none",
          scrollTrigger: {
            trigger: heroSectionRef.current,
            start: "top top",
            end: "+=100%",
            scrub: true,
          },
        })
      }
    })()
  }, [])

  // In-view reveals
  useEffect(() => {
    let io: IntersectionObserver | null = null
    let cancelled = false
    ;(async () => {
      const { gsap } = await import("gsap")
      if (cancelled) return
      const els = Array.from(document.querySelectorAll<HTMLElement>("[data-animate]"))
      gsap.set(els, { autoAlpha: 0, y: 20 })
      io = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            gsap.to(entry.target, { duration: 0.6, y: 0, autoAlpha: 1, ease: "power3.out" })
            io?.unobserve(entry.target)
          }
        })
      }, { threshold: 0.2 })
      els.forEach((el) => io?.observe(el))
    })()
    return () => { cancelled = true; io?.disconnect() }
  }, [])

  // Marquee motion
  useEffect(() => {
    ;(async () => {
      const { gsap } = await import("gsap")
      if (!marqueeRef.current) return
      gsap.to(marqueeRef.current, { xPercent: -50, ease: "none", duration: 20, repeat: -1 })
    })()
  }, [])

  // Journey pinning (ScrollTrigger)
  useEffect(() => {
    ;(async () => {
      const { gsap } = await import("gsap")
      const { ScrollTrigger } = await import("gsap/ScrollTrigger")
      gsap.registerPlugin(ScrollTrigger)
      if (!journeyRef.current) return
      const steps = Array.from(journeyRef.current.querySelectorAll<HTMLElement>("[data-step]"))
      gsap.set(steps, { autoAlpha: 0, y: 40 })
      gsap.timeline({
        scrollTrigger: {
          trigger: journeyRef.current,
          start: "top top",
          end: "+=300%",
          scrub: true,
          pin: true,
        },
      })
        .to(steps[0], { autoAlpha: 1, y: 0, duration: 0.5 })
        .to(steps[1], { autoAlpha: 1, y: 0, duration: 0.5 }, "+=0.8")
        .to(steps[2], { autoAlpha: 1, y: 0, duration: 0.5 }, "+=0.8")
    })()
  }, [])

  // Ensure background video starts (autoplay policies) and stays muted
  useEffect(() => {
    const v = videoRef.current
    if (!v) return
    v.muted = true
    const tryPlay = () => v.play().catch(() => {})
    if (v.readyState >= 2) {
      tryPlay()
    } else {
      v.addEventListener('canplay', tryPlay, { once: true })
    }
    return () => {
      v.removeEventListener('canplay', tryPlay as any)
    }
  }, [])

  return (
    <div className="relative z-0 min-h-screen overflow-hidden bg-neutral-900 text-neutral-100">
      {/* Persistent video background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <video
          ref={videoRef}
          className="h-full w-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster=""
        >
          <source src="/video.webm" type="video/webm" />
          <source src="/video.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        <div ref={videoOverlayRef} className="pointer-events-none absolute inset-0 bg-black/0" />
      </div>
      {showPreloader && (
        <div ref={preloaderRef} className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-neutral-900 text-neutral-100">
          <div className="pointer-events-none absolute left-0 right-0 top-0 h-[2px] w-full bg-neutral-700/40">
            <div ref={progressRef} className="h-[2px] w-full bg-amber-400" />
          </div>
          <div className="relative w-[min(65vmin,520px)]">
            <div className="relative aspect-square">
              <div className="absolute inset-0">
                {preloadImages.map((src, i) => (
                  <div
                    key={i}
                    ref={(el) => el && (imageRefs.current[i] = el)}
                    className="absolute inset-x-0 bottom-0 overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"
                    style={{ height: 0 }}
                  >
                    <img src={src} alt="Preloader visual" className="h-full w-full object-cover opacity-90" loading="eager" />
                  </div>
                ))}
              </div>
            </div>
          </div>
          <p className="pointer-events-none absolute bottom-10 text-xs uppercase tracking-[0.35em] text-neutral-300">Preparing your Guild XP experience</p>
        </div>
      )}

      {/* Header */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-8 md:px-12">
        <Link href="/" className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 text-neutral-200">
            <Zap className="h-5 w-5" />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-neutral-400">Movement</p>
            <span className="text-xl font-medium text-neutral-100">Guild XP</span>
          </div>
        </Link>
        <nav className="flex items-center space-x-6">
          <Link href="#journey" className="text-sm text-neutral-300 hover:text-white">Journey</Link>
          <Link href="#guilds" className="text-sm text-neutral-300 hover:text-white">Guilds</Link>
          <Link href="#press" className="hidden text-sm text-neutral-300 hover:text-white md:inline">Press</Link>
          <Link href="/login">
            <Button size="sm" className="rounded-full border border-neutral-700 bg-neutral-800 px-5 text-sm font-medium text-white hover:bg-neutral-700">Sign In</Button>
          </Link>
        </nav>
      </header>

      {/* Typographic Hero with layered cards over video */}
      <section ref={heroSectionRef} id="hero" className="relative z-10 flex min-h-[120vh] items-center justify-center px-0 md:px-0">
        {/* Knockout text overlay using SVG mask (full hero height) */}
        <svg
          ref={heroOverlayRef}
          className="pointer-events-none absolute inset-0 z-0 block h-full w-full"
          viewBox="0 0 1000 600"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>
            <mask
              id="heroTextMask"
              maskUnits="userSpaceOnUse"
              maskContentUnits="userSpaceOnUse"
              // Use luminance so black text punches holes through the white plate
              style={{ maskType: 'luminance' as any }}
            >
              <rect x="0" y="0" width="1000" height="600" fill="white" />
              <g ref={heroMaskGroupRef} fill="black" fontFamily="inherit" fontWeight="700" textAnchor="middle">
                <text className="hero-line" x="500" y="220" fontSize="140">THE CRAFT</text>
                <text className="hero-line" x="500" y="350" fontSize="140">OF SCHOLAR</text>
                <text className="hero-line" x="500" y="480" fontSize="140">REPUTATION</text>
              </g>
            </mask>
          </defs>
          {/* White plate with text knocked out so the video shows through */}
          <rect ref={heroPlateRef} x="0" y="0" width="1000" height="600" fill="#ffffff" mask="url(#heroTextMask)" />
        </svg>
        <div className="relative w-full">
          {/* Decorative layers removed to keep focus on knockout text */}
          <h1 ref={heroTitleRef} className="sr-only">The craft of scholar reputation</h1>
        </div>
      </section>

      {/* Marquee */}
      <section className="relative z-10 border-y border-neutral-800 bg-transparent py-10">
        <div className="overflow-hidden">
          <div ref={marqueeRef} className="whitespace-nowrap text-center text-4xl font-medium uppercase tracking-[0.4em] text-neutral-200 opacity-80 md:text-5xl">
            <span className="mr-12">Through the Movement —</span>
            <span className="mr-12">Guild XP —</span>
            <span className="mr-12">Scholarship —</span>
            <span className="mr-12">Recognition —</span>
            <span className="mr-12">Through the Movement —</span>
            <span className="mr-12">Guild XP —</span>
            <span className="mr-12">Scholarship —</span>
            <span className="mr-12">Recognition —</span>
          </div>
        </div>
      </section>

      {/* Journey (pinned) */}
      <section id="journey" ref={journeyRef} className="relative z-10 bg-transparent py-24">
        <div className="mx-auto w-full max-w-6xl px-6 md:px-12">
          <div className="min-h-[60vh]">
            <div data-step className="space-y-4">
              <p className="text-xs uppercase tracking-[0.35em] text-neutral-400">Chapter 1</p>
              <h2 className="text-4xl font-semibold text-neutral-100 sm:text-5xl">On-chain contributions</h2>
              <p className="max-w-2xl text-neutral-300">Stress tests, audits, deployments, protocol experiments — contributions that move the Movement.</p>
            </div>
            <div data-step className="mt-16 space-y-4">
              <p className="text-xs uppercase tracking-[0.35em] text-neutral-400">Chapter 2</p>
              <h2 className="text-4xl font-semibold text-neutral-100 sm:text-5xl">Off-chain impact</h2>
              <p className="max-w-2xl text-neutral-300">Docs, workshops, community onboarding, content that elevates the ecosystem.</p>
            </div>
            <div data-step className="mt-16 space-y-4">
              <p className="text-xs uppercase tracking-[0.35em] text-neutral-400">Chapter 3</p>
              <h2 className="text-4xl font-semibold text-neutral-100 sm:text-5xl">Recognition</h2>
              <p className="max-w-2xl text-neutral-300">Your Guild XP becomes your reputation — visible, verifiable, and celebrated.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Guilds */}
      <section id="guilds" className="relative z-10 border-t border-neutral-800 bg-transparent py-20">
        <div className="relative mx-auto flex w-full max-w-6xl flex-col px-6 md:px-12">
          <div className="mx-auto max-w-3xl text-center">
            <p data-animate className="text-xs uppercase tracking-[0.35em] text-neutral-400">Guild Network</p>
            <h2 data-animate className="mt-4 text-3xl font-semibold text-neutral-100 sm:text-4xl">Choose your guild, master your craft, boost your Guild XP</h2>
          </div>
          <div className="relative mt-14">
            <div className="relative grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
              {guilds.map(({ name, description, accent, icon: Icon }) => (
                <div key={name} data-animate className="relative overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900 p-6 transition-transform hover:-translate-y-1">
                  <div className="relative flex h-full flex-col items-center text-center">
                    <span className="mb-3 text-2xl" aria-hidden>{accent}</span>
                    <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-neutral-700 bg-neutral-800">
                      <Icon className="h-8 w-8 text-neutral-100" />
                    </div>
                    <h3 className="text-xl font-semibold text-neutral-100">{name}</h3>
                    <p className="mt-2 text-sm text-neutral-300">{description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-neutral-800 bg-transparent py-10">
        <div className="relative mx-auto flex w-full max-w-5xl flex-col items-center gap-4 px-6 text-center text-sm text-neutral-400 md:flex-row md:justify-between">
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
