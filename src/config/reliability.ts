/**
 * Configuration for the Reliability Formula System
 */

export const RELIABILITY_CONFIG = {
    // The formula currently used for production consensus weighting
    ACTIVE_FORMULA: 'LEGACY' as 'LEGACY' | 'CUSTOM_V1',

    // Toggle for the inclusion of voting-based metrics (voteValidation)
    USE_VOTE_VALIDATION: true,

    // When enabled, the system calculates and logs the custom formula 
    // without affecting the actual consensus outcome.
    ENABLE_SHADOW_MODE: true,

    // Parameters for the vote validation heuristic
    // Formula: max(0, min(1.0, baseline + (validated * bonus) - (invalidated * penalty)))
    VOTE_VALIDATION_PARAMS: {
        baseline: 0.65,
        bonus: 0.02,
        penalty: 0.05,
    },

    // Thresholds for identifying "Bad" reviewers (used in audits/insights)
    BAD_REVIEWER_THRESHOLDS: {
        missedRate: 0.25,      // 25% missed assignments
        penaltyAmount: 20,     // 20+ points in manual penalties
        timeliness: 0.70,      // <70% on-time
        accuracy: 0.50,        // <50% accuracy (if data exists)
    },

    // Normalization constants
    NORMALIZATION: {
        MAX_REVIEWS_FOR_EXPERIENCE: 50,
        MAX_DEVIATION_FOR_ACCURACY: 100,
        MAX_STD_DEV_FOR_VARIANCE: 100,
    }
}
