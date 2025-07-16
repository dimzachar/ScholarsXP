# Scholars_XP System Architecture Documentation

## Table of Contents
1. [System Overview](#system-overview)
2. [High-Level Architecture](#high-level-architecture)
3. [Authentication & Authorization](#authentication--authorization)
4. [User Management System](#user-management-system)
5. [Database Schema](#database-schema)
6. [API Architecture](#api-architecture)
7. [Security Considerations](#security-considerations)
8. [Technology Stack](#technology-stack)
9. [Component Architecture](#component-architecture)
10. [Data Flow](#data-flow)

## System Overview

Scholars_XP is a comprehensive XP evaluation system built with Next.js 15, Supabase, and PostgreSQL. The system enables users to submit content for AI evaluation and peer review, implementing a sophisticated role-based access control system with three distinct user roles: USER, REVIEWER, and ADMIN.

### Key Features
- **Content Submission & Evaluation**: Users submit content from platforms like Twitter/X and Medium
- **AI-Powered Assessment**: OpenAI GPT-4 evaluates content and assigns XP scores
- **Peer Review System**: Community-driven review process for quality assurance
- **Gamification**: XP tracking, streaks, leaderboards, and weekly caps
- **Admin Management**: Comprehensive administrative oversight and system operations

## High-Level Architecture

```mermaid
graph TB
    subgraph "Client Layer"
        WEB[Web Browser]
        MOBILE[Mobile Browser]
    end
    
    subgraph "Application Layer"
        NEXTJS[Next.js 15 App Router]
        MIDDLEWARE[Authentication Middleware]
        API[API Routes]
        SSR[Server-Side Rendering]
    end
    
    subgraph "Authentication Layer"
        SUPABASE_AUTH[Supabase Auth]
        JWT[JWT Tokens]
        RLS[Row Level Security]
    end
    
    subgraph "Business Logic Layer"
        AI_EVAL[AI Evaluator]
        XP_AGG[XP Aggregator]
        PEER_REV[Peer Review Engine]
        WEEKLY_MGR[Weekly Manager]
        NOTIF[Notification System]
    end
    
    subgraph "Data Layer"
        SUPABASE_DB[(Supabase PostgreSQL)]
        PRISMA[Prisma ORM]
    end
    
    subgraph "External Services"
        OPENAI[OpenAI GPT-4]
        CONTENT_APIS[Content Platform APIs]
    end
    
    WEB --> NEXTJS
    MOBILE --> NEXTJS
    NEXTJS --> MIDDLEWARE
    MIDDLEWARE --> SUPABASE_AUTH
    SUPABASE_AUTH --> JWT
    JWT --> RLS
    NEXTJS --> API
    API --> AI_EVAL
    API --> XP_AGG
    API --> PEER_REV
    API --> WEEKLY_MGR
    API --> NOTIF
    AI_EVAL --> OPENAI
    AI_EVAL --> CONTENT_APIS
    PRISMA --> SUPABASE_DB
    RLS --> SUPABASE_DB
    
    style NEXTJS fill:#0070f3
    style SUPABASE_AUTH fill:#3ecf8e
    style SUPABASE_DB fill:#3ecf8e
    style OPENAI fill:#10a37f
```

## Authentication & Authorization

### Role-Based Access Control (RBAC) Implementation

The system implements a three-tier role hierarchy with granular permissions:

```mermaid
graph TD
    subgraph "Role Hierarchy"
        ADMIN[ADMIN - Level 3]
        REVIEWER[REVIEWER - Level 2]
        USER[USER - Level 1]
    end
    
    subgraph "Permissions"
        SUBMIT[submit_content]
        REVIEW[review_content]
        ADMIN_ACCESS[admin_access]
        MANAGE_USERS[manage_users]
        VIEW_ANALYTICS[view_analytics]
        VIEW_LEADERBOARD[view_leaderboard]
        VIEW_OWN_SUBS[view_own_submissions]
        VIEW_REVIEW_DASH[view_review_dashboard]
        VIEW_ADMIN_DASH[view_admin_dashboard]
        MANAGE_SUBS[manage_submissions]
        SYSTEM_OPS[system_operations]
    end
    
    USER --> SUBMIT
    USER --> VIEW_LEADERBOARD
    USER --> VIEW_OWN_SUBS
    
    REVIEWER --> SUBMIT
    REVIEWER --> REVIEW
    REVIEWER --> VIEW_LEADERBOARD
    REVIEWER --> VIEW_OWN_SUBS
    REVIEWER --> VIEW_REVIEW_DASH
    
    ADMIN --> SUBMIT
    ADMIN --> REVIEW
    ADMIN --> ADMIN_ACCESS
    ADMIN --> MANAGE_USERS
    ADMIN --> VIEW_ANALYTICS
    ADMIN --> VIEW_LEADERBOARD
    ADMIN --> VIEW_OWN_SUBS
    ADMIN --> VIEW_REVIEW_DASH
    ADMIN --> VIEW_ADMIN_DASH
    ADMIN --> MANAGE_SUBS
    ADMIN --> SYSTEM_OPS
    
    style ADMIN fill:#ff6b6b
    style REVIEWER fill:#4ecdc4
    style USER fill:#45b7d1
```

### Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant M as Middleware
    participant SA as Supabase Auth
    participant DB as Database
    participant API as API Route
    
    U->>C: Access Protected Route
    C->>M: Request with Cookies
    M->>SA: Validate JWT Token
    SA->>M: Return Auth User
    M->>DB: Fetch User Profile & Role
    DB->>M: Return User Profile
    M->>M: Check Route Permissions
    alt Authorized
        M->>API: Forward Request with User Context
        API->>C: Return Response
        C->>U: Display Content
    else Unauthorized
        M->>C: Redirect to Login
        C->>U: Show Login Page
    end
```

### Permission Matrix

| Role | Submit Content | Review Content | Admin Access | Manage Users | View Analytics |
|------|----------------|----------------|--------------|--------------|----------------|
| USER | ✅ | ❌ | ❌ | ❌ | ❌ |
| REVIEWER | ✅ | ✅ | ❌ | ❌ | ❌ |
| ADMIN | ✅ | ✅ | ✅ | ✅ | ✅ |

## User Management System

### User Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Registration
    Registration --> EmailVerification
    EmailVerification --> ProfileCreation
    ProfileCreation --> ActiveUser
    ActiveUser --> RoleUpgrade: Admin Action
    RoleUpgrade --> ActiveUser
    ActiveUser --> Suspended: Violation
    Suspended --> ActiveUser: Appeal Approved
    ActiveUser --> Deactivated: User Request
    Deactivated --> [*]
    
    note right of ProfileCreation
        Default Role: USER
        Initial XP: 0
        Streak: 0
    end note
    
    note right of RoleUpgrade
        USER → REVIEWER
        REVIEWER → ADMIN
        (Admin only)
    end note
```

### User Profile Management

The system maintains comprehensive user profiles with the following attributes:

- **Identity**: ID (UUID), email, username
- **Role**: USER, REVIEWER, or ADMIN
- **XP Tracking**: Total XP, current week XP, streak weeks
- **Performance**: Missed reviews count
- **Timestamps**: Created at, updated at

## Database Schema

### Entity Relationship Diagram

```mermaid
erDiagram
    User {
        uuid id PK
        string email UK
        string username
        enum role
        int totalXp
        int currentWeekXp
        int streakWeeks
        int missedReviews
        timestamp createdAt
        timestamp updatedAt
    }
    
    Submission {
        uuid id PK
        uuid userId FK
        string url
        string platform
        string[] taskTypes
        int aiXp
        float originalityScore
        int peerXp
        int finalXp
        enum status
        int weekNumber
        timestamp createdAt
        timestamp updatedAt
    }
    
    PeerReview {
        uuid id PK
        uuid submissionId FK
        uuid reviewerId FK
        int xpScore
        string comments
        timestamp createdAt
        timestamp updatedAt
    }
    
    WeeklyStats {
        uuid id PK
        uuid userId FK
        int weekNumber
        int xpTotal
        int reviewsDone
        int reviewsMissed
        boolean earnedStreak
        timestamp createdAt
        timestamp updatedAt
    }
    
    User ||--o{ Submission : creates
    User ||--o{ PeerReview : performs
    User ||--o{ WeeklyStats : has
    Submission ||--o{ PeerReview : receives
```

### Key Database Constraints

- **User.email**: Unique constraint for authentication
- **WeeklyStats**: Unique constraint on (userId, weekNumber)
- **Submission.status**: Enum values (PENDING, AI_REVIEWED, UNDER_PEER_REVIEW, FINALIZED, FLAGGED, REJECTED)
- **User.role**: Enum values (USER, REVIEWER, ADMIN)

## API Architecture

### REST API Endpoints Structure

```mermaid
graph LR
    subgraph "Public APIs"
        AUTH[/api/auth/*]
        TEST[/api/test-supabase]
        DEBUG[/api/debug-user]
    end
    
    subgraph "User APIs"
        SUBMISSIONS[/api/submissions]
        EVALUATE[/api/evaluate]
        PROFILE[/api/user/profile]
        LEADERBOARD[/api/leaderboard]
        NOTIFICATIONS[/api/notifications]
    end
    
    subgraph "Reviewer APIs"
        PEER_REVIEWS[/api/peer-reviews]
        PENDING[/api/peer-reviews/pending]
    end
    
    subgraph "Admin APIs"
        ADMIN_STATS[/api/admin/stats]
        ADMIN_SUBS[/api/admin/submissions]
        AGGREGATE_XP[/api/aggregate-xp]
        WEEKLY[/api/weekly]
    end
    
    style AUTH fill:#95a5a6
    style SUBMISSIONS fill:#45b7d1
    style PEER_REVIEWS fill:#4ecdc4
    style ADMIN_STATS fill:#ff6b6b
```

### API Authentication Middleware

The system uses a sophisticated middleware pattern for API route protection:

```mermaid
graph TD
    REQUEST[Incoming Request] --> AUTH_CHECK{Authentication Check}
    AUTH_CHECK -->|Valid JWT| ROLE_CHECK{Role/Permission Check}
    AUTH_CHECK -->|Invalid JWT| UNAUTHORIZED[401 Unauthorized]

    ROLE_CHECK -->|Has Permission| RATE_LIMIT{Rate Limit Check}
    ROLE_CHECK -->|No Permission| FORBIDDEN[403 Forbidden]

    RATE_LIMIT -->|Within Limits| HANDLER[Execute Handler]
    RATE_LIMIT -->|Exceeded| TOO_MANY[429 Too Many Requests]

    HANDLER --> RESPONSE[Return Response]

    style AUTH_CHECK fill:#3ecf8e
    style ROLE_CHECK fill:#4ecdc4
    style RATE_LIMIT fill:#f39c12
```

### API Endpoint Categories

#### 1. Content Management APIs

- **POST /api/submissions**: Submit new content for evaluation
- **GET /api/submissions**: List submissions (filtered by user role)
- **POST /api/evaluate**: Trigger AI evaluation of submitted content

#### 2. Peer Review APIs

- **GET /api/peer-reviews/pending**: Get pending reviews for reviewer
- **POST /api/peer-reviews**: Submit peer review with XP score and comments

#### 3. System Operation APIs

- **POST /api/aggregate-xp**: Process XP aggregation (Admin only)
- **POST /api/weekly**: Trigger weekly operations (Admin only)
- **GET /api/leaderboard**: Retrieve leaderboard data

#### 4. Administrative APIs

- **GET /api/admin/stats**: System statistics and metrics
- **GET /api/admin/submissions**: Manage all submissions
- **PATCH /api/admin/submissions**: Update submission status

## Security Considerations

### Row Level Security (RLS) Implementation

The system leverages Supabase's Row Level Security for database-level access control:

```sql
-- Example RLS Policy for User table
CREATE POLICY "Users can view own profile" ON "User"
    FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON "User"
    FOR UPDATE USING (auth.uid() = id);

-- Example RLS Policy for Submissions
CREATE POLICY "Users can view own submissions" ON "Submission"
    FOR SELECT USING (auth.uid() = "userId");

CREATE POLICY "Reviewers can view all submissions" ON "Submission"
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "User"
            WHERE id = auth.uid()
            AND role IN ('REVIEWER', 'ADMIN')
        )
    );
```

### Security Measures

#### 1. Input Validation & Sanitization

- URL format validation for content submissions
- XP score bounds checking (0-100 range)
- Content length limits and hashtag requirements
- SQL injection prevention through Prisma ORM

#### 2. Rate Limiting Configuration

```typescript
// Rate limits by endpoint type
const RATE_LIMITS = {
  submissions: { requests: 10, window: 60000 }, // 10 per minute
  reviews: { requests: 20, window: 60000 },     // 20 per minute
  admin: { requests: 100, window: 60000 },      // 100 per minute
  general: { requests: 60, window: 60000 }      // 60 per minute
}
```

#### 3. Security Headers (Production)

- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- X-XSS-Protection: 1; mode=block
- Referrer-Policy: strict-origin-when-cross-origin
- Content Security Policy (CSP)

#### 4. Authentication Security

- JWT token validation on every request
- Automatic token refresh handling
- Session persistence with secure cookies
- PKCE flow for OAuth authentication

## Technology Stack

### Core Technologies

```mermaid
graph TB
    subgraph "Frontend Stack"
        NEXTJS_FE[Next.js 15 App Router]
        REACT[React 18]
        TYPESCRIPT[TypeScript]
        TAILWIND[Tailwind CSS]
        SHADCN[shadcn/ui Components]
    end

    subgraph "Backend Stack"
        NEXTJS_BE[Next.js API Routes]
        PRISMA[Prisma ORM]
        SUPABASE[Supabase Platform]
        POSTGRESQL[PostgreSQL Database]
    end

    subgraph "Authentication"
        SUPABASE_AUTH[Supabase Auth]
        JWT_TOKENS[JWT Tokens]
        OAUTH[OAuth Providers]
    end

    subgraph "External Services"
        OPENAI_API[OpenAI GPT-4]
        CONTENT_PLATFORMS[Content Platform APIs]
    end

    subgraph "Development Tools"
        ESLINT[ESLint]
        PRETTIER[Prettier]
        HUSKY[Husky Git Hooks]
    end

    NEXTJS_FE --> REACT
    NEXTJS_FE --> TYPESCRIPT
    NEXTJS_FE --> TAILWIND
    NEXTJS_FE --> SHADCN

    NEXTJS_BE --> PRISMA
    PRISMA --> POSTGRESQL
    SUPABASE --> POSTGRESQL
    SUPABASE --> SUPABASE_AUTH

    style NEXTJS_FE fill:#0070f3
    style SUPABASE fill:#3ecf8e
    style OPENAI_API fill:#10a37f
```

### Key Dependencies

| Category | Technology | Version | Purpose |
|----------|------------|---------|---------|
| Framework | Next.js | 15.x | Full-stack React framework |
| Database | PostgreSQL | Latest | Primary database |
| ORM | Prisma | Latest | Database access layer |
| Auth | Supabase Auth | Latest | Authentication & authorization |
| AI | OpenAI API | Latest | Content evaluation |
| UI | shadcn/ui | Latest | Component library |
| Styling | Tailwind CSS | Latest | Utility-first CSS |
| Language | TypeScript | Latest | Type safety |

## Component Architecture

### Frontend Component Hierarchy

```mermaid
graph TD
    ROOT[RootLayout] --> THEME[ThemeProvider]
    THEME --> AUTH_ERROR[AuthErrorBoundary]
    AUTH_ERROR --> AUTH_PROVIDER[AuthProvider]
    AUTH_PROVIDER --> CONDITIONAL[ConditionalLayout]

    CONDITIONAL --> LANDING[LandingPage]
    CONDITIONAL --> MAIN_LAYOUT[MainLayout]

    MAIN_LAYOUT --> NAV[Navigation]
    MAIN_LAYOUT --> CONTENT[Page Content]
    MAIN_LAYOUT --> NOTIF[NotificationCenter]

    CONTENT --> DASHBOARD[Dashboard]
    CONTENT --> ADMIN[Admin Panel]
    CONTENT --> REVIEW[Review Dashboard]
    CONTENT --> LEADERBOARD[Leaderboard]

    DASHBOARD --> SUBMISSION_FORM[SubmissionForm]
    DASHBOARD --> USER_STATS[UserStats]

    REVIEW --> PEER_REVIEW_CARD[PeerReviewCard]

    ADMIN --> ADMIN_STATS[AdminStats]
    ADMIN --> SUBMISSION_MGMT[SubmissionManagement]

    style ROOT fill:#0070f3
    style AUTH_PROVIDER fill:#3ecf8e
    style CONDITIONAL fill:#4ecdc4
```

### Key Components

#### 1. Authentication Components

- **AuthProvider**: Global authentication state management
- **AuthErrorBoundary**: Error handling for auth failures
- **ConditionalLayout**: Route-based layout switching

#### 2. Core UI Components

- **Navigation**: Role-based navigation menu
- **SubmissionForm**: Content submission interface
- **PeerReviewCard**: Review assignment interface
- **NotificationCenter**: Real-time notification system

#### 3. Admin Components

- **AdminPanel**: System management interface
- **AdminStats**: System metrics dashboard
- **SubmissionManagement**: Content moderation tools

## Data Flow

### Content Submission & Evaluation Flow

```mermaid
sequenceDiagram
    participant U as User
    participant UI as Frontend
    participant API as API Layer
    participant AI as AI Evaluator
    participant DB as Database
    participant EXT as External APIs

    U->>UI: Submit Content URL
    UI->>API: POST /api/submissions
    API->>DB: Create Submission Record
    DB->>API: Return Submission ID
    API->>UI: Return Success

    U->>UI: Trigger Evaluation
    UI->>API: POST /api/evaluate
    API->>EXT: Fetch Content from URL
    EXT->>API: Return Content Data
    API->>AI: Evaluate Content
    AI->>API: Return AI Analysis
    API->>DB: Update Submission with AI XP
    DB->>API: Confirm Update
    API->>UI: Return Evaluation Results
    UI->>U: Display XP Score
```

### Peer Review Assignment Flow

```mermaid
sequenceDiagram
    participant R as Reviewer
    participant UI as Frontend
    participant API as API Layer
    participant DB as Database
    participant N as Notification System

    R->>UI: Access Review Dashboard
    UI->>API: GET /api/peer-reviews/pending
    API->>DB: Query Available Reviews
    DB->>API: Return Pending Submissions
    API->>UI: Return Review List
    UI->>R: Display Available Reviews

    R->>UI: Submit Review
    UI->>API: POST /api/peer-reviews
    API->>DB: Store Peer Review
    API->>DB: Update Submission Status
    DB->>API: Confirm Updates
    API->>N: Trigger Notification
    N->>DB: Log Notification
    API->>UI: Return Success
    UI->>R: Show Confirmation
```

### Weekly Operations Flow

```mermaid
sequenceDiagram
    participant CRON as Cron Job
    participant API as API Layer
    participant WM as Weekly Manager
    participant XP as XP Aggregator
    participant DB as Database
    participant N as Notification System

    CRON->>API: POST /api/weekly (reset)
    API->>WM: Process Weekly Reset
    WM->>XP: Aggregate Final XP
    XP->>DB: Update User XP Totals
    WM->>DB: Calculate Streaks
    WM->>DB: Apply Penalties
    WM->>DB: Reset Weekly Counters
    WM->>N: Send Weekly Notifications
    N->>DB: Log Notifications
    WM->>API: Return Reset Summary
    API->>CRON: Return Success
```

---

## Conclusion

The Scholars_XP system represents a sophisticated, production-ready application built on modern web technologies. Its architecture emphasizes security, scalability, and maintainability through:

- **Robust Authentication**: Multi-layered security with Supabase Auth and RLS
- **Role-Based Access Control**: Granular permissions system
- **Scalable Database Design**: Normalized schema with proper constraints
- **API-First Architecture**: RESTful endpoints with comprehensive middleware
- **Modern Frontend**: React-based UI with TypeScript and component libraries
- **AI Integration**: Seamless OpenAI integration for content evaluation

This architecture supports the system's core mission of providing a fair, transparent, and engaging platform for content evaluation and peer review while maintaining the highest standards of security and user experience.
