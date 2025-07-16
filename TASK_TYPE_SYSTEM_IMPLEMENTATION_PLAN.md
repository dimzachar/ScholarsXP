# Task Type System Enhancement - Implementation Plan

## Executive Summary

This document outlines the comprehensive implementation plan for enhancing the Scholars_XP task type system. The current A-F classification system requires significant updates to align with the proposed specifications, including new XP ranges, weekly caps, and content validation requirements.

**Priority**: HIGH  
**Estimated Timeline**: 3 weeks (21 days)  
**Business Impact**: Critical for system accuracy and user experience  
**Risk Level**: Medium-High (affects core XP calculation)

## Current State Analysis

### Existing Implementation
- **Task Types**: A-F classification exists but with incorrect specifications
- **Current XP Caps**: A(100), B(80), C(60), D(40), E(30), F(20)
- **Current Weekly Limits**: A(300), B(240), C(180), D(120), E(90), F(60)
- **AI Evaluator**: Generic task descriptions not matching proposed system
- **Validation**: Basic hashtag validation only

### Required Changes
- **New Task Definitions** (max 3 completions per task type per week):
  - A: Thread (5+ tweets) OR long article - 20-30 XP, max 90/week (3×30)
  - B: Article in reddit/notion/medium (2000+ chars) - 75-150 XP, max 450/week (3×150)
  - C: Tutorial/guide on partner app - 20-30 XP, max 90/week (3×30)
  - D: Protocol explanation (partner protocols) - 50-75 XP, max 225/week (3×75)
  - E: Correction bounty - 50-75 XP, max 225/week (3×75)
  - F: Strategies - 50-75 XP, max 225/week (3×75)

- **Multi-Task Scoring System**:
  - Same content can qualify for multiple task types simultaneously
  - Example: Thread explaining protocol = Task A (30 XP) + Task D (75 XP) = 105 XP total
  - Cross-platform posting: Same article on multiple platforms earns XP for each

- **Content Validation Requirements**:
  - **@ScholarsOfMove mention**: Required in all submissions across all platforms
  - **#ScholarsOfMove hashtag**: Required in all submissions across all platforms
  - **Platform Restrictions**: Task B limited to reddit/notion/medium only
  - **Weekly Limits**: Maximum 3 completions per task type (Monday-Sunday)
  - **Quality Standards**: Original content, Movement ecosystem focus, current week only

## Technical Specifications

### Architecture Requirements
- **Framework**: Next.js 15 with TypeScript
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: Supabase with RBAC (USER, REVIEWER, ADMIN)
- **AI Integration**: OpenAI GPT-4 for content evaluation
- **Deployment**: Production-ready with Supabase hosting

### Core Components to Update
1. **Task Type Configuration System** (`src/lib/task-types.ts`)
2. **Multi-Task Classification Logic** (`src/lib/multi-task-classifier.ts`)
3. **Weekly Task Tracking System** (`src/lib/weekly-task-tracker.ts`)
4. **AI Evaluator** (`src/lib/ai-evaluator.ts`)
5. **XP Aggregation Logic** (`src/lib/xp-aggregator.ts`)
6. **Content Validation Pipeline** (`src/lib/content-validator.ts`)
7. **Platform-Specific Validators** (`src/lib/platform-validators/`)
8. **Frontend Components** (submission forms, admin panels)

## Implementation Phases

### Phase 1: Core System Updates (Days 1-10)

#### Day 1-2: Task Type Configuration System
**Files to Create/Update:**
- `src/lib/task-types.ts` - Centralized task type definitions
- `src/types/task-types.ts` - TypeScript interfaces

