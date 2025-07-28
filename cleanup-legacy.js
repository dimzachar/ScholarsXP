#!/usr/bin/env node

/**
 * Legacy Data Cleanup Script
 * 
 * This script will help you clean up legacy data and users from the database.
 * Run this before testing the automatic merge flow.
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const BASE_URL = 'http://localhost:3002';

async function makeRequest(endpoint, method = 'GET') {
  try {
    const response = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        // You'll need to add your admin session cookie here
        'Cookie': 'sb-access-token=YOUR_ADMIN_TOKEN_HERE'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error(`❌ Request failed:`, error.message);
    return null;
  }
}

async function previewCleanup() {
  console.log('🔍 Getting preview of legacy data to be deleted...\n');
  
  const preview = await makeRequest('/api/admin/cleanup-legacy');
  
  if (!preview) {
    console.log('❌ Failed to get preview. Make sure you are logged in as admin.');
    return false;
  }

  console.log('📊 CLEANUP PREVIEW:');
  console.log('==================');
  console.log(`Legacy Submissions: ${preview.preview.legacySubmissions}`);
  console.log(`Legacy Users: ${preview.preview.legacyUsers}`);
  console.log(`XP Transactions: ${preview.preview.xpTransactions}`);
  console.log(`Weekly Stats: ${preview.preview.weeklyStats}\n`);

  if (preview.legacyUsers && preview.legacyUsers.length > 0) {
    console.log('👥 LEGACY USERS TO BE DELETED:');
    console.log('==============================');
    preview.legacyUsers.forEach(user => {
      console.log(`  • ${user.username} (${user.email})`);
      console.log(`    Total XP: ${user.totalXp}, Transactions: ${user.xpTransactions}, Weekly Stats: ${user.weeklyStats}`);
    });
    console.log('');
  }

  return true;
}

async function performCleanup() {
  console.log('🧹 Performing legacy data cleanup...\n');
  
  const result = await makeRequest('/api/admin/cleanup-legacy', 'POST');
  
  if (!result) {
    console.log('❌ Cleanup failed. Check the server logs for details.');
    return;
  }

  if (result.success) {
    console.log('✅ CLEANUP COMPLETED SUCCESSFULLY!');
    console.log('==================================');
    console.log(`Legacy Submissions deleted: ${result.results.legacySubmissions}`);
    console.log(`Legacy Users deleted: ${result.results.legacyUsers}`);
    console.log(`XP Transactions deleted: ${result.results.xpTransactions}`);
    console.log(`Weekly Stats deleted: ${result.results.weeklyStats}`);
    
    if (result.results.errors.length > 0) {
      console.log('\n⚠️  ERRORS ENCOUNTERED:');
      result.results.errors.forEach(error => console.log(`  • ${error}`));
    }
  } else {
    console.log('❌ CLEANUP FAILED:');
    console.log(result.message);
    if (result.error) {
      console.log(`Error: ${result.error}`);
    }
  }
}

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.toLowerCase().trim());
    });
  });
}

async function main() {
  console.log('🚀 Legacy Data Cleanup Tool');
  console.log('===========================\n');
  
  console.log('⚠️  WARNING: This will permanently delete all legacy data!');
  console.log('   • All legacy submissions');
  console.log('   • All legacy user accounts');
  console.log('   • All related XP transactions');
  console.log('   • All related weekly stats\n');

  // Step 1: Preview
  const previewSuccess = await previewCleanup();
  if (!previewSuccess) {
    rl.close();
    return;
  }

  // Step 2: Confirm
  const confirm1 = await askQuestion('Do you want to proceed with the cleanup? (yes/no): ');
  if (confirm1 !== 'yes') {
    console.log('❌ Cleanup cancelled.');
    rl.close();
    return;
  }

  const confirm2 = await askQuestion('Are you absolutely sure? This cannot be undone! (yes/no): ');
  if (confirm2 !== 'yes') {
    console.log('❌ Cleanup cancelled.');
    rl.close();
    return;
  }

  // Step 3: Perform cleanup
  await performCleanup();

  console.log('\n🎉 You can now import fresh legacy data and test the automatic merge flow!');
  
  rl.close();
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('❌ Unhandled error:', error);
  rl.close();
  process.exit(1);
});

// Run the script
main().catch(console.error);
