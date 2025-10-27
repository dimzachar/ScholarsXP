"use client"

import React, { useEffect, useRef } from "react"

/**
 * Alaba‑style hero: fullscreen background video with SVG knockout text,
 * split‑line reveal on load, and fade/parallax on scroll using GSAP ScrollTrigger.
 *
 * Requirements:
 * 1) Put two encodes in /public:
 *    - /public/hero.webm  (modern)
 *    - /public/hero.mp4   (fallback)
 *    - /public/hero-poster.jpg  (lightweight poster, <100KB)
 * 2) Tailwind (or similar) is assumed for utility classes. If not using Tailwind,
 *    replace classNames with your CSS.
 */

export default function AlabaStyleHero() {
  const heroRef = useRef<HTMLElement | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const overlayRef = useRef<HTMLDivElement | null>(null)
  const maskGroupRef = useRef<SVGGElement | null>(null)

  // Boot GSAP animations once on mount
  useEffect(() => {
    let mounted = true
    ;(async () => {
      const { gsap } = await import("gsap")
      const { ScrollTrigger } = await import("gsap/ScrollTrigger")
      gsap.registerPlugin(ScrollTrigger)
      if (!mounted || !heroRef.current) return

      const ctx = gsap.context(() => {
        // Split lines (each <text> element has class .hero-line)
        const lines = Array.from(
          (maskGroupRef.current?.querySelectorAll<SVGTextElement>(".hero-line") || [])
        )
        gsap.set(lines, { yPercent: 120 })

        // Intro reveal: lines slide up in a quick cascade
        gsap.to(lines, {
          yPercent: 0,
          ease: "power3.out",
          duration: 0.7,
          stagger: 0.06,
          delay: 0.1,
        })

        // Parallax + fade the whole SVG mask group on scroll
        gsap.to("#heroMaskContainer", {
          yPercent: -35,
          autoAlpha: 0,
          ease: "none",
          scrollTrigger: {
            trigger: heroRef.current,
            start: "top top",
            end: "+=100%",
            scrub: true,
          },
        })

        // Fade the dark overlay off as you scroll down so the video brightens
        if (overlayRef.current) {
          gsap.to(overlayRef.current, {
            opacity: 0,
            ease: "none",
            scrollTrigger: {
              trigger: heroRef.current,
              start: "top top",
              end: "+=100%",
              scrub: true,
            },
          })
        }
      }, heroRef)

      return () => {
        ctx.revert()
        ScrollTrigger.getAll().forEach((t) => t.kill())
      }
    })()

    return () => {
      mounted = false
    }
  }, [])

  // Make sure video autoplays (Safari/iOS) and respect Data Saver
  useEffect(() => {
    const v = videoRef.current
    if (!v) return

    // Respect Data Saver if available
    // @ts-ignore
    const saveData = typeof navigator !== "undefined" && (navigator as any).connection?.saveData
    if (saveData) {
      // Show poster only
      v.pause()
      // remove sources so it doesn't fetch
      while (v.firstChild) v.removeChild(v.firstChild as ChildNode)
      return
    }

    v.muted = true
    const tryPlay = () => v.play().catch(() => {
      /* ignore autoplay errors */
    })
    if (v.readyState >= 2) tryPlay()
    else v.addEventListener("canplay", tryPlay, { once: true })

    const onVis = () => (document.hidden ? v.pause() : tryPlay())
    document.addEventListener("visibilitychange", onVis)

    return () => {
      v.removeEventListener("canplay", tryPlay as any)
      document.removeEventListener("visibilitychange", onVis)
    }
  }, [])

  return (
    <main className="relative min-h-screen overflow-x-clip bg-black text-white">
      {/* Fixed background video */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <video
          ref={videoRef}
          className="h-full w-full object-cover motion-reduce:hidden"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/hero-poster.jpg"
        >
          <source src="/hero.webm" type="video/webm" />
          <source src="/hero.mp4" type="video/mp4" />
          Your browser does not support the video tag.
        </video>
        {/* Dark overlay that fades away on scroll */}
        <div ref={overlayRef} className="pointer-events-none absolute inset-0 bg-black/50" />
      </div>

      {/* NAV (stub) */}
      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 pt-8 md:px-12">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/20 bg-white/10">GX</div>
          <div className="leading-tight">
            <p className="text-[11px] uppercase tracking-[0.35em] text-white/60">Movement</p>
            <span className="text-lg font-medium">Guild XP</span>
          </div>
        </div>
        <nav className="hidden items-center gap-6 md:flex text-sm text-white/80">
          <a href="#journey" className="hover:text-white">Journey</a>
          <a href="#gallery" className="hover:text-white">Gallery</a>
          <a href="#press" className="hover:text-white">Press</a>
        </nav>
      </header>

      {/* HERO: SVG knockout text plate that reveals the video */}
      <section ref={heroRef} id="hero" className="relative z-10 grid min-h-[120vh] place-items-center px-6 md:px-12">
        <div id="heroMaskContainer" className="w-full max-w-7xl">
          <svg
            className="block h-[80vh] w-full"
            viewBox="0 0 1000 600"
            preserveAspectRatio="xMidYMid slice"
          >
            <defs>
              <mask id="heroTextMask" maskUnits="userSpaceOnUse" maskContentUnits="userSpaceOnUse" style={{ maskType: 'luminance' as any }}>
                {/* White plate; black text will cut holes */}
                <rect x="0" y="0" width="1000" height="600" fill="white" />
                <g ref={maskGroupRef} fill="black" fontFamily="inherit" fontWeight={800} textAnchor="middle">
                  <text className="hero-line" x="500" y="220" fontSize="140">THE CRAFT</text>
                  <text className="hero-line" x="500" y="350" fontSize="140">OF SCHOLAR</text>
                  <text className="hero-line" x="500" y="480" fontSize="140">REPUTATION</text>
                </g>
              </mask>
            </defs>
            {/* Solid plate masked by the text — the video shows through the letters */}
            <rect x="0" y="0" width="1000" height="600" fill="#ffffff" mask="url(#heroTextMask)" />
          </svg>

          {/* Assistive heading for screen readers */}
          <h1 className="sr-only">The craft of scholar reputation</h1>
        </div>
      </section>

      {/* MARQUEE (kinetic type strip) */}
      <Marquee text="Through the Movement — Guild XP — Scholarship — Recognition — " />

      {/* CONTENT STUB BELOW TO MAKE SCROLL EFFECT VISIBLE */}
      <section className="relative z-10 mx-auto w-full max-w-5xl px-6 py-24 md:px-12">
        <h2 className="mb-4 text-4xl font-semibold">On‑chain contributions</h2>
        <p className="max-w-2xl text-white/80">Stress tests, audits, deployments, protocol experiments — contributions that move the Movement.</p>
        <div className="h-[120vh]" />
      </section>
    </main>
  )
}

// Simple marquee component (no external libs)
function Marquee({ text }: { text: string }) {
  const trackRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    ;(async () => {
      const { gsap } = await import("gsap")
      if (!trackRef.current) return
      const ctx = gsap.context(() => {
        gsap.to(trackRef.current, { xPercent: -50, duration: 20, ease: "linear", repeat: -1 })
      }, trackRef)
      return () => ctx.revert()
    })()
  }, [])

  return (
    <section className="relative z-10 border-y border-white/15 py-8">
      <div className="overflow-hidden">
        <div
          ref={trackRef}
          className="whitespace-nowrap text-center text-4xl font-semibold uppercase tracking-[0.35em] text-white/80 md:text-5xl"
        >
          <span className="mr-12">{text}</span>
          <span className="mr-12">{text}</span>
        </div>
      </div>
    </section>
  )
}

