import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

interface PerformanceMetric {
  name: string
  value: number
  timestamp: number
  url?: string
  userId?: string
  metadata?: Record<string, any>
}

export async function POST(request: NextRequest) {
  try {
    const metric: PerformanceMetric = await request.json()

    // Validate the metric data
    if (!metric.name || typeof metric.value !== 'number') {
      return NextResponse.json(
        { error: 'Invalid metric data' },
        { status: 400 }
      )
    }

    // Store the metric in the database
    await prisma.systemLog.create({
      data: {
        level: 'INFO',
        message: `Performance metric: ${metric.name}`,
        metadata: {
          type: 'performance_metric',
          name: metric.name,
          value: metric.value,
          timestamp: metric.timestamp,
          url: metric.url,
          userId: metric.userId,
          ...metric.metadata
        }
      }
    })

    return NextResponse.json({ success: true })

  } catch (error) {
    console.error('Error storing performance metric:', error)
    return NextResponse.json(
      { error: 'Failed to store metric' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const timeframe = searchParams.get('timeframe') || '24h'
    const metricType = searchParams.get('type')

    // Calculate date range
    const now = new Date()
    let startDate: Date

    switch (timeframe) {
      case '1h':
        startDate = new Date(now.getTime() - 60 * 60 * 1000)
        break
      case '24h':
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
        break
      case '7d':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        break
      case '30d':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
        break
      default:
        startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    }

    // Build query conditions
    const whereConditions: any = {
      level: 'INFO',
      createdAt: {
        gte: startDate
      },
      metadata: {
        path: ['type'],
        equals: 'performance_metric'
      }
    }

    if (metricType) {
      whereConditions.metadata = {
        ...whereConditions.metadata,
        path: ['name'],
        string_contains: metricType
      }
    }

    // Get performance metrics
    const metrics = await prisma.systemLog.findMany({
      where: whereConditions,
      orderBy: {
        createdAt: 'desc'
      },
      take: 1000 // Limit to prevent large responses
    })

    // Process and aggregate the metrics
    const processedMetrics = metrics.map(log => ({
      name: log.metadata?.name,
      value: log.metadata?.value,
      timestamp: log.metadata?.timestamp || log.createdAt.getTime(),
      url: log.metadata?.url,
      userId: log.metadata?.userId,
      rating: log.metadata?.rating,
      metadata: log.metadata
    }))

    // Calculate aggregations
    const aggregations = calculateAggregations(processedMetrics)

    return NextResponse.json({
      success: true,
      data: {
        metrics: processedMetrics,
        aggregations,
        timeframe,
        count: processedMetrics.length
      }
    })

  } catch (error) {
    console.error('Error fetching performance metrics:', error)
    return NextResponse.json(
      { error: 'Failed to fetch metrics' },
      { status: 500 }
    )
  }
}

function calculateAggregations(metrics: any[]) {
  const aggregations: Record<string, any> = {}

  // Group metrics by name
  const grouped = metrics.reduce((acc, metric) => {
    const name = metric.name
    if (!acc[name]) {
      acc[name] = []
    }
    acc[name].push(metric.value)
    return acc
  }, {} as Record<string, number[]>)

  // Calculate statistics for each metric type
  Object.entries(grouped).forEach(([name, values]) => {
    const sorted = values.sort((a, b) => a - b)
    
    aggregations[name] = {
      count: values.length,
      avg: values.reduce((a, b) => a + b, 0) / values.length,
      min: Math.min(...values),
      max: Math.max(...values),
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p75: sorted[Math.floor(sorted.length * 0.75)],
      p90: sorted[Math.floor(sorted.length * 0.9)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)]
    }
  })

  // Calculate Web Vitals summary
  const webVitals = ['webvital_cls', 'webvital_fid', 'webvital_fcp', 'webvital_lcp', 'webvital_ttfb']
  const webVitalsSummary: Record<string, any> = {}

  webVitals.forEach(vital => {
    if (aggregations[vital]) {
      const vitalName = vital.replace('webvital_', '').toUpperCase()
      webVitalsSummary[vitalName] = {
        value: aggregations[vital].p75, // Use P75 as representative value
        rating: getWebVitalRating(vitalName, aggregations[vital].p75)
      }
    }
  })

  aggregations._webVitalsSummary = webVitalsSummary

  return aggregations
}

function getWebVitalRating(name: string, value: number): 'good' | 'needs-improvement' | 'poor' {
  const thresholds = {
    CLS: { good: 0.1, poor: 0.25 },
    FID: { good: 100, poor: 300 },
    FCP: { good: 1800, poor: 3000 },
    LCP: { good: 2500, poor: 4000 },
    TTFB: { good: 800, poor: 1800 },
    INP: { good: 200, poor: 500 }
  }

  const threshold = thresholds[name as keyof typeof thresholds]
  if (!threshold) return 'good'

  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}
