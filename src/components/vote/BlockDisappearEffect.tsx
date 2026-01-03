'use client'

import { useRef, useEffect, useState, useCallback } from 'react'
import gsap from 'gsap'

interface BlockDisappearEffectProps {
  children: React.ReactNode
  trigger: boolean
  onComplete: () => void
  duration?: number
}

/**
 * BlockDisappearEffect - Content disappears through scattered block masks
 * 
 * Cross/plus shaped pattern - more blocks along center axes,
 * scattered smaller blocks in corners. Blocks shrink in place.
 */
export function BlockDisappearEffect({
  children,
  trigger,
  onComplete,
  duration = 2.0,
}: BlockDisappearEffectProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [isAnimating, setIsAnimating] = useState(false)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const blocksRef = useRef<HTMLDivElement[]>([])

  const runAnimation = useCallback(() => {
    if (!containerRef.current || !contentRef.current || isAnimating) return

    setIsAnimating(true)
    const content = contentRef.current
    const rect = content.getBoundingClientRect()
    const centerX = rect.width / 2
    const centerY = rect.height / 2

    // Clear any existing blocks
    blocksRef.current.forEach((b) => b.remove())
    blocksRef.current = []

    const blocks: { el: HTMLDivElement; priority: number }[] = []

    const gridSize = 38
    const rows = Math.ceil(rect.height / gridSize)
    const cols = Math.ceil(rect.width / gridSize)

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const baseX = col * gridSize
        const baseY = row * gridSize
        const cellCenterX = baseX + gridSize / 2
        const cellCenterY = baseY + gridSize / 2

        // Distance from horizontal and vertical center axes
        const distFromVerticalAxis = Math.abs(cellCenterX - centerX) / centerX
        const distFromHorizontalAxis = Math.abs(cellCenterY - centerY) / centerY
        
        // Cross pattern: closer to either axis = more likely to have block
        const distFromCross = Math.min(distFromVerticalAxis, distFromHorizontalAxis)
        
        // Priority for animation order - corners first (high dist), cross center last
        const priority = distFromCross + Math.random() * 0.2

        // Skip chance - higher in corners (far from both axes)
        const inCrossArea = distFromCross < 0.4
        const skipChance = inCrossArea ? 0.05 : distFromCross > 0.7 ? 0.5 : 0.3
        if (Math.random() < skipChance) continue

        // Block size - larger in cross area, smaller in corners
        const sizeMultiplier = inCrossArea ? 1.2 : 0.7 + (1 - distFromCross) * 0.4
        const baseSize = 22 + Math.random() * 25
        const blockWidth = baseSize * sizeMultiplier
        const blockHeight = baseSize * sizeMultiplier

        // Random offset for scattered look
        const offsetX = (Math.random() - 0.5) * 12
        const offsetY = (Math.random() - 0.5) * 12

        const x = Math.max(0, Math.min(baseX + offsetX, rect.width - blockWidth))
        const y = Math.max(0, Math.min(baseY + offsetY, rect.height - blockHeight))

        const block = document.createElement('div')
        block.style.cssText = `
          position: absolute;
          left: ${x}px;
          top: ${y}px;
          width: ${blockWidth}px;
          height: ${blockHeight}px;
          overflow: hidden;
        `

        const contentClone = content.cloneNode(true) as HTMLDivElement
        contentClone.style.cssText = `
          position: absolute;
          left: ${-x}px;
          top: ${-y}px;
          width: ${rect.width}px;
          height: ${rect.height}px;
          visibility: visible;
        `
        block.appendChild(contentClone)

        blocks.push({ el: block, priority })
        blocksRef.current.push(block)
      }
    }

    // Sort - corners/edges first (high priority), cross center last
    blocks.sort((a, b) => b.priority - a.priority)

    const blocksContainer = document.createElement('div')
    blocksContainer.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: ${rect.width}px;
      height: ${rect.height}px;
      z-index: 10;
      pointer-events: none;
    `
    blocks.forEach((b) => blocksContainer.appendChild(b.el))

    content.style.visibility = 'hidden'
    containerRef.current!.appendChild(blocksContainer)

    timelineRef.current = gsap.timeline({
      onComplete: () => {
        blocksContainer.remove()
        blocksRef.current = []
        content.style.visibility = 'visible'
        setIsAnimating(false)
        onComplete()
      },
    })

    const blockEls = blocks.map((b) => b.el)

    timelineRef.current.to(blockEls, {
      scale: 0,
      opacity: 0,
      duration: duration * 0.35,
      stagger: {
        amount: duration * 0.85,
        from: 'start',
      },
      ease: 'power2.in',
    })
  }, [duration, onComplete, isAnimating])

  useEffect(() => {
    if (trigger && !isAnimating) {
      runAnimation()
    }
  }, [trigger, isAnimating, runAnimation])

  useEffect(() => {
    return () => {
      timelineRef.current?.kill()
      blocksRef.current.forEach((b) => b.remove())
    }
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <div ref={contentRef}>{children}</div>
    </div>
  )
}

export default BlockDisappearEffect
