#!/usr/bin/env node

/**
 * Script to run the automation migration
 * This will set up the AutomationLog table and cron jobs for automated operations
 */

const fs = require('fs')
const path = require('path')

// Read the migration file
const migrationPath = path.join(__dirname, 'supabase', 'migrations', '012_critical_automation_cron_jobs.sql')

if (!fs.existsSync(migrationPath)) {
  console.error('❌ Migration file not found:', migrationPath)
  process.exit(1)
}

const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

console.log('🚀 Automation Migration Setup')
console.log('==============================')
console.log('')
console.log('This script will help you run the automation migration.')
console.log('The migration will:')
console.log('  • Create the AutomationLog table for monitoring')
console.log('  • Set up cron jobs for weekly operations (Monday 12:01 AM)')
console.log('  • Set up cron jobs for XP aggregation (every 20 minutes)')
console.log('  • Create helper functions for automation logging')
console.log('')

console.log('📋 MIGRATION CONTENT:')
console.log('=====================')
console.log('')
console.log('Copy and paste the following SQL into your Supabase SQL Editor:')
console.log('')
console.log('--- START MIGRATION SQL ---')
console.log(migrationSQL)
console.log('--- END MIGRATION SQL ---')
console.log('')

console.log('📝 MANUAL STEPS:')
console.log('================')
console.log('')
console.log('1. Go to your Supabase project dashboard')
console.log('2. Navigate to SQL Editor')
console.log('3. Copy the SQL above and paste it into the editor')
console.log('4. Click "Run" to execute the migration')
console.log('')

console.log('⚙️  CONFIGURATION REQUIRED:')
console.log('===========================')
console.log('')
console.log('After running the migration, you need to configure these settings in Supabase:')
console.log('')
console.log('Run these commands in the Supabase SQL Editor:')
console.log('')
console.log("SELECT set_config('app.base_url', 'https://your-domain.com', false);")
console.log("SELECT set_config('app.cron_secret', 'your-secure-cron-secret-here', false);")
console.log('')
console.log('Replace:')
console.log('  • your-domain.com with your actual domain')
console.log('  • your-secure-cron-secret-here with a secure random string')
console.log('')

console.log('🔐 ENVIRONMENT VARIABLES:')
console.log('=========================')
console.log('')
console.log('Add this to your .env.local file:')
console.log('')
console.log('CRON_SECRET=your-secure-cron-secret-here')
console.log('')
console.log('(Use the same secret you configured in Supabase above)')
console.log('')

console.log('✅ VERIFICATION:')
console.log('===============')
console.log('')
console.log('After running the migration and configuration:')
console.log('')
console.log('1. Refresh your admin dashboard')
console.log('2. Go to the Automation tab')
console.log('3. You should see automation status instead of setup instructions')
console.log('4. Check that cron jobs are scheduled:')
console.log('')
console.log('   SELECT jobname, schedule, active FROM cron.job')
console.log('   WHERE jobname LIKE \'%automation%\';')
console.log('')

console.log('🎉 Once complete, your platform will have:')
console.log('==========================================')
console.log('')
console.log('  ✅ Automated weekly operations (Monday 12:01 AM)')
console.log('  ✅ Automated XP aggregation (every 20 minutes)')
console.log('  ✅ Comprehensive automation monitoring')
console.log('  ✅ Admin dashboard with real-time status')
console.log('  ✅ Manual override capabilities maintained')
console.log('')

console.log('Need help? Check the documentation:')
console.log('  • critical-automation-implementation-guide.md')
console.log('  • complete-automation-implementation-summary.md')
