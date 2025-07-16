import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function detectPlatform(url: string): string | null {
  if (!url) return null
  
  try {
    const urlObj = new URL(url)
    const hostname = urlObj.hostname.toLowerCase()
    
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
      return 'Twitter'
    }
    
    if (hostname.includes('medium.com')) {
      return 'Medium'
    }
    
    return null
  } catch {
    return null
  }
}

export function getWeekNumber(date: Date = new Date()): number {
  const d = new Date(date.getTime())
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7)
  const week1 = new Date(d.getFullYear(), 0, 4)
  return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7)
}

export function getWeekBoundaries(weekNumber: number, year: number): { startDate: Date; endDate: Date } {
  // Calculate the start of the year
  const yearStart = new Date(year, 0, 1)

  // Find the first Monday of the year
  const firstMonday = new Date(yearStart)
  const dayOfWeek = yearStart.getDay()
  const daysToMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek
  firstMonday.setDate(yearStart.getDate() + daysToMonday)

  // Calculate the start of the specified week
  const startDate = new Date(firstMonday)
  startDate.setDate(firstMonday.getDate() + (weekNumber - 1) * 7)
  startDate.setHours(0, 0, 0, 0)

  // Calculate the end of the week (Sunday)
  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)
  endDate.setHours(23, 59, 59, 999)

  return { startDate, endDate }
}