**Implementation:**
```typescript
// New task type configuration structure
export interface TaskTypeConfig {
  id: string
  name: string
  description: string
  xpRange: { min: number; max: number }
  maxCompletionsPerWeek: number
  weeklyLimit: number // maxCompletionsPerWeek × xpRange.max
  validationRules: ValidationRule[]
  contentRequirements: ContentRequirement[]
  platformRestrictions?: string[] // Specific platforms required
  canStackWith: string[] // Other task types this can combine with
}

// Universal validation rules applied to ALL task types
const UNIVERSAL_VALIDATION_RULES: ValidationRule[] = [
  {
    type: 'MENTION_REQUIRED',
    mention: '@ScholarsOfMove',
    description: 'Must mention @ScholarsOfMove in content'
  },
  {
    type: 'HASHTAG_REQUIRED',
    hashtag: '#ScholarsOfMove',
    description: 'Must include #ScholarsOfMove hashtag'
  },
  {
    type: 'CURRENT_WEEK_ONLY',
    description: 'Content must be created in current week (Monday-Sunday)'
  },
  {
    type: 'ORIGINAL_CONTENT',
    description: 'Content must be original and Movement ecosystem focused'
  }
]

export const TASK_TYPES: Record<string, TaskTypeConfig> = {
  A: {
    id: 'A',
    name: 'Thread or Long Article',
    description: 'Twitter/X thread (5+ tweets) OR long article',
    xpRange: { min: 20, max: 30 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 90, // 3 × 30
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      { type: 'TWEET_COUNT_OR_LONG_ARTICLE', minTweets: 5, minChars: 2000 }
    ],
    contentRequirements: [
      { platform: 'Twitter', minLength: 5, type: 'TWEET_COUNT' },
      { platform: 'Any', minLength: 2000, type: 'CHARACTER_COUNT' }
    ],
    canStackWith: ['C', 'D', 'E', 'F']
  },
  B: {
    id: 'B',
    name: 'Platform Article',
    description: 'Article in reddit/notion/medium (2000+ characters)',
    xpRange: { min: 75, max: 150 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 450, // 3 × 150
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      { type: 'CHARACTER_COUNT', minCount: 2000 },
      { type: 'PLATFORM_RESTRICTED', platforms: ['Reddit', 'Notion', 'Medium'] }
    ],
    contentRequirements: [
      { platform: 'Reddit', minLength: 2000, type: 'CHARACTER_COUNT' },
      { platform: 'Notion', minLength: 2000, type: 'CHARACTER_COUNT' },
      { platform: 'Medium', minLength: 2000, type: 'CHARACTER_COUNT' }
    ],
    platformRestrictions: ['Reddit', 'Notion', 'Medium'],
    canStackWith: ['A', 'C', 'D', 'E', 'F']
  },
  C: {
    id: 'C',
    name: 'Tutorial/Guide',
    description: 'Tutorial/guide on a partner app',
    xpRange: { min: 20, max: 30 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 90, // 3 × 30
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      { type: 'TUTORIAL_CONTENT', requiresPartnerApp: true }
    ],
    contentRequirements: [
      { platform: 'Any', type: 'TUTORIAL_FORMAT' }
    ],
    canStackWith: ['A', 'B', 'D', 'E', 'F']
  },
  D: {
    id: 'D',
    name: 'Protocol Explanation',
    description: 'Detailed explanation of partner protocol',
    xpRange: { min: 50, max: 75 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 225, // 3 × 75
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      { type: 'PROTOCOL_EXPLANATION', requiresPartnerProtocol: true }
    ],
    contentRequirements: [
      { platform: 'Any', type: 'DETAILED_EXPLANATION' }
    ],
    canStackWith: ['A', 'B', 'C', 'E', 'F']
  },
  E: {
    id: 'E',
    name: 'Correction Bounty',
    description: 'Correction bounty submission',
    xpRange: { min: 50, max: 75 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 225, // 3 × 75
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      { type: 'CORRECTION_BOUNTY', requiresCorrection: true }
    ],
    contentRequirements: [
      { platform: 'Any', type: 'CORRECTION_FORMAT' }
    ],
    canStackWith: ['A', 'B', 'C', 'D', 'F']
  },
  F: {
    id: 'F',
    name: 'Strategies',
    description: 'Strategic content about Movement ecosystem',
    xpRange: { min: 50, max: 75 },
    maxCompletionsPerWeek: 3,
    weeklyLimit: 225, // 3 × 75
    validationRules: [
      ...UNIVERSAL_VALIDATION_RULES,
      { type: 'STRATEGY_CONTENT', requiresStrategy: true }
    ],
    contentRequirements: [
      { platform: 'Any', type: 'STRATEGY_FORMAT' }
    ],
    canStackWith: ['A', 'B', 'C', 'D', 'E']
  }
}
```

#### Day 3-4: AI Evaluator Updates
**Files to Update:**
- `src/lib/ai-evaluator.ts`

