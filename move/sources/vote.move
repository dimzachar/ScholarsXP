module scholarxp::vote {
    use std::signer;
    use std::vector;
    use std::bcs;
    use aptos_std::smart_table::{Self, SmartTable};
    use aptos_framework::event;
    use aptos_framework::timestamp;

    /// Error codes
    const E_ALREADY_VOTED: u64 = 1;

    /// Resource to store all votes
    struct VoteRegistry has key {
        /// submission_id -> list of vote records
        votes: SmartTable<vector<u8>, vector<VoteRecord>>,
        /// (voter + submission_id) -> has_voted
        has_voted: SmartTable<vector<u8>, bool>,
    }

    /// Individual vote record
    struct VoteRecord has store, drop, copy {
        voter: address,
        xp_choice: u64,
        timestamp: u64,
    }

    #[event]
    /// Event emitted when a vote is cast
    struct VoteCast has drop, store {
        voter: address,
        submission_id: vector<u8>,
        xp_choice: u64,
        timestamp: u64,
    }

    /// Initialize the registry - called automatically on deployment
    fun init_module(deployer: &signer) {
        move_to(deployer, VoteRegistry {
            votes: smart_table::new(),
            has_voted: smart_table::new(),
        });
    }

    /// Public function: Cast a vote on a submission
    public entry fun cast_vote(
        voter: &signer,
        submission_id: vector<u8>,
        xp_choice: u64
    ) acquires VoteRegistry {
        let voter_addr = signer::address_of(voter);
        let registry = borrow_global_mut<VoteRegistry>(@scholarxp);

        // Create unique key for duplicate check
        let vote_key = create_vote_key(voter_addr, &submission_id);
        assert!(!smart_table::contains(&registry.has_voted, vote_key), E_ALREADY_VOTED);

        // Create vote record
        let record = VoteRecord {
            voter: voter_addr,
            xp_choice,
            timestamp: timestamp::now_seconds(),
        };

        // Add to submission's vote list
        if (!smart_table::contains(&registry.votes, submission_id)) {
            smart_table::add(&mut registry.votes, submission_id, vector::empty());
        };
        let votes = smart_table::borrow_mut(&mut registry.votes, submission_id);
        vector::push_back(votes, record);

        // Mark as voted
        smart_table::add(&mut registry.has_voted, vote_key, true);

        // Emit event
        event::emit(VoteCast {
            voter: voter_addr,
            submission_id,
            xp_choice,
            timestamp: timestamp::now_seconds(),
        });
    }

    #[view]
    /// View function: Check if wallet has voted on submission
    public fun has_voted(voter: address, submission_id: vector<u8>): bool acquires VoteRegistry {
        let registry = borrow_global<VoteRegistry>(@scholarxp);
        let vote_key = create_vote_key(voter, &submission_id);
        smart_table::contains(&registry.has_voted, vote_key)
    }

    #[view]
    /// View function: Get vote count for a submission
    public fun get_vote_count(submission_id: vector<u8>): u64 acquires VoteRegistry {
        let registry = borrow_global<VoteRegistry>(@scholarxp);
        if (!smart_table::contains(&registry.votes, submission_id)) {
            return 0
        };
        vector::length(smart_table::borrow(&registry.votes, submission_id))
    }

    #[view]
    /// View function: Get all votes for a submission
    public fun get_votes(submission_id: vector<u8>): vector<VoteRecord> acquires VoteRegistry {
        let registry = borrow_global<VoteRegistry>(@scholarxp);
        if (!smart_table::contains(&registry.votes, submission_id)) {
            return vector::empty()
        };
        *smart_table::borrow(&registry.votes, submission_id)
    }

    /// Internal: Create unique key from voter + submission_id
    fun create_vote_key(voter: address, submission_id: &vector<u8>): vector<u8> {
        let key = bcs::to_bytes(&voter);
        vector::append(&mut key, *submission_id);
        key
    }

    // ============ TEST HELPER ============
    #[test_only]
    public fun init_module_for_test(deployer: &signer) {
        init_module(deployer);
    }
}
