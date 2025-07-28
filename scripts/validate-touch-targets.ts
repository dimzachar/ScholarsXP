#!/usr/bin/env tsx

/**
 * Touch Target Validation Script
 * 
 * Validates that all interactive elements meet touch target requirements
 * across the application for accessibility compliance.
 */

import { JSDOM } from 'jsdom'
import fs from 'fs'
import path from 'path'
import { TOUCH_TARGET_SIZES } from '../src/lib/touch-targets'

interface TouchTargetIssue {
  file: string
  line: number
  element: string
  issue: string
  severity: 'error' | 'warning' | 'info'
  recommendation: string
}

interface ValidationResult {
  passed: boolean
  issues: TouchTargetIssue[]
  summary: {
    totalFiles: number
    filesWithIssues: number
    totalIssues: number
    errors: number
    warnings: number
  }
}

class TouchTargetValidator {
  private issues: TouchTargetIssue[] = []
  private processedFiles = 0

  async validateProject(): Promise<ValidationResult> {
    console.log('🔍 Starting touch target validation...\n')

    // Find all React component files
    const componentFiles = await this.findComponentFiles()
    
    for (const file of componentFiles) {
      await this.validateFile(file)
    }

    return this.generateReport()
  }

  private async findComponentFiles(): Promise<string[]> {
    const files: string[] = []
    const srcDir = path.join(process.cwd(), 'src')

    const walkDir = (dir: string) => {
      const items = fs.readdirSync(dir)
      
      for (const item of items) {
        const fullPath = path.join(dir, item)
        const stat = fs.statSync(fullPath)
        
        if (stat.isDirectory()) {
          walkDir(fullPath)
        } else if (item.endsWith('.tsx') || item.endsWith('.jsx')) {
          files.push(fullPath)
        }
      }
    }

    walkDir(srcDir)
    return files
  }

  private async validateFile(filePath: string): Promise<void> {
    try {
      const content = fs.readFileSync(filePath, 'utf-8')
      const relativePath = path.relative(process.cwd(), filePath)
      
      this.processedFiles++
      
      // Check for dynamic class generation issues
      this.checkDynamicClasses(content, relativePath)
      
      // Check for missing touch target classes
      this.checkMissingTouchTargets(content, relativePath)
      
      // Check for proper accessibility attributes
      this.checkAccessibilityAttributes(content, relativePath)
      
    } catch (error) {
      console.error(`Error processing ${filePath}:`, error)
    }
  }

  private checkDynamicClasses(content: string, filePath: string): void {
    const lines = content.split('\n')
    
    lines.forEach((line, index) => {
      // Check for dynamic min-h classes with template literals
      const dynamicMinHeight = /min-h-\[\$\{.*\}px\]/g
      if (dynamicMinHeight.test(line)) {
        this.issues.push({
          file: filePath,
          line: index + 1,
          element: 'dynamic class',
          issue: 'Dynamic min-h class with template literal detected',
          severity: 'error',
          recommendation: 'Use static Tailwind classes like min-h-11 (44px) or min-h-12 (48px)'
        })
      }

      // Check for dynamic min-w classes
      const dynamicMinWidth = /min-w-\[\$\{.*\}px\]/g
      if (dynamicMinWidth.test(line)) {
        this.issues.push({
          file: filePath,
          line: index + 1,
          element: 'dynamic class',
          issue: 'Dynamic min-w class with template literal detected',
          severity: 'error',
          recommendation: 'Use static Tailwind classes like min-w-11 (44px) or min-w-12 (48px)'
        })
      }
    })
  }