**Key Changes:**
- Update TASK_XP_CAPS to use variable ranges (20-30, 75-150, 50-75)
- Implement multi-task classification logic (content can qualify for multiple types)
- Rewrite evaluation prompts with specific task definitions and platform requirements
- Add content-specific evaluation criteria for each task type
- Implement quality-based XP scoring within ranges

#### Day 3-4: Multi-Task Classification System
**Files to Create:**
- `src/lib/multi-task-classifier.ts`
- `src/lib/weekly-task-tracker.ts`

**Key Features:**
- Detect when content qualifies for multiple task types
- Calculate combined XP from multiple classifications
- Track weekly completions per task type (max 3 each)
- Handle task stacking bonuses and cross-platform submissions

#### Day 5-6: XP Aggregation System Updates
**Files to Update:**
- `src/lib/xp-aggregator.ts`

**Key Changes:**
- Update WEEKLY_TASK_CAPS: A(90), B(450), C(90), D(225), E(225), F(225)
- Implement 3-completion-per-week tracking system
- Add multi-task XP calculation (sum of all qualifying task types)
- Update capping logic for new completion limits
- Add cross-platform content detection and XP allocation

#### Day 7-8: Content Validation Pipeline
**Files to Create:**
- `src/lib/content-validator.ts`
- `src/lib/platform-validators/reddit-validator.ts`
- `src/lib/platform-validators/notion-validator.ts`
- `src/lib/platform-validators/medium-validator.ts`
- `src/lib/validators/mention-validator.ts`
- `src/lib/validators/hashtag-validator.ts`
- `src/lib/validators/multi-task-validator.ts`

**Implementation:**
- **Universal Validation (ALL submissions)**:
  - @ScholarsOfMove mention detection across all platforms
  - #ScholarsOfMove hashtag detection across all platforms
  - Combined validation (both mention AND hashtag required)
  - Current week publication date validation (Monday-Sunday)
- **Platform-specific validation**:
  - Task B restriction: reddit/notion/medium only
  - Platform-specific content extraction and character counting
  - Cross-platform duplicate detection
- **Multi-task validation**:
  - Detect content qualifying for multiple task types
  - Validate task stacking eligibility
  - Check weekly completion limits per task type
- **Quality validation**:
  - Original content verification
  - Movement ecosystem relevance check
  - Content accessibility verification

**Enhanced Validation Flow:**
```typescript
export interface ValidationResult {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  qualifyingTaskTypes: string[] // Multiple task types this content qualifies for
  metadata: {
    hasMention: boolean
    hasHashtag: boolean
    contentLength: number
    platform: string
    publicationDate: Date
    weekNumber: number
    isOriginal: boolean
    weeklyCompletions: Record<string, number> // Current week completions per task type
  }
}

export async function validateSubmission(
  url: string,
  userId: string
): Promise<ValidationResult> {
  // 1. Universal validation (mention + hashtag + current week)
  // 2. Platform-specific validation and restrictions
  // 3. Multi-task classification
  // 4. Weekly completion limit checking
  // 5. Quality and originality validation
}
```

#### Day 9-10: Testing and Integration
- Unit tests for all new components
- Integration tests for submission flow
- Performance testing for validation pipeline

### Phase 2: Enhanced Validation (Days 11-17)

#### Day 11-12: Platform-Specific Validation
**Implementation:**
- **Twitter/X validation**:
  - Thread detection and tweet counting (5+ for Task A)
  - @ScholarsOfMove mention detection in any tweet of the thread
  - #ScholarsOfMove hashtag detection in any tweet of the thread
  - Character count validation for long-form tweets (Task B)
- **Medium validation**:
  - Article character count (2000+ for Task B)
  - @ScholarsOfMove mention detection in article content
  - #ScholarsOfMove hashtag detection in article tags or content
- **Cross-platform validation**:
  - URL pattern recognition updates
  - Universal mention/hashtag detection algorithms

