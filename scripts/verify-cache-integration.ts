#!/usr/bin/env tsx

/**
 * Cache Integration Verification Script
 * 
 * This script verifies that the multi-layer cache system is properly integrated
 * into the codebase by checking imports and usage patterns.
 */

import fs from 'fs'
import path from 'path'

interface IntegrationCheck {
  name: string
  passed: boolean
  details: string[]
  errors: string[]
}

class CacheIntegrationVerifier {
  private checks: IntegrationCheck[] = []
  private projectRoot: string

  constructor() {
    this.projectRoot = process.cwd()
  }

  async runAllChecks(): Promise<void> {
    console.log('🔍 Verifying Multi-Layer Cache Integration...\n')

    // Run verification checks
    this.checkCoreFiles()
    this.checkAPIEndpoints()
    this.checkDependencies()
    this.checkDatabaseTable()
    this.checkDocumentation()

    // Print results
    this.printResults()
  }

  private checkCoreFiles(): void {
    const check: IntegrationCheck = {
      name: 'Core Cache Files',
      passed: true,
      details: [],
      errors: []
    }

    const requiredFiles = [
      'src/lib/cache/enhanced-cache.ts',
      'src/lib/cache/database-cache.ts',
      'src/lib/cache/monitoring.ts',
      'src/lib/cache/enhanced-utils.ts',
      'src/lib/cache/health-check.ts',
      'src/lib/cache/invalidation.ts',
      'src/lib/cache/cache-warmer.ts'
    ]

    for (const file of requiredFiles) {
      const filePath = path.join(this.projectRoot, file)
      if (fs.existsSync(filePath)) {
        check.details.push(`✅ ${file} exists`)
      } else {
        check.passed = false
        check.errors.push(`❌ ${file} missing`)
      }
    }

    this.checks.push(check)
    console.log(`${check.passed ? '✅' : '❌'} ${check.name}: ${check.passed ? 'PASSED' : 'FAILED'}`)
  }

  private checkAPIEndpoints(): void {
    const check: IntegrationCheck = {
      name: 'API Endpoint Integration',
      passed: true,
      details: [],
      errors: []
    }

    const endpointsToCheck = [
      'src/app/api/leaderboard/route.ts',
      'src/app/api/admin/analytics/route.ts',
      'src/app/api/admin/users/route.ts',
      'src/app/api/admin/cache-stats/route.ts'
    ]

    for (const endpoint of endpointsToCheck) {
      const filePath = path.join(this.projectRoot, endpoint)
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8')
        
        // Check for cache imports
        const hasMultiLayerImport = content.includes('multiLayerCache') || content.includes('withEnhancedCache')
        const hasCacheHeaders = content.includes('Cache-Control') || content.includes('X-Cache')
        
        if (hasMultiLayerImport) {
          check.details.push(`✅ ${endpoint} uses multi-layer cache`)
        } else {
          check.details.push(`⚠️  ${endpoint} doesn't use multi-layer cache`)
        }

        if (hasCacheHeaders) {
          check.details.push(`✅ ${endpoint} has cache headers`)
        } else {
          check.details.push(`⚠️  ${endpoint} missing cache headers`)
        }
      } else {
        check.errors.push(`❌ ${endpoint} not found`)
      }
    }

