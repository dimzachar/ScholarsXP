import { compareAnalyticsResults, getConsolidatedAnalytics, getFallbackAnalytics } from './database-queries'

export interface PerformanceTestResult {
  testName: string
  timestamp: string
  timeframe: string
  consolidated: {
    executionTime: number
    queryType: string
  }
  fallback: {
    executionTime: number
    queryType: string
  }
  performanceGain: {
    speedupFactor: number
    timeSaved: number
    percentageImprovement: number
  }
  dataIntegrity: {
    matches: boolean
    differences: string[]
  }
  success: boolean
  error?: string
}

export interface LoadTestResult {
  testName: string
  timestamp: string
  concurrentRequests: number
  totalRequests: number
  timeframe: string
  useOptimized: boolean
  results: {
    averageResponseTime: number
    minResponseTime: number
    maxResponseTime: number
    successRate: number
    failureCount: number
    totalExecutionTime: number
  }
  errors: string[]
}

/**
 * Performance testing service for analytics optimization
 */
export class AnalyticsPerformanceTest {
  
  /**
   * Run comprehensive performance comparison test
   */
  async runPerformanceTest(timeframe: string = 'last_30_days'): Promise<PerformanceTestResult> {
    const testName = `Analytics Performance Test - ${timeframe}`
    const timestamp = new Date().toISOString()
    
    try {
      console.log(`🧪 Starting ${testName}...`)
      
      // Calculate date ranges
      const now = new Date()
      let startDate: Date
      
      switch (timeframe) {
        case 'last_7_days':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'last_30_days':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case 'last_90_days':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date('2020-01-01') // All time
      }
      
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      // Run comparison test
      const comparison = await compareAnalyticsResults(startDate, weekAgo, timeframe)
      
      // Calculate performance metrics
      const timeSaved = comparison.fallback.executionTime - comparison.consolidated.executionTime
      const speedupFactor = comparison.fallback.executionTime / comparison.consolidated.executionTime
      const percentageImprovement = ((timeSaved / comparison.fallback.executionTime) * 100)
      
      const result: PerformanceTestResult = {
        testName,
        timestamp,
        timeframe,
        consolidated: {
          executionTime: comparison.consolidated.executionTime,
          queryType: comparison.consolidated.queryType
        },
        fallback: {
          executionTime: comparison.fallback.executionTime,
          queryType: comparison.fallback.queryType
        },
        performanceGain: {
          speedupFactor: Math.round(speedupFactor * 100) / 100,
          timeSaved,
          percentageImprovement: Math.round(percentageImprovement * 100) / 100
        },
        dataIntegrity: {
          matches: comparison.matches,
          differences: comparison.differences
        },
        success: true
      }
      
      console.log(`✅ ${testName} completed successfully`)
      console.log(`📊 Performance gain: ${result.performanceGain.speedupFactor}x faster (${result.performanceGain.percentageImprovement}% improvement)`)
      console.log(`📊 Data integrity: ${result.dataIntegrity.matches ? 'PASS' : 'FAIL'}`)
      
      return result
      
    } catch (error) {
      console.error(`❌ ${testName} failed:`, error)
      
      return {
        testName,
        timestamp,
        timeframe,
        consolidated: { executionTime: 0, queryType: 'error' },
        fallback: { executionTime: 0, queryType: 'error' },
        performanceGain: { speedupFactor: 0, timeSaved: 0, percentageImprovement: 0 },
        dataIntegrity: { matches: false, differences: [] },
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }
  
  /**
   * Run load testing with concurrent requests
   */
  async runLoadTest(
    concurrentRequests: number = 10,
    timeframe: string = 'last_30_days',
    useOptimized: boolean = true
  ): Promise<LoadTestResult> {
    const testName = `Load Test - ${concurrentRequests} concurrent requests`
    const timestamp = new Date().toISOString()
    const totalRequests = concurrentRequests
    
    console.log(`🚀 Starting ${testName} (${useOptimized ? 'optimized' : 'legacy'})...`)
    
    try {
      // Calculate date ranges
      const now = new Date()
      let startDate: Date
      
      switch (timeframe) {
        case 'last_7_days':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
          break
        case 'last_30_days':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
          break
        case 'last_90_days':
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
          break
        default:
          startDate = new Date('2020-01-01') // All time
      }
      
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      
      // Create array of promises for concurrent execution
      const testPromises = Array.from({ length: concurrentRequests }, async () => {
        const startTime = Date.now()
        try {
          if (useOptimized) {
            await getConsolidatedAnalytics(startDate, weekAgo, timeframe)
          } else {
            await getFallbackAnalytics(startDate, weekAgo, timeframe)
          }
          return {
            success: true,
            executionTime: Date.now() - startTime,
            error: null
          }
        } catch (error) {
          return {
            success: false,
            executionTime: Date.now() - startTime,
            error: error instanceof Error ? error.message : 'Unknown error'
          }
        }
      })
      
      // Execute all requests concurrently
      const testStartTime = Date.now()
      const results = await Promise.all(testPromises)
      const totalExecutionTime = Date.now() - testStartTime
      
      // Calculate metrics
      const successfulResults = results.filter(r => r.success)
      const failedResults = results.filter(r => !r.success)
      const executionTimes = successfulResults.map(r => r.executionTime)
      
      const loadTestResult: LoadTestResult = {
        testName,
        timestamp,
        concurrentRequests,
        totalRequests,
        timeframe,
        useOptimized,
        results: {
          averageResponseTime: executionTimes.length > 0 
            ? Math.round(executionTimes.reduce((sum, time) => sum + time, 0) / executionTimes.length)
            : 0,
          minResponseTime: executionTimes.length > 0 ? Math.min(...executionTimes) : 0,
          maxResponseTime: executionTimes.length > 0 ? Math.max(...executionTimes) : 0,
          successRate: (successfulResults.length / totalRequests) * 100,
          failureCount: failedResults.length,
          totalExecutionTime
        },
        errors: failedResults.map(r => r.error).filter(Boolean) as string[]
      }
      
      console.log(`✅ ${testName} completed`)
      console.log(`📊 Success rate: ${loadTestResult.results.successRate}%`)
      console.log(`📊 Average response time: ${loadTestResult.results.averageResponseTime}ms`)
      console.log(`📊 Total execution time: ${loadTestResult.results.totalExecutionTime}ms`)
      
      return loadTestResult
      
    } catch (error) {
      console.error(`❌ ${testName} failed:`, error)
      
      return {
        testName,
        timestamp,
        concurrentRequests,
        totalRequests,
        timeframe,
        useOptimized,
        results: {
          averageResponseTime: 0,
          minResponseTime: 0,
          maxResponseTime: 0,
          successRate: 0,
          failureCount: totalRequests,
          totalExecutionTime: 0
        },
        errors: [error instanceof Error ? error.message : 'Unknown error']
      }
    }
  }
  
  /**
   * Run comprehensive test suite
   */
  async runTestSuite(): Promise<{
    performanceTests: PerformanceTestResult[]
    loadTests: LoadTestResult[]
    summary: {
      allTestsPassed: boolean
      averageSpeedup: number
      dataIntegrityPassed: boolean
      recommendOptimization: boolean
    }
  }> {
    console.log('🧪 Starting comprehensive analytics test suite...')
    
    // Run performance tests for different timeframes
    const timeframes = ['last_7_days', 'last_30_days', 'last_90_days', 'all_time']
    const performanceTests = await Promise.all(
      timeframes.map(timeframe => this.runPerformanceTest(timeframe))
    )
    
    // Run load tests
    const loadTests = await Promise.all([
      this.runLoadTest(5, 'last_30_days', true),   // 5 concurrent optimized
      this.runLoadTest(5, 'last_30_days', false),  // 5 concurrent legacy
      this.runLoadTest(10, 'last_30_days', true),  // 10 concurrent optimized
      this.runLoadTest(10, 'last_30_days', false)  // 10 concurrent legacy
    ])
    
    // Calculate summary metrics
    const successfulPerformanceTests = performanceTests.filter(t => t.success)
    const averageSpeedup = successfulPerformanceTests.length > 0
      ? successfulPerformanceTests.reduce((sum, test) => sum + test.performanceGain.speedupFactor, 0) / successfulPerformanceTests.length
      : 0
    
    const dataIntegrityPassed = performanceTests.every(test => test.dataIntegrity.matches)
    const allTestsPassed = performanceTests.every(test => test.success) && loadTests.every(test => test.results.successRate === 100)
    
    const summary = {
      allTestsPassed,
      averageSpeedup: Math.round(averageSpeedup * 100) / 100,
      dataIntegrityPassed,
      recommendOptimization: averageSpeedup > 2 && dataIntegrityPassed && allTestsPassed
    }
    
    console.log('📊 Test Suite Summary:')
    console.log(`   All tests passed: ${summary.allTestsPassed}`)
    console.log(`   Average speedup: ${summary.averageSpeedup}x`)
    console.log(`   Data integrity: ${summary.dataIntegrityPassed ? 'PASS' : 'FAIL'}`)
    console.log(`   Recommend optimization: ${summary.recommendOptimization ? 'YES' : 'NO'}`)
    
    return {
      performanceTests,
      loadTests,
      summary
    }
  }
}

// Export singleton instance
export const analyticsPerformanceTest = new AnalyticsPerformanceTest()
