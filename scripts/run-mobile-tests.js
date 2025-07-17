#!/usr/bin/env node

/**
 * Mobile Testing Suite Runner
 * Executes comprehensive mobile testing and generates reports
 */

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Test configuration
const TEST_CONFIG = {
  timeout: 30000, // 30 seconds per test
  coverage: true,
  verbose: true,
  detectOpenHandles: true
}

// Device matrix for testing
const DEVICE_MATRIX = [
  'iPhone SE (375px)',
  'iPhone 12/13 (390px)', 
  'Samsung Galaxy S21 (360px)',
  'iPad Mini (768px)',
  'iPad Pro (1024px)'
]

// Test suites to run
const TEST_SUITES = [
  {
    name: 'Mobile Components Testing',
    path: '__tests__/mobile/mobile-components.test.tsx',
    description: 'Tests all mobile components across device matrix'
  },
  {
    name: 'Performance Benchmarks',
    path: '__tests__/mobile/performance-benchmarks.test.ts',
    description: 'Measures mobile performance improvements'
  },
  {
    name: 'Accessibility Audit',
    path: '__tests__/mobile/accessibility-audit.test.tsx',
    description: 'WCAG AA compliance testing'
  }
]

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
}

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`)
}

function logHeader(message) {
  log('\n' + '='.repeat(60), 'cyan')
  log(message, 'bright')
  log('='.repeat(60), 'cyan')
}

function logSection(message) {
  log('\n' + '-'.repeat(40), 'blue')
  log(message, 'blue')
  log('-'.repeat(40), 'blue')
}

function runCommand(command, description) {
  try {
    log(`\n🔄 ${description}...`, 'yellow')
    const output = execSync(command, { 
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: TEST_CONFIG.timeout
    })
    log(`✅ ${description} completed`, 'green')
    return { success: true, output }
  } catch (error) {
    log(`❌ ${description} failed`, 'red')
    log(error.message, 'red')
    return { success: false, error: error.message }
  }
}

function generateTestReport(results) {
  const report = {
    timestamp: new Date().toISOString(),
    deviceMatrix: DEVICE_MATRIX,
    testSuites: results,
    summary: {
      total: results.length,
      passed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      successRate: (results.filter(r => r.success).length / results.length * 100).toFixed(1)
    }
  }

  // Write report to file
  const reportPath = path.join(__dirname, '..', 'test-reports', 'mobile-test-report.json')
  const reportDir = path.dirname(reportPath)
  
  if (!fs.existsSync(reportDir)) {
    fs.mkdirSync(reportDir, { recursive: true })
  }
  
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  
  return { report, reportPath }
}

function displaySummary(report) {
  logHeader('📊 MOBILE TESTING SUMMARY')
  
  log(`📱 Devices Tested: ${report.deviceMatrix.join(', ')}`, 'cyan')
  log(`🧪 Test Suites: ${report.summary.total}`, 'blue')
  log(`✅ Passed: ${report.summary.passed}`, 'green')
  log(`❌ Failed: ${report.summary.failed}`, 'red')
  log(`📈 Success Rate: ${report.summary.successRate}%`, 'bright')
  
  logSection('Test Suite Results')
  report.testSuites.forEach(suite => {
    const status = suite.success ? '✅' : '❌'
    const color = suite.success ? 'green' : 'red'
    log(`${status} ${suite.name}`, color)
    log(`   ${suite.description}`, 'reset')
  })
}

async function main() {
  logHeader('🚀 MOBILE OPTIMIZATION TESTING SUITE')
  
  log('Starting comprehensive mobile testing...', 'bright')
  log(`Device Matrix: ${DEVICE_MATRIX.join(', ')}`, 'cyan')
  
  // Check if Jest is available
  const jestCheck = runCommand('npx jest --version', 'Checking Jest installation')
  if (!jestCheck.success) {
    log('❌ Jest is not available. Please install Jest first.', 'red')
    process.exit(1)
  }
  
  log(`📦 Jest version: ${jestCheck.output.trim()}`, 'green')
  
  // Run test suites
  const results = []
  
  for (const suite of TEST_SUITES) {
    logSection(`Running ${suite.name}`)
    log(suite.description, 'blue')
    
    const command = `npx jest ${suite.path} --verbose --coverage --detectOpenHandles`
    const result = runCommand(command, suite.name)
    
    results.push({
      name: suite.name,
      path: suite.path,
      description: suite.description,
      success: result.success,
      output: result.output || result.error,
      timestamp: new Date().toISOString()
    })
  }
  
  // Generate and display report
  const { report, reportPath } = generateTestReport(results)
  displaySummary(report)
  
  logSection('📄 Report Generated')
  log(`Report saved to: ${reportPath}`, 'cyan')
  
  // Exit with appropriate code
  const allPassed = results.every(r => r.success)
  if (allPassed) {
    log('\n🎉 All mobile tests passed!', 'green')
    process.exit(0)
  } else {
    log('\n⚠️  Some mobile tests failed. Check the report for details.', 'yellow')
    process.exit(1)
  }
}

// Handle errors
process.on('uncaughtException', (error) => {
  log(`\n💥 Uncaught Exception: ${error.message}`, 'red')
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  log(`\n💥 Unhandled Rejection at: ${promise}, reason: ${reason}`, 'red')
  process.exit(1)
})

// Run the main function
if (require.main === module) {
  main().catch(error => {
    log(`\n💥 Error: ${error.message}`, 'red')
    process.exit(1)
  })
}

module.exports = { main, runCommand, generateTestReport }
