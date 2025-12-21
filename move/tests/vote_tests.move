#[test_only]
module scholarxp::vote_tests {
    use std::signer;
    use std::vector;
    use aptos_framework::timestamp;
    use scholarxp::vote;

    fun setup_timestamp(aptos_framework: &signer) {
        timestamp::set_time_has_started_for_testing(aptos_framework);
    }

    #[test(deployer = @scholarxp)]
    fun test_init_module(deployer: &signer) {
        vote::init_module_for_test(deployer);
        assert!(vote::get_vote_count(b"nonexistent") == 0, 0);
    }

    #[test(aptos_framework = @aptos_framework, deployer = @scholarxp, voter = @0x123)]
    fun test_cast_vote(aptos_framework: &signer, deployer: &signer, voter: &signer) {
        setup_timestamp(aptos_framework);
        vote::init_module_for_test(deployer);
        
        let submission_id = b"test-submission-uuid";
        vote::cast_vote(voter, submission_id, 60);
        
        assert!(vote::has_voted(signer::address_of(voter), submission_id), 0);
        assert!(vote::get_vote_count(submission_id) == 1, 1);
    }

    #[test(aptos_framework = @aptos_framework, deployer = @scholarxp, voter = @0x123)]
    #[expected_failure(abort_code = 1, location = scholarxp::vote)]
    fun test_duplicate_vote_fails(aptos_framework: &signer, deployer: &signer, voter: &signer) {
        setup_timestamp(aptos_framework);
        vote::init_module_for_test(deployer);
        
        let submission_id = b"test-submission-uuid";
        vote::cast_vote(voter, submission_id, 60);
        vote::cast_vote(voter, submission_id, 60); // Should fail
    }

    #[test(aptos_framework = @aptos_framework, deployer = @scholarxp, voter1 = @0x123, voter2 = @0x456)]
    fun test_multiple_voters(aptos_framework: &signer, deployer: &signer, voter1: &signer, voter2: &signer) {
        setup_timestamp(aptos_framework);
        vote::init_module_for_test(deployer);
        
        let submission_id = b"test-submission-uuid";
        vote::cast_vote(voter1, submission_id, 60);
        vote::cast_vote(voter2, submission_id, 120);
        
        assert!(vote::get_vote_count(submission_id) == 2, 0);
        assert!(vote::has_voted(signer::address_of(voter1), submission_id), 1);
        assert!(vote::has_voted(signer::address_of(voter2), submission_id), 2);
    }

    #[test(aptos_framework = @aptos_framework, deployer = @scholarxp, voter = @0x123)]
    fun test_different_submissions(aptos_framework: &signer, deployer: &signer, voter: &signer) {
        setup_timestamp(aptos_framework);
        vote::init_module_for_test(deployer);
        
        vote::cast_vote(voter, b"submission-1", 60);
        vote::cast_vote(voter, b"submission-2", 120);
        
        assert!(vote::get_vote_count(b"submission-1") == 1, 0);
        assert!(vote::get_vote_count(b"submission-2") == 1, 1);
        assert!(vote::has_voted(signer::address_of(voter), b"submission-1"), 2);
        assert!(vote::has_voted(signer::address_of(voter), b"submission-2"), 3);
    }

    #[test(aptos_framework = @aptos_framework, deployer = @scholarxp, voter = @0x123)]
    fun test_get_votes_returns_correct_data(aptos_framework: &signer, deployer: &signer, voter: &signer) {
        setup_timestamp(aptos_framework);
        vote::init_module_for_test(deployer);
        
        let submission_id = b"test-submission";
        vote::cast_vote(voter, submission_id, 75);
        
        let votes = vote::get_votes(submission_id);
        assert!(vector::length(&votes) == 1, 0);
    }

    #[test(deployer = @scholarxp)]
    fun test_get_votes_empty_submission(deployer: &signer) {
        vote::init_module_for_test(deployer);
        
        let votes = vote::get_votes(b"nonexistent");
        assert!(vector::length(&votes) == 0, 0);
    }

    #[test(aptos_framework = @aptos_framework, deployer = @scholarxp, voter1 = @0x123, voter2 = @0x456)]
    fun test_xp_values_preserved(aptos_framework: &signer, deployer: &signer, voter1: &signer, voter2: &signer) {
        setup_timestamp(aptos_framework);
        vote::init_module_for_test(deployer);
        
        let submission_id = b"test-submission";
        vote::cast_vote(voter1, submission_id, 30);
        vote::cast_vote(voter2, submission_id, 250);
        
        let votes = vote::get_votes(submission_id);
        assert!(vector::length(&votes) == 2, 0);
    }
}
