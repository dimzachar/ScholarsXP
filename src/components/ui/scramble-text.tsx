'use client'

import { useEffect, useState, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'

interface ScrambleTextProps {
  text: string
  className?: string
  /** Duration of the scramble effect in ms (default: 800) */
  duration?: number
  /** Delay before starting in ms (default: 0) */
  delay?: number
  /** Characters to use for scrambling */
  chars?: string
  /** Trigger scramble on hover */
  scrambleOnHover?: boolean
}

export function ScrambleText({
  text,
  className,
  duration = 800,
  delay = 0,
  chars = CHARS,
  scrambleOnHover = false,
}: ScrambleTextProps) {
  const [displayText, setDisplayText] = useState(text)
  const [isScrambling, setIsScrambling] = useState(false)
  const prefersReducedMotion = useReducedMotion()

  const scramble = useCallback(() => {
    if (prefersReducedMotion || isScrambling) return
    
    setIsScrambling(true)
    const originalText = text
    const iterations = Math.ceil(duration / 50) // ~20fps
    let currentIteration = 0

    const interval = setInterval(() => {
      currentIteration++
      const progress = currentIteration / iterations
      
      // Progressively reveal characters from left to right
      const revealedLength = Math.floor(progress * originalText.length)
      
      const newText = originalText
        .split('')
        .map((char, index) => {
          if (char === ' ') return ' '
          if (index < revealedLength) return originalText[index]
          return chars[Math.floor(Math.random() * chars.length)]
        })
        .join('')

      setDisplayText(newText)

      if (currentIteration >= iterations) {
        clearInterval(interval)
        setDisplayText(originalText)
        setIsScrambling(false)
      }
    }, 50)

    return () => clearInterval(interval)
  }, [text, duration, chars, prefersReducedMotion, isScrambling])

  // Scramble on mount
  useEffect(() => {
    const timer = setTimeout(scramble, delay)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Update display when text prop changes
  useEffect(() => {
    setDisplayText(text)
  }, [text])

  const handleHover = () => {
    if (scrambleOnHover) {
      scramble()
    }
  }

  return (
    <motion.span
      className={className}
      onMouseEnter={handleHover}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {displayText}
    </motion.span>
  )
}
