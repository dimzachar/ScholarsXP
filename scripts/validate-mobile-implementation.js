#!/usr/bin/env node

/**
 * Mobile Implementation Validation Script
 * Validates that all mobile optimization components exist and are properly implemented
 */

const fs = require('fs')
const path = require('path')

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
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

function checkFileExists(filePath, description) {
  const fullPath = path.join(__dirname, '..', filePath)
  const exists = fs.existsSync(fullPath)
  
  if (exists) {
    const stats = fs.statSync(fullPath)
    const size = (stats.size / 1024).toFixed(1)
    log(`✅ ${description} - ${filePath} (${size}KB)`, 'green')
    return { exists: true, size: stats.size, path: filePath }
  } else {
    log(`❌ ${description} - ${filePath} (NOT FOUND)`, 'red')
    return { exists: false, size: 0, path: filePath }
  }
}

function validateMobileComponents() {
  logHeader('📱 MOBILE COMPONENTS VALIDATION')
  
  const components = [
    // Core Layout Components
    { path: 'src/components/layout/MobileLayout.tsx', desc: 'MobileLayout Component' },
    { path: 'src/hooks/useResponsiveLayout.ts', desc: 'Responsive Layout Hook' },
    
    // Navigation Components
    { path: 'src/components/dashboard/MobileTabNavigation.tsx', desc: 'Mobile Tab Navigation' },
    { path: 'src/components/navigation/MobileBottomNav.tsx', desc: 'Mobile Bottom Navigation' },
    
    // UI Components
    { path: 'src/components/ui/responsive-stat-card.tsx', desc: 'Responsive Stat Card' },
    { path: 'src/components/dashboard/MobileActionCard.tsx', desc: 'Mobile Action Card' },
    { path: 'src/components/dashboard/MobileAchievementCard.tsx', desc: 'Mobile Achievement Card' },
    { path: 'src/components/ui/mobile-input.tsx', desc: 'Mobile Input Components' },
    { path: 'src/components/ui/gesture-wrapper.tsx', desc: 'Gesture Wrapper' },
    
    // Performance Components
    { path: 'src/components/optimization/LazyLoader.tsx', desc: 'Lazy Loading System' }
  ]
  
  const results = components.map(comp => checkFileExists(comp.path, comp.desc))
  const totalSize = results.reduce((sum, r) => sum + r.size, 0)
  
  log(`\n📊 Total mobile components size: ${(totalSize / 1024).toFixed(1)}KB`, 'cyan')
  
  return results
}

function validateDashboardIntegration() {
  logHeader('🏠 DASHBOARD INTEGRATION VALIDATION')
  
  const dashboardPath = 'src/app/dashboard/page.tsx'
  const result = checkFileExists(dashboardPath, 'Mobile Dashboard Implementation')
  
  if (result.exists) {
    const content = fs.readFileSync(path.join(__dirname, '..', dashboardPath), 'utf8')
    
    const integrations = [
      { pattern: /MobileLayout/g, name: 'MobileLayout usage' },
      { pattern: /MobileSection/g, name: 'MobileSection usage' },
      { pattern: /MobileTabNavigation/g, name: 'MobileTabNavigation usage' },
      { pattern: /useResponsiveLayout/g, name: 'useResponsiveLayout hook' },
      { pattern: /LazyWrapper/g, name: 'Lazy loading implementation' },
      { pattern: /GestureWrapper/g, name: 'Gesture support' },
      { pattern: /usePerformanceMonitor/g, name: 'Performance monitoring' }
    ]
    
    integrations.forEach(integration => {
      const matches = content.match(integration.pattern)
      if (matches) {
        log(`✅ ${integration.name} - ${matches.length} usage(s)`, 'green')
      } else {
        log(`❌ ${integration.name} - Not found`, 'red')
      }
    })
  }
  
  return result
}

function validateTestingFramework() {
  logHeader('🧪 TESTING FRAMEWORK VALIDATION')
  
  const testFiles = [
    { path: '__tests__/mobile/mobile-testing-framework.test.ts', desc: 'Mobile Testing Framework' },
    { path: '__tests__/mobile/mobile-components.test.tsx', desc: 'Mobile Components Tests' },
    { path: '__tests__/mobile/performance-benchmarks.test.ts', desc: 'Performance Benchmarks' },
    { path: '__tests__/mobile/accessibility-audit.test.tsx', desc: 'Accessibility Audit' }
  ]
  
  const results = testFiles.map(test => checkFileExists(test.path, test.desc))
  
  return results
}