  private checkMissingTouchTargets(content: string, filePath: string): void {
    const lines = content.split('\n')
    
    lines.forEach((line, index) => {
      // Check for buttons without touch target classes
      if (line.includes('<Button') || line.includes('<button')) {
        const hasMinHeight = /min-h-\d+/.test(line) || /min-h-\[/.test(line)
        
        if (!hasMinHeight && !line.includes('size=')) {
          this.issues.push({
            file: filePath,
            line: index + 1,
            element: 'button',
            issue: 'Button without explicit touch target sizing',
            severity: 'warning',
            recommendation: 'Add min-h-11 class or use size prop for proper touch targets'
          })
        }
      }

      // Check for clickable divs without touch targets
      if (line.includes('onClick') && line.includes('<div')) {
        const hasMinHeight = /min-h-\d+/.test(line)
        
        if (!hasMinHeight) {
          this.issues.push({
            file: filePath,
            line: index + 1,
            element: 'clickable div',
            issue: 'Clickable div without touch target sizing',
            severity: 'warning',
            recommendation: 'Add min-h-11 class for 44px minimum touch target'
          })
        }
      }
    })
  }

  private checkAccessibilityAttributes(content: string, filePath: string): void {
    const lines = content.split('\n')
    
    lines.forEach((line, index) => {
      // Check for interactive elements without ARIA labels
      if ((line.includes('onClick') || line.includes('<Button')) && 
          !line.includes('aria-label') && 
          !line.includes('aria-labelledby')) {
        
        // Skip if it has visible text content
        const hasVisibleText = />\s*\w+/.test(line) || line.includes('children')
        
        if (!hasVisibleText) {
          this.issues.push({
            file: filePath,
            line: index + 1,
            element: 'interactive element',
            issue: 'Interactive element without ARIA label or visible text',
            severity: 'warning',
            recommendation: 'Add aria-label attribute for screen reader accessibility'
          })
        }
      }

      // Check for missing focus-visible classes
      if ((line.includes('<Button') || line.includes('onClick')) && 
          !line.includes('focus-visible:') && 
          !line.includes('focus:')) {
        this.issues.push({
          file: filePath,
          line: index + 1,
          element: 'interactive element',
          issue: 'Interactive element without focus styles',
          severity: 'info',
          recommendation: 'Add focus-visible:ring-2 focus-visible:ring-primary for keyboard navigation'
        })
      }
    })
  }

  private generateReport(): ValidationResult {
    const errors = this.issues.filter(i => i.severity === 'error').length
    const warnings = this.issues.filter(i => i.severity === 'warning').length
    const filesWithIssues = new Set(this.issues.map(i => i.file)).size

    const result: ValidationResult = {
      passed: errors === 0,
      issues: this.issues,
      summary: {
        totalFiles: this.processedFiles,
        filesWithIssues,
        totalIssues: this.issues.length,
        errors,
        warnings
      }
    }

    this.printReport(result)
    return result
  }

  private printReport(result: ValidationResult): void {
    console.log('📋 Touch Target Validation Report\n')
    
    // Summary
    console.log('📊 Summary:')
    console.log(`  Files processed: ${result.summary.totalFiles}`)
    console.log(`  Files with issues: ${result.summary.filesWithIssues}`)
    console.log(`  Total issues: ${result.summary.totalIssues}`)
    console.log(`  Errors: ${result.summary.errors}`)
    console.log(`  Warnings: ${result.summary.warnings}`)
    console.log('')

    // Overall status
    if (result.passed) {
      console.log('✅ All touch target requirements met!')
    } else {
      console.log('❌ Touch target validation failed - errors found')
    }
    console.log('')

    // Group issues by file
    const issuesByFile = result.issues.reduce((acc, issue) => {
      if (!acc[issue.file]) {
        acc[issue.file] = []
      }
      acc[issue.file].push(issue)
      return acc
    }, {} as Record<string, TouchTargetIssue[]>)

    // Print issues
    Object.entries(issuesByFile).forEach(([file, issues]) => {
      console.log(`📁 ${file}:`)
      
      issues.forEach(issue => {
        const icon = issue.severity === 'error' ? '🔴' : 
                    issue.severity === 'warning' ? '🟡' : '🔵'
        
        console.log(`  ${icon} Line ${issue.line}: ${issue.issue}`)
        console.log(`     💡 ${issue.recommendation}`)
        console.log('')
      })
    })

    // Recommendations
    if (result.issues.length > 0) {
      console.log('💡 General Recommendations:')
      console.log('  1. Use static Tailwind classes: min-h-11 (44px), min-h-12 (48px)')
      console.log('  2. Import touch target utilities from src/lib/touch-targets.ts')
      console.log('  3. Use getResponsiveTouchTarget() for device-specific sizing')
      console.log('  4. Add ACCESSIBILITY_HELPERS.touchAccessible for full a11y support')
      console.log('')
    }
  }
}

async function main() {
  const validator = new TouchTargetValidator()
  const result = await validator.validateProject()
  
  // Exit with error code if validation failed
  process.exit(result.passed ? 0 : 1)
}

if (require.main === module) {
  main().catch(console.error)
}

export { TouchTargetValidator }