#### Day 13-14: Advanced Content Validation
**Features:**
- **Enhanced mention/hashtag validation**:
  - Case-insensitive detection
  - Multiple format support (@ScholarsOfMove, @scholarsofmove)
  - Hashtag variations (#ScholarsOfMove, #scholarsofmove)
- **Content quality validation**:
  - Publication date extraction and validation (current week only)
  - Content accessibility verification
  - Platform-specific metadata extraction
- **Validation reporting**:
  - Detailed error messages for missing mention/hashtag
  - Suggestions for fixing validation issues

#### Day 15-16: Duplicate Content Detection
**Algorithm:**
- Content fingerprinting
- URL deduplication
- Similar content detection
- Cross-platform duplicate checking

#### Day 17: Integration Testing and Bug Fixes
- End-to-end testing with new validation
- Performance optimization
- Error handling improvements

### Phase 3: UI/UX and Documentation (Days 18-21)

#### Day 18-19: Frontend Component Updates
**Components to Update:**
- Submission form with task type selection
- Validation feedback UI
- Admin task type management
- User dashboard with new XP ranges

#### Day 20: Task Type Help System
**Features:**
- Interactive task type guide
- XP range calculator
- Content requirement checker
- Validation status indicators

#### Day 21: Final Testing and Deployment
- User acceptance testing
- Performance benchmarking
- Production deployment preparation
- Documentation finalization

## Database Schema Changes

### No Structural Changes Required
The existing schema supports the new system:
- `taskTypes` field is already `string[]` (flexible)
- XP fields remain integers
- Status enums remain unchanged

### New Validation Metadata
Consider adding optional fields for enhanced tracking:
```sql
-- Optional: Add validation metadata
ALTER TABLE "Submission" 
ADD COLUMN "validationMetadata" JSONB,
ADD COLUMN "contentLength" INTEGER,
ADD COLUMN "platformMetadata" JSONB;
```

## API Endpoints and Data Flow

### New/Updated Endpoints

#### Content Validation API
```typescript
POST /api/validate-content
{
  url: string
  platform: string
  taskType: string
}
Response: {
  isValid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
  metadata: {
    hasMention: boolean           // @ScholarsOfMove detected
    hasHashtag: boolean          // #ScholarsOfMove detected
    mentionLocation?: string     // Where mention was found
    hashtagLocation?: string     // Where hashtag was found
    contentLength: number
    platform: string
    taskType: string
    publicationDate?: Date
  }
}

// Validation Error Types
interface ValidationError {
  code: 'MISSING_MENTION' | 'MISSING_HASHTAG' | 'INSUFFICIENT_LENGTH' | 'INVALID_DATE' | 'DUPLICATE_CONTENT'
  message: string
  suggestion?: string
}
```

#### Enhanced Submission Processing
```typescript
POST /api/submissions
// Enhanced with pre-submission validation
// Automatic task type suggestion
// Real-time validation feedback
```

#### Task Type Information API
```typescript
GET /api/task-types
Response: {
  taskTypes: TaskTypeConfig[]
  userWeeklyProgress: WeeklyProgress
}
```

### Data Flow Updates
1. **Enhanced Submission Flow**:
   URL → Content Fetch → **Universal Validation** (@ScholarsOfMove + #ScholarsOfMove) → Platform-Specific Validation → Task Type Classification → AI Evaluation → Peer Review → XP Aggregation

2. **Universal Validation Pipeline**:
   Content → **Mention Detection** → **Hashtag Detection** → **Combined Validation** → Platform Detection → Task-Specific Rules → Result

3. **Validation Result Processing**:
   - **PASS**: Both mention AND hashtag found → Continue to AI evaluation
   - **FAIL**: Missing mention OR hashtag → Reject with specific error message
   - **PARTIAL**: Found one but not both → Provide clear guidance for fixing

4. **Multi-Task XP Calculation Flow**:
   Validated Content → Multi-Task Classification → Individual Task XP Calculation → Combined XP Sum → Weekly Limit Check → Final XP

## Multi-Task Scoring Examples

### Implementation Requirements for Task Stacking

The system must correctly implement these specific scoring scenarios:

#### Case 1: Basic Task Completion
- **Scenario**: Write 3 high-quality threads (Task A only)
- **Calculation**: 3 × 30 XP = 90 XP total
- **Weekly Limit**: 90 XP (3 completions × 30 max XP)

#### Case 2: Thread + Protocol Explanation
- **Scenario**: Write 3 threads explaining partner protocols (Yuzu, Route-X, Tradeport)
- **Calculation**:
  - Task A: 3 × 30 XP = 90 XP
  - Task D: 3 × 75 XP = 225 XP
  - **Total**: 315 XP (90 + 225)
- **Implementation**: Same content qualifies for both Task A and Task D

#### Case 3: Strategy Tweet
- **Scenario**: Tweet explaining revolutionary strategy for using assets in Move
- **Calculation**:
  - Task A: 30 XP (for the tweet)
  - Task F: 75 XP (for the strategy explanation)
  - **Total**: 105 XP
- **Implementation**: Single tweet content qualifies for both tasks

#### Case 4: Cross-Platform Article
- **Scenario**: Write 2000+ character Notion article, then post same content on Twitter
- **Calculation**:
  - Task B: 150 XP (Notion article)
  - Task A: 30 XP (Twitter post of same content)
  - **Total**: 180 XP
- **Implementation**: Same content on different platforms earns separate XP

### Technical Implementation for Multi-Task Scoring

```typescript
export interface MultiTaskResult {
  qualifyingTasks: {
    taskType: string
    xpAwarded: number
    reason: string
  }[]
  totalXp: number
  weeklyLimitsApplied: {
    taskType: string
    originalXp: number
    cappedXp: number
    remainingCapacity: number
  }[]
}

export async function calculateMultiTaskXP(
  content: ContentData,
  userId: string,
  weekNumber: number
): Promise<MultiTaskResult> {
  // 1. Classify content for all applicable task types
  // 2. Calculate XP for each qualifying task type
  // 3. Check weekly completion limits per task type
  // 4. Apply caps and return combined result
}
```

## Frontend Components and User Interface

### New Components

#### TaskTypeSelector Component
```typescript
interface TaskTypeSelectorProps {
  selectedType?: string
  onTypeChange: (type: string) => void
  contentUrl?: string // For auto-suggestion
}
```

#### ValidationFeedback Component
```typescript
interface ValidationFeedbackProps {
  validationResult: ValidationResult
  showDetails?: boolean
}
```

#### TaskTypeHelp Modal
- Interactive guide for each task type
- XP range explanations
- Content requirement examples
- Validation rule descriptions

### Updated Components
- **SubmissionForm**: Add task type selection and validation
- **AdminDashboard**: Task type management interface
- **UserDashboard**: Updated XP display with ranges
- **LeaderboardCard**: Show task type breakdown

## Security and Authentication Requirements

### RBAC Integration
- **USER**: Submit content, view own submissions
- **REVIEWER**: All USER permissions + review submissions
- **ADMIN**: All permissions + task type management, validation overrides

### Security Considerations
- Validation logic server-side only (no client-side bypassing)
- Rate limiting on validation endpoints
- Input sanitization for content analysis
- Audit logging for task type changes
- Admin override capabilities with logging

### Authentication Flow
1. User authentication via Supabase
2. Role-based permission checking
3. Task type validation based on user role
4. Secure content fetching and analysis

## Testing Strategy

### Core Testing Philosophy
Focus on **essential, maintainable tests** that validate critical functionality and can be efficiently executed during regular development workflow. Eliminate redundant, demo, or proof-of-concept tests.

### Mandatory Tests (Must Pass for Deployment)

#### 1. Critical Unit Tests
**Files**: `__tests__/unit/`
- **Content Validation Core** (`content-validator.test.ts`):
  - @ScholarsOfMove mention detection (all platforms)
  - #ScholarsOfMove hashtag detection (all platforms)
  - Combined mention + hashtag validation
  - Platform-specific content extraction
- **XP Calculation** (`xp-calculator.test.ts`):
  - Variable XP range validation
  - Weekly cap enforcement
  - Task type XP limits
- **Task Type Configuration** (`task-types.test.ts`):
  - Task type definition validation
  - XP range consistency checks

**Execution**: `npm run test:unit:critical`
**Runtime**: <30 seconds
**Coverage Target**: 100% for critical paths

#### 2. Essential Integration Tests
**Files**: `__tests__/integration/`
- **Submission Flow** (`submission-flow.test.ts`):
  - Complete submission with mention + hashtag validation
  - XP calculation and aggregation
  - Error handling for missing mention/hashtag
- **Admin Operations** (`admin-operations.test.ts`):
  - Task type management
  - Validation overrides
  - XP adjustments

**Execution**: `npm run test:integration:essential`
**Runtime**: <2 minutes
**Coverage Target**: 90% for integration paths

#### 3. End-to-End Critical Path Tests
**Files**: `__tests__/e2e/`
- **User Submission Journey** (`user-submission.e2e.ts`):
  - Submit content with proper mention + hashtag → XP awarded
  - Submit content without mention/hashtag → Validation error
  - Task type selection and XP calculation
- **Admin Workflow** (`admin-workflow.e2e.ts`):
  - Override validation failures
  - Manage task type configurations

**Execution**: `npm run test:e2e:critical`
**Runtime**: <5 minutes
**Coverage Target**: 100% for critical user journeys

### Optional Tests (Development Convenience)

#### 1. Development Unit Tests
**Purpose**: Fast feedback during development
- Component rendering tests
- Utility function tests
- Mock API response tests

**Execution**: `npm run test:dev`
**When to Run**: During active development only

#### 2. Performance Validation Tests
**Purpose**: Ensure system performance standards
- Content validation response time (<2s)
- AI evaluation performance (<10s)
- Database query optimization

**Execution**: `npm run test:performance`
**When to Run**: Before major releases only

### Test Execution Guidelines

#### Daily Development Workflow
```bash
# Before committing code
npm run test:unit:critical     # 30 seconds
npm run test:integration:essential  # 2 minutes
# Total: <3 minutes
```

#### Pre-Deployment Workflow
```bash
# Full test suite before production deployment
npm run test:critical          # Runs all mandatory tests
npm run test:e2e:critical      # Critical user journeys
npm run test:performance       # Performance validation
# Total: <10 minutes
```

#### Continuous Integration
- **Pull Request**: Mandatory tests only
- **Main Branch**: Full test suite including optional tests
- **Production Deploy**: All tests + manual validation checklist

### Test Maintenance Guidelines

#### What to Keep
- Tests that validate core business logic
- Tests that prevent regression in critical features
- Tests that validate security requirements (mention/hashtag validation)
- Tests that ensure data integrity

#### What to Remove/Avoid
- Demo tests and proof-of-concept code
- Redundant tests that cover the same functionality
- Tests for temporary or experimental features
- Tests that require complex setup without meaningful validation
- UI tests for cosmetic changes

#### Test Quality Standards
- **Fast**: Unit tests <1s, Integration tests <30s each
- **Reliable**: No flaky tests, deterministic results
- **Maintainable**: Clear test names, minimal setup, focused assertions
- **Valuable**: Each test validates specific, important functionality

### Validation Checklist (Manual)
For features that are difficult to automate:
- [ ] @ScholarsOfMove mention detection works across all supported platforms
- [ ] #ScholarsOfMove hashtag detection works across all supported platforms
- [ ] Error messages are clear and actionable for users
- [ ] Admin override functionality works correctly
- [ ] XP calculations are accurate for all task types
- [ ] System performance meets requirements (<2s validation, <10s AI evaluation)

## Deployment Considerations

### Migration Strategy
1. **Backward Compatibility**: Support both old and new systems during transition
2. **Feature Flags**: Gradual rollout with ability to rollback
3. **Data Migration**: Update existing submissions with new task type logic
4. **Cache Invalidation**: Clear cached XP calculations and task type data

### Production Deployment Steps
1. Database migration scripts (if needed)
2. Environment variable updates
3. AI model prompt deployment
4. Frontend asset deployment
5. Cache warming and validation
6. Monitoring and alerting setup

### Rollback Plan
- Feature flag to disable new system
- Database rollback scripts
- Previous AI prompts restoration
- Frontend rollback deployment
- User communication plan

## Timeline and Resource Estimates

### Development Timeline (21 days)
- **Week 1 (Days 1-7)**: Core system updates and basic validation
- **Week 2 (Days 8-14)**: Enhanced validation and testing
- **Week 3 (Days 15-21)**: UI/UX updates and deployment

### Resource Requirements
- **Senior Full-Stack Developer**: 21 days (lead implementation)
- **Frontend Developer**: 10 days (UI/UX components)
- **QA Engineer**: 7 days (testing and validation)
- **DevOps Engineer**: 3 days (deployment and monitoring)

### Dependencies
- OpenAI API access for prompt updates
- Supabase database access for migrations
- Design system components for UI updates
- Content fetching API integrations

## Risk Management

### High-Risk Areas
1. **XP Calculation Changes**: Could affect user experience and fairness
   - *Mitigation*: Extensive testing, gradual rollout, rollback plan
2. **AI Evaluator Updates**: New prompts might behave unexpectedly
   - *Mitigation*: A/B testing, prompt validation, human oversight
3. **Performance Impact**: New validation could slow submissions
   - *Mitigation*: Async processing, caching, performance monitoring

### Medium-Risk Areas
1. **User Adoption**: Users might not understand new system
   - *Mitigation*: Clear documentation, help system, user communication
2. **Content Validation Accuracy**: False positives/negatives
   - *Mitigation*: Admin override system, continuous improvement

### Low-Risk Areas
1. **Frontend Changes**: Mostly cosmetic updates
2. **Database Schema**: No structural changes required

## Success Metrics and Monitoring

### Key Performance Indicators
1. **Universal Validation Accuracy**: >99% correct mention/hashtag detection
2. **Content Validation Accuracy**: >95% correct task type classifications
3. **User Compliance**: >90% submissions include required mention + hashtag
4. **System Performance**: <2s validation response time
5. **Error Rate**: <1% false positives/negatives for mention/hashtag detection
6. **User Adoption**: >80% users successfully submit with new requirements within 1 week

### Monitoring Requirements
- **Validation Metrics**:
  - @ScholarsOfMove mention detection rate
  - #ScholarsOfMove hashtag detection rate
  - Combined validation success rate
  - Platform-specific validation accuracy
- **Performance Metrics**:
  - Real-time validation response times
  - AI evaluation response times and accuracy
  - XP calculation correctness alerts
- **User Experience Metrics**:
  - Validation error rates by type
  - User retry rates after validation failures
  - Support ticket volume related to validation issues

### Alerting Thresholds
- Validation response time >5s
- Error rate >2%
- AI evaluation failures >5%
- Database query timeouts
- User complaint volume increases

## Documentation Plan

### Technical Documentation
- API endpoint documentation updates
- Database schema changes
- Deployment procedures
- Troubleshooting guides
- Code architecture documentation

### User Documentation
- **Universal Requirements Guide**:
  - How to include @ScholarsOfMove mention in submissions
  - How to include #ScholarsOfMove hashtag in submissions
  - Platform-specific examples (Twitter threads, Medium articles)
- **Task Type Selection Guide**:
  - Updated task type descriptions with new XP ranges
  - Content requirement examples for each task type
- **Validation Error Solutions**:
  - "Missing @ScholarsOfMove mention" - How to fix
  - "Missing #ScholarsOfMove hashtag" - How to fix
  - Platform-specific troubleshooting guides
- **FAQ Updates**:
  - Why are mention and hashtag required?
  - What if I forget to include them?
  - Can I edit my submission to add them?

### Admin Documentation
- Task type management procedures
- Override capabilities guide
- Monitoring and alerting setup
- User support procedures
- System maintenance tasks

## Conclusion

This implementation plan provides a comprehensive roadmap for enhancing the Scholars_XP task type system. The phased approach ensures minimal disruption while delivering significant improvements to content classification, validation, and user experience. The plan addresses all technical, security, and operational requirements while maintaining the existing RBAC system and production-ready architecture.

**Next Steps:**
1. Review and approve implementation plan
2. Set up development environment and feature flags
3. Begin Phase 1 implementation
4. Establish monitoring and testing procedures
5. Prepare user communication and documentation

**Success Criteria:**
- All task types correctly implemented with proper XP ranges and weekly limits
- Multi-task classification working correctly (content can earn multiple task XP)
- Weekly completion tracking accurate (max 3 per task type)
- Platform restrictions enforced (Task B limited to reddit/notion/medium)
- Universal validation (mention + hashtag) accuracy >99%
- Content validation accuracy >95% for task-specific requirements
- User compliance >90% with new mention/hashtag requirements
- User adoption >80% within 1 week of deployment
- System performance maintained or improved (<2s validation response time)
- Zero critical bugs in production deployment
- Clear, actionable error messages for validation failures
- Task stacking examples working correctly (thread + protocol explanation = 105 XP)