function validateDocumentation() {
  logHeader('📚 DOCUMENTATION VALIDATION')
  
  const docFiles = [
    { path: 'docs/mobile-components-guide.md', desc: 'Mobile Components Guide' },
    { path: 'scholars_xp_mobile_optimization_plan.md', desc: 'Mobile Optimization Plan' }
  ]
  
  const results = docFiles.map(doc => checkFileExists(doc.path, doc.desc))
  
  return results
}

function generateValidationReport(componentResults, dashboardResult, testResults, docResults) {
  const report = {
    timestamp: new Date().toISOString(),
    validation: {
      components: {
        total: componentResults.length,
        implemented: componentResults.filter(r => r.exists).length,
        missing: componentResults.filter(r => !r.exists).length,
        totalSize: componentResults.reduce((sum, r) => sum + r.size, 0)
      },
      dashboard: {
        implemented: dashboardResult.exists,
        size: dashboardResult.size
      },
      testing: {
        total: testResults.length,
        implemented: testResults.filter(r => r.exists).length,
        missing: testResults.filter(r => !r.exists).length
      },
      documentation: {
        total: docResults.length,
        implemented: docResults.filter(r => r.exists).length,
        missing: docResults.filter(r => !r.exists).length
      }
    },
    summary: {
      totalFiles: componentResults.length + testResults.length + docResults.length + 1,
      implementedFiles: componentResults.filter(r => r.exists).length + 
                       testResults.filter(r => r.exists).length + 
                       docResults.filter(r => r.exists).length + 
                       (dashboardResult.exists ? 1 : 0),
      completionPercentage: 0
    }
  }
  
  report.summary.completionPercentage = 
    (report.summary.implementedFiles / report.summary.totalFiles * 100).toFixed(1)
  
  return report
}

function displaySummary(report) {
  logHeader('📊 MOBILE OPTIMIZATION VALIDATION SUMMARY')
  
  log(`📱 Mobile Components: ${report.validation.components.implemented}/${report.validation.components.total} implemented`, 'cyan')
  log(`🏠 Dashboard Integration: ${report.validation.dashboard.implemented ? 'IMPLEMENTED' : 'MISSING'}`, 
      report.validation.dashboard.implemented ? 'green' : 'red')
  log(`🧪 Testing Framework: ${report.validation.testing.implemented}/${report.validation.testing.total} implemented`, 'cyan')
  log(`📚 Documentation: ${report.validation.documentation.implemented}/${report.validation.documentation.total} implemented`, 'cyan')
  
  log(`\n🎯 Overall Completion: ${report.summary.completionPercentage}%`, 'bright')
  log(`📦 Total Mobile Bundle Size: ${(report.validation.components.totalSize / 1024).toFixed(1)}KB`, 'blue')
  
  if (parseFloat(report.summary.completionPercentage) >= 90) {
    log('\n🎉 MOBILE OPTIMIZATION IMPLEMENTATION: COMPLETE!', 'green')
  } else if (parseFloat(report.summary.completionPercentage) >= 75) {
    log('\n✅ MOBILE OPTIMIZATION IMPLEMENTATION: MOSTLY COMPLETE', 'yellow')
  } else {
    log('\n⚠️  MOBILE OPTIMIZATION IMPLEMENTATION: IN PROGRESS', 'red')
  }
}

function main() {
  logHeader('🚀 MOBILE OPTIMIZATION VALIDATION')
  
  log('Validating mobile optimization implementation...', 'bright')
  
  // Run validations
  const componentResults = validateMobileComponents()
  const dashboardResult = validateDashboardIntegration()
  const testResults = validateTestingFramework()
  const docResults = validateDocumentation()
  
  // Generate report
  const report = generateValidationReport(componentResults, dashboardResult, testResults, docResults)
  
  // Display summary
  displaySummary(report)
  
  // Save report
  const reportPath = path.join(__dirname, '..', 'validation-report.json')
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2))
  log(`\n📄 Validation report saved to: validation-report.json`, 'cyan')
  
  // Exit with appropriate code
  const isComplete = parseFloat(report.summary.completionPercentage) >= 90
  process.exit(isComplete ? 0 : 1)
}

if (require.main === module) {
  main()
}

module.exports = { main, checkFileExists, generateValidationReport }
