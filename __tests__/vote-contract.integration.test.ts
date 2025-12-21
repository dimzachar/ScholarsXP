/**
 * Vote Contract Integration Tests
 * 
 * Tests the vote-transactions.ts functions against the deployed contract.
 * Skips all tests if NEXT_PUBLIC_VOTE_CONTRACT is not set.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

// Check if contract is deployed
const CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_VOTE_CONTRACT;
const describeIf = CONTRACT_ADDRESS ? describe : describe.skip;

describeIf('Vote Contract Integration', () => {
  const testSubmissionId = `test-${Date.now()}`;
  let checkHasVotedOnChain: typeof import('@/lib/vote-transactions').checkHasVotedOnChain;
  let fetchVoteCountOnChain: typeof import('@/lib/vote-transactions').fetchVoteCountOnChain;
  let buildVoteTransaction: typeof import('@/lib/vote-transactions').buildVoteTransaction;
  let isVoteContractEnabled: typeof import('@/lib/movement').isVoteContractEnabled;

  beforeAll(async () => {
    const voteTx = await import('@/lib/vote-transactions');
    const movement = await import('@/lib/movement');
    checkHasVotedOnChain = voteTx.checkHasVotedOnChain;
    fetchVoteCountOnChain = voteTx.fetchVoteCountOnChain;
    buildVoteTransaction = voteTx.buildVoteTransaction;
    isVoteContractEnabled = movement.isVoteContractEnabled;
  });

  it('should have contract enabled when address is set', () => {
    expect(isVoteContractEnabled()).toBe(true);
  });

  it('should return false for has_voted on new submission', async () => {
    const hasVoted = await checkHasVotedOnChain(
      '0x1', // Test address that hasn't voted
      testSubmissionId
    );
    expect(hasVoted).toBe(false);
  });

  it('should return 0 vote count for new submission', async () => {
    const count = await fetchVoteCountOnChain(testSubmissionId);
    expect(count).toBe(0);
  });

  it('should build valid transaction with contract call', async () => {
    const tx = await buildVoteTransaction(
      testSubmissionId,
      60,
      '0x1' // Test address
    );
    expect(tx).toBeDefined();
    expect(tx.rawTransaction).toBeDefined();
  });
});

// Tests that run without contract (fallback behavior)
describe('Vote Contract Fallback', () => {
  it('should return false when contract check fails gracefully', async () => {
    const { checkHasVotedOnChain } = await import('@/lib/vote-transactions');
    const result = await checkHasVotedOnChain('0x999', 'nonexistent-submission-xyz');
    expect(result).toBe(false);
  });

  it('should return 0 when vote count check fails gracefully', async () => {
    const { fetchVoteCountOnChain } = await import('@/lib/vote-transactions');
    const result = await fetchVoteCountOnChain('nonexistent-submission-xyz');
    expect(result).toBe(0);
  });
});
