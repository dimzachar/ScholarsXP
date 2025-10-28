'use client'

import React from 'react'
import Link from 'next/link'
import { Github, Twitter, MessageCircle, Zap } from 'lucide-react'

export default function LandingFooter() {
  return (
    <footer className="relative z-10 mt-auto">
      {/* Glassmorphism footer with backdrop blur */}
      <div className="border-t border-neutral-800/50 bg-neutral-900/80 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-6xl px-6 py-16 md:px-12">
          <div className="grid gap-12 md:grid-cols-3">
            {/* Brand & Description */}
            <div className="space-y-4">
              <Link href="/" className="inline-flex items-center space-x-3 group">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-800 text-neutral-200 transition-colors group-hover:border-neutral-600 group-hover:bg-neutral-700">
                  <Zap className="h-5 w-5" />
                </div>
                <div>
                  <span className="text-xl font-medium text-neutral-100 transition-colors group-hover:text-white">Guild XP</span>
                </div>
              </Link>
              <p className="max-w-sm text-sm leading-relaxed text-neutral-400">
                Track your contributions, build your reputation, and earn recognition within the Movement ecosystem. Create once, reuse forever.
              </p>
            </div>

            {/* Support Links */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.35em] text-neutral-400">Support</h3>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/terms"
                    className="text-sm text-neutral-300 transition-colors hover:text-white"
                  >
                    Terms of Use
                  </Link>
                </li>
                <li>
                  <Link
                    href="/privacy"
                    className="text-sm text-neutral-300 transition-colors hover:text-white"
                  >
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/contact"
                    className="text-sm text-neutral-300 transition-colors hover:text-white"
                  >
                    Contact
                  </Link>
                </li>
                <li>
                  <Link
                    href="/changelog"
                    className="text-sm text-neutral-300 transition-colors hover:text-white"
                  >
                    Changelog
                  </Link>
                </li>
              </ul>
            </div>

            {/* Social Links */}
            <div className="space-y-4">
              <h3 className="text-xs font-semibold uppercase tracking-[0.35em] text-neutral-400">Social</h3>
              <div className="flex space-x-4">
                <a
                  href="https://twitter.com/movementlabsxyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 transition-all hover:border-neutral-600 hover:bg-neutral-700 hover:text-white hover:scale-110"
                  aria-label="Twitter"
                >
                  <Twitter className="h-5 w-5" />
                </a>
                <a
                  href="https://github.com/movementlabsxyz"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 transition-all hover:border-neutral-600 hover:bg-neutral-700 hover:text-white hover:scale-110"
                  aria-label="GitHub"
                >
                  <Github className="h-5 w-5" />
                </a>
                <a
                  href="https://discord.gg/movementlabs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-800 text-neutral-400 transition-all hover:border-neutral-600 hover:bg-neutral-700 hover:text-white hover:scale-110"
                  aria-label="Discord"
                >
                  <MessageCircle className="h-5 w-5" />
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom bar with separator */}
        <div className="border-t border-neutral-800/50">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 text-sm text-neutral-500 md:flex-row md:px-12">
            <p>&copy; {new Date().getFullYear()} Guild XP. All rights reserved.</p>
            <p className="text-neutral-600">
              Made with <span className="text-amber-500">⚡</span> by Movement Community
            </p>
          </div>
        </div>
      </div>
    </footer>
  )
}