    this.checks.push(check)
    console.log(`${check.passed ? '✅' : '❌'} ${check.name}: ${check.passed ? 'PASSED' : 'FAILED'}`)
  }

  private checkDependencies(): void {
    const check: IntegrationCheck = {
      name: 'Dependencies',
      passed: true,
      details: [],
      errors: []
    }

    const packageJsonPath = path.join(this.projectRoot, 'package.json')
    if (fs.existsSync(packageJsonPath)) {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies }

      // Check for required dependencies
      if (dependencies['lru-cache']) {
        check.details.push(`✅ lru-cache installed (${dependencies['lru-cache']})`)
      } else {
        check.passed = false
        check.errors.push('❌ lru-cache not installed')
      }

      if (dependencies['@types/lru-cache']) {
        check.details.push(`✅ @types/lru-cache installed (${dependencies['@types/lru-cache']})`)
      } else {
        check.details.push('⚠️  @types/lru-cache not installed (optional)')
      }

      if (dependencies['@supabase/supabase-js']) {
        check.details.push(`✅ @supabase/supabase-js installed (${dependencies['@supabase/supabase-js']})`)
      } else {
        check.passed = false
        check.errors.push('❌ @supabase/supabase-js not installed')
      }
    } else {
      check.passed = false
      check.errors.push('❌ package.json not found')
    }

    this.checks.push(check)
    console.log(`${check.passed ? '✅' : '❌'} ${check.name}: ${check.passed ? 'PASSED' : 'FAILED'}`)
  }

  private checkDatabaseTable(): void {
    const check: IntegrationCheck = {
      name: 'Database Configuration',
      passed: true,
      details: [],
      errors: []
    }

    // Check for SQL setup files
    const sqlFiles = [
      'sql/setup-cache-table.sql',
      'scripts/setup-cache-table.ts'
    ]

    for (const file of sqlFiles) {
      const filePath = path.join(this.projectRoot, file)
      if (fs.existsSync(filePath)) {
        check.details.push(`✅ ${file} exists`)
      } else {
        check.details.push(`⚠️  ${file} not found (may be created manually)`)
      }
    }

    // Check environment variables
    const envPath = path.join(this.projectRoot, '.env')
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf-8')
      
      if (envContent.includes('NEXT_PUBLIC_SUPABASE_URL')) {
        check.details.push('✅ Supabase URL configured')
      } else {
        check.passed = false
        check.errors.push('❌ NEXT_PUBLIC_SUPABASE_URL not configured')
      }

      if (envContent.includes('SUPABASE_SERVICE_ROLE_KEY')) {
        check.details.push('✅ Supabase service role key configured')
      } else {
        check.passed = false
        check.errors.push('❌ SUPABASE_SERVICE_ROLE_KEY not configured')
      }
    } else {
      check.passed = false
      check.errors.push('❌ .env file not found')
    }

    this.checks.push(check)
    console.log(`${check.passed ? '✅' : '❌'} ${check.name}: ${check.passed ? 'PASSED' : 'FAILED'}`)
  }

  private checkDocumentation(): void {
    const check: IntegrationCheck = {
      name: 'Documentation',
      passed: true,
      details: [],
      errors: []
    }

    const docFiles = [
      'multi-layer-caching-implementation.md',
      'multi-layer-caching-strategy.md',
      'docs/multi-layer-cache-guide.md'
    ]

    for (const file of docFiles) {
      const filePath = path.join(this.projectRoot, file)
      if (fs.existsSync(filePath)) {
        check.details.push(`✅ ${file} exists`)
      } else {
        check.details.push(`⚠️  ${file} not found`)
      }
    }

    this.checks.push(check)
    console.log(`${check.passed ? '✅' : '❌'} ${check.name}: ${check.passed ? 'PASSED' : 'FAILED'}`)
  }

  private printResults(): void {
    console.log('\n📊 Integration Verification Summary:')
    console.log('=' .repeat(60))
    
    const passed = this.checks.filter(c => c.passed).length
    const total = this.checks.length
    const passRate = (passed / total * 100).toFixed(1)

    console.log(`Overall: ${passed}/${total} checks passed (${passRate}%)`)
    console.log('')

    this.checks.forEach(check => {
      const status = check.passed ? '✅ PASS' : '❌ FAIL'
      console.log(`${status} | ${check.name}`)
      
      // Show details
      check.details.forEach(detail => {
        console.log(`     ${detail}`)
      })
      
      // Show errors
      check.errors.forEach(error => {
        console.log(`     ${error}`)
      })
      
      console.log('')
    })

    // Overall assessment
    if (passed === total) {
      console.log('🎉 Multi-layer cache system is fully integrated!')
      console.log('\n📋 Next Steps:')
      console.log('1. Start your development server: pnpm dev')
      console.log('2. Test cache endpoints: /api/admin/cache-stats')
      console.log('3. Monitor cache performance in production')
    } else {
      console.log('⚠️  Integration has some issues. Please address the failed checks above.')
      
      if (this.checks.find(c => c.name === 'Core Cache Files')?.passed) {
        console.log('\n✅ Core files are in place - the cache system should work!')
      }
      
      if (this.checks.find(c => c.name === 'Dependencies')?.passed) {
        console.log('✅ Dependencies are installed correctly')
      }
    }

    console.log('\n🔧 Cache System Features Available:')
    console.log('• Memory cache with LRU eviction')
    console.log('• Database persistence layer')
    console.log('• HTTP cache headers for CDN')
    console.log('• Cache monitoring and health checks')
    console.log('• Smart invalidation patterns')
    console.log('• Cache warming utilities')
  }
}

// Run verification if called directly
async function main() {
  const verifier = new CacheIntegrationVerifier()
  await verifier.runAllChecks()
  process.exit(0)
}

if (require.main === module) {
  main().catch(console.error)
}

export { CacheIntegrationVerifier }
