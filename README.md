# Scholars_XP - Gamified Content Evaluation Platform

[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/dimzachar/ScholarsXP)

**Scholars_XP** is a comprehensive gamified content evaluation platform built with Next.js 15, Supabase, and PostgreSQL. The system enables users to submit content from various platforms (Twitter/X, Medium, Reddit, Notion) for peer review, implementing a sophisticated role-based access control system with three distinct user roles: USER, REVIEWER, and ADMIN.

## 🎯 Project Overview

Scholars_XP transforms content evaluation into an engaging, gamified experience where users earn XP (Experience Points) for submitting quality content and participating in peer reviews. The platform uses community-driven validation to ensure fair and accurate scoring.

### Key Features

- **🚀 Content Submission & Evaluation**: Multi-platform content submission with peer-based assessment
- **👥 Peer Review System**: Community-driven review process with reviewer incentives and quality assurance
- **🤖 AI-Powered Assessment** *(Future Feature)*: LLM evaluation is currently disabled; peer reviewers determine all XP scores
- **⚖️ Community Voting (Judgment)**: On-chain voting system for resolving divergent peer review scores using Movement Network
- **💼 Wallet Integration**: Multi-wallet support (Privy embedded + external wallets like Nightly) with gasless transactions via Shinami
- **🎮 Gamification**: XP tracking, weekly streaks, leaderboards, and role progression
- **🛡️ Admin Management**: Comprehensive administrative oversight with user management and system operations
- **📱 Real-time Notifications**: Supabase Realtime integration for instant updates without page reloads
- **🔐 Role-Based Access Control**: Three-tier permission system (USER, REVIEWER, ADMIN)
- **📊 Analytics & Insights**: Detailed XP breakdowns, weekly trends, and performance analytics

## 🛠️ Technology Stack

| Component | Technology | Version |
|-----------|------------|---------|
| **Frontend** | Next.js (App Router) | 15.3.5 |
| **Backend** | Next.js API Routes | 15.3.5 |
| **Database** | PostgreSQL via Supabase | Latest |
| **ORM** | Prisma | 6.11.1 |
| **Authentication** | Supabase Auth | 2.50.5 |
| **Real-time** | Supabase Realtime | 2.50.5 |
| **AI Evaluation** | OpenRouter (GPT-4) | Latest (disabled) |
| **Styling** | Tailwind CSS + shadcn/ui | Latest |
| **Deployment** | Vercel (Serverless) | Latest |
| **Background Jobs** | Supabase pg_cron | Latest |
| **Blockchain** | Movement Network (Aptos-based) | Testnet |
| **Wallet Auth** | Privy | Latest |
| **Gas Sponsorship** | Shinami Gas Station | Latest |

## 📋 Prerequisites

Before setting up Scholars_XP, ensure you have:

- **Node.js**: Version 18.0 or higher
- **npm/pnpm**: Latest version (project uses pnpm)
- **Supabase Account**: For database and authentication
- **OpenRouter API Key**: For AI content evaluation (optional - currently disabled)
- **Vercel Account**: For production deployment (optional)

## 🚀 Installation Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd Scholars_XP
pnpm install
```

### 2. Environment Variable Configuration

Create a `.env` file in the project root with the following variables:

```env
# Database Configuration
DATABASE_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres"
DIRECT_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT-ID].supabase.co:5432/postgres"

# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL="https://[PROJECT-ID].supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="[ANON-KEY]"
SUPABASE_SERVICE_ROLE_KEY="[SERVICE-ROLE-KEY]"

# AI Evaluation - OpenRouter (currently disabled)
OPENROUTER_API_KEY="your_openrouter_api_key_here"

# Privy Authentication (Wallet Integration)
NEXT_PUBLIC_PRIVY_APP_ID="your_privy_app_id"
PRIVY_APP_SECRET="your_privy_app_secret"

# Movement Network & Shinami Gas Station
SHINAMI_GAS_STATION_KEY="your_shinami_gas_station_key"
NEXT_PUBLIC_VOTE_CONTRACT="0x..."  # Set after deploying vote.move contract
NEXT_PUBLIC_MOVEMENT_RPC_URL="https://testnet.movementnetwork.xyz/v1"

# Feature Flags
ENABLE_AI_EVALUATION=false          # AI evaluation currently disabled
DISABLE_CONTENT_FETCH=true          # Content fetching disabled (peer-only mode)
NEXT_PUBLIC_AI_DISABLED=true        # UI reflects AI is disabled
ENABLE_LEGACY_DUPLICATE_CHECK=true
AI_EVALUATION_TIMEOUT=120000
ROLE_PROMOTION_BATCH_SIZE=100


```

### 3. Database Setup and Migration

```bash
# Generate Prisma client
npx prisma generate

# Run database migrations (if using local Prisma)
npx prisma migrate dev

# For Supabase: Run migrations in Supabase dashboard
# Go to SQL Editor and execute the migration files in supabase/migrations/
```

### 4. Development Server Startup

```bash
# Start development server on port 3002
pnpm dev

# Alternative: Use npm
npm run dev
```

Visit `http://localhost:3002` to access the application.

### 5. Initial Setup Verification

1. **Database Connection**: Verify Supabase connection in the dashboard
2. **Authentication**: Test user registration and login
3. **Peer Review Flow**: Submit test content and verify reviewer assignment
4. **Real-time Features**: Check notifications and live updates

## 🚀 Production Deployment

### Vercel Deployment (Recommended)

1. **Connect Repository**:
   - Import your GitHub repository to Vercel
   - Vercel will automatically detect Next.js configuration

2. **Environment Variables**:
   - Add all environment variables from your `.env` file to Vercel dashboard
   - Ensure Supabase URLs and keys are correctly configured

3. **Deploy**:
   ```bash
   # Using Vercel CLI
   npm i -g vercel
   vercel --prod
   ```

4. **Post-Deployment**:
   - Verify database connections
   - Test authentication flows
   - Monitor application logs

### Supabase Configuration

1. **Database Setup**:
   - Create new Supabase project
   - Run migrations in SQL Editor
   - Configure Row Level Security (RLS) policies

2. **Authentication**:
   - Enable email authentication
   - Configure OAuth providers (optional)
   - Set up custom SMTP (production)

3. **Real-time Features**:
   - Enable Realtime for notifications table
   - Configure proper database triggers

## 📖 Usage Guide

### For Users (USER Role)

1. **Content Submission**:
   - Navigate to Submit tab in dashboard
   - Paste Twitter/X, Medium, Reddit, or Notion URL
   - Task type is auto-assigned based on platform (A for Twitter, B for others)
   - Submit for peer review

2. **Track Progress**:
   - Monitor XP earnings in Overview tab
   - View submission history and status
   - Check weekly progress toward goals

3. **Streaks & Leaderboards**:
   - Earn streaks for consistent weekly activity
   - Compete on leaderboards

### For Reviewers (REVIEWER Role)

1. **Review Assignments**:
   - Access pending reviews in dashboard
   - Evaluate content quality and assign XP
   - Provide constructive feedback

2. **Earn Review XP**:
   - +50 XP base per completed review (+5 XP timeliness bonus)
   - Bonus XP for high-quality reviews
   - Penalties for missed deadlines

### For Administrators (ADMIN Role)

1. **User Management**:
   - Promote users to reviewer status
   - Manually adjust XP scores
   - Handle user disputes

2. **Content Moderation**:
   - Review flagged submissions
   - Manage duplicate content
   - Override peer review scores when needed

3. **System Operations**:
   - Trigger weekly operations
   - Monitor system health
   - Access detailed analytics

## ⚖️ Community Voting System (Judgment)

When peer reviewers assign significantly different XP scores to a submission (standard deviation > 50), the case becomes eligible for community voting. This decentralized dispute resolution mechanism allows the broader community to determine the correct XP value.

### How It Works

1. **Divergent Detection**: System identifies finalized submissions with high score variance
2. **Case Presentation**: Users see the submission content, reviewer scores, and analysis
3. **On-Chain Voting**: Votes are recorded on Movement Network (Aptos-based blockchain)
4. **Consensus Resolution**: When 50+ votes reach >50% agreement, the winning score is applied
5. **Reviewer Feedback**: Reviews matching the consensus are marked VALIDATED; others INVALIDATED

### Technical Implementation

- **Blockchain**: Movement Network Testnet (Aptos SDK)
- **Gas Sponsorship**: Shinami Gas Station covers transaction fees for users
- **Wallet Support**: Privy embedded wallets + external wallets (Nightly, etc.)
- **Vote Contract**: Optional Move smart contract for on-chain vote recording

### Consensus Parameters

| Parameter | Value | Description |
|-----------|-------|-------------|
| MIN_VOTES_FOR_CONSENSUS | 50 | Minimum votes before consensus can be reached |
| CONSENSUS_THRESHOLD | 50% | Percentage required for winning option |
| DIVERGENCE_THRESHOLD | 50 | Minimum std dev to qualify for voting |

## 🎯 XP System & Task Types

### Task Classification System

The platform currently supports 2 active task types (legacy types C-F are deprecated):

| Task Type | Description | Platforms | XP Range by Category |
|-----------|-------------|-----------|----------------------|
| **Task A** | Twitter/X thread (5+ tweets) OR Twitter Article | Twitter, X | Strategy: 50-150, Guide: 30-130, Technical: 40-140 |
| **Task B** | Platform Article (2000+ characters) | Medium, Reddit, Notion | Strategy: 80-250, Guide: 60-230, Technical: 70-240 |

### Quality Tiers

Peer reviewers assign XP based on content quality tier:
- **Basic**: Lower end of XP range
- **Average**: Mid-range XP
- **Awesome**: Maximum XP for the category

### Content Categories

- **Strategy**: Strategic analysis and insights
- **Guide**: How-to guides and tutorials
- **Technical**: Technical explanations and deep dives

### Scoring & Evaluation Process

1. **Content Submission**: User submits URL (task type auto-assigned by platform)
2. **Peer Review**: 3 community reviewers evaluate within 48 hours
3. **XP Aggregation**: Final score calculated from peer review consensus
4. **Weekly Caps**: Applied per task type to prevent gaming

> **Note**: AI evaluation is currently disabled. All XP scores are determined by peer reviewers.

### Quality Assurance

- **Duplicate Detection**: Content fingerprinting prevents resubmissions
- **Spam Prevention**: Pattern analysis for promotional content
- **Review Incentives**: +50 XP per completed review (+5 XP timeliness bonus), penalties for missed reviews
- **Streak System**: Bonus XP every 4 weeks for consistent activity

## 🔧 API Endpoints

### Content Management
- `POST /api/submissions` - Submit new content for evaluation
- `GET /api/submissions` - List user submissions with filtering
- `POST /api/validate-content` - Real-time content validation

### Peer Review System
- `GET /api/peer-reviews/pending` - Get pending review assignments
- `POST /api/peer-reviews` - Submit peer review with score
- `GET /api/assignments/my` - Get reviewer assignments

### User & Analytics
- `GET /api/user/profile` - Get user profile and XP data
- `GET /api/user/xp-breakdown` - Detailed XP analytics
- `GET /api/user/wallet` - Get user's linked wallets
- `GET /api/leaderboard` - Weekly and all-time rankings

### Community Voting
- `GET /api/vote` - Fetch divergent submissions for voting
- `POST /api/vote/sponsored` - Submit sponsored on-chain vote
- `POST /api/vote/skip` - Skip a voting case
- `GET /api/vote/analytics` - Vote analytics and stats

### Administrative
- `GET /api/admin/stats` - System statistics and metrics
- `POST /api/admin/users` - User management operations
- `PATCH /api/admin/submissions/[id]` - Manage specific submissions
- `POST /api/admin/update-xp` - Manual XP adjustments
- `POST /api/aggregate-xp` - Process XP aggregation
- `POST /api/weekly` - Trigger weekly operations

### Background Processing
- `POST /api/cron/process-submissions` - Process submission queue
- `POST /api/cron/weekly-operations` - Automated weekly tasks

## 🛡️ Security & Quality Features

### Authentication & Authorization
- **Supabase Auth**: Secure user authentication with JWT tokens
- **Role-Based Access Control**: Three-tier permission system (USER, REVIEWER, ADMIN)
- **Row Level Security**: Database-level access control via Supabase RLS
- **Session Management**: Secure session handling with automatic refresh

### Input Validation & Security
- **URL Validation**: Platform-specific URL format verification
- **XP Bounds Checking**: Prevents invalid score submissions
- **SQL Injection Protection**: Prisma ORM with parameterized queries
- **XSS Prevention**: Input sanitization and CSP headers

### Rate Limiting & Abuse Prevention
- **PostgreSQL-based Rate Limiting**: Database-backed rate limiting for serverless environments
- **Submission Limits**: Configurable per-user submission caps
- **Review Deadlines**: Automatic penalty system for missed reviews
- **Duplicate Detection**: Content fingerprinting prevents resubmissions

### Data Protection
- **Environment Variable Security**: Sensitive keys stored securely
- **API Key Rotation**: Support for key rotation without downtime
- **Audit Logging**: Comprehensive logging for security monitoring
- **Error Handling**: Secure error messages without information leakage

## 🎨 User Interface & Experience

### Design System
- **shadcn/ui Components**: Consistent, accessible component library
- **Tailwind CSS**: Utility-first styling with custom design tokens
- **Dark/Light Mode**: System preference detection with manual toggle
- **Responsive Design**: Mobile-first approach with breakpoint optimization

### Key Components
- **Dashboard**: Tabbed interface with Overview, Submit, and Analytics
- **SubmissionForm**: Content submission with real-time validation
- **NotificationCenter**: Real-time notifications with Supabase Realtime
- **Leaderboard**: Interactive rankings with filtering and search
- **AdminPanel**: Comprehensive management interface for system operations

### Mobile Optimization
- **Touch-Friendly**: 44px minimum touch targets
- **Single Navigation**: Bottom navigation for mobile screens
- **Content Overflow**: Proper handling of long content on small screens
- **Performance**: Optimized for mobile network conditions

## 🔄 Background Processing & Automation

### Automated Weekly Operations
1. **Streak Calculation**: Award streaks for users with 100+ weekly XP
2. **Penalty Application**: Deduct XP for missed review assignments
3. **Leaderboard Updates**: Generate weekly and all-time rankings
4. **XP Aggregation**: Process pending submissions and finalize scores
5. **Role Promotions**: Auto-promote users with 1000+ XP to REVIEWER
6. **Cleanup Operations**: Archive old notifications and maintain data hygiene

### Background Job Processing
- **Supabase pg_cron**: Reliable scheduled task execution
- **Database-backed Queues**: Persistent job queues for serverless environments
- **Error Recovery**: Automatic retry mechanisms for failed operations
- **Monitoring**: Comprehensive logging and alerting for background processes

## 🧪 Testing & Quality Assurance

### Available Test Scripts

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage

# Run CI tests
pnpm test:ci

# Test race condition fixes
pnpm test:race-conditions

# Monitor XP consistency
pnpm monitor-xp

# Test analytics optimization
pnpm test:analytics-optimization
```

### Manual Testing Checklist

- [ ] **Authentication Flow**: Registration, login, logout, session management
- [ ] **Content Submission**: URL validation, task type auto-assignment, peer review flow
- [ ] **Peer Review Process**: Assignment, scoring, deadline management
- [ ] **XP Calculation**: Aggregation, weekly caps, streak bonuses
- [ ] **Admin Functions**: User management, content moderation, system operations
- [ ] **Real-time Features**: Notifications, live updates, Supabase Realtime
- [ ] **Mobile Responsiveness**: Touch targets, navigation, content overflow
- [ ] **Security**: Rate limiting, input validation, authorization checks

## 🤝 Contributing Guidelines

### Development Workflow

1. **Fork & Clone**: Fork the repository and clone locally
2. **Branch**: Create feature branch from `main`
3. **Development**: Make changes following code standards
4. **Testing**: Add tests for new functionality
5. **Documentation**: Update relevant documentation
6. **Pull Request**: Submit PR with detailed description

### Code Standards

- **TypeScript**: Strict type checking enabled
- **ESLint**: Follow configured linting rules
- **Prettier**: Consistent code formatting
- **Commit Messages**: Use conventional commit format
- **File Structure**: Follow established patterns

### Testing Requirements

- Unit tests for utility functions
- Integration tests for API endpoints
- Component tests for UI elements
- Manual testing for user workflows

## 📄 License and Contact

### License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

### Contact Information

- **Project Repository**: [GitHub Repository URL]
- **Documentation**: [Documentation URL]
- **Issues**: [GitHub Issues URL]
- **Discussions**: [GitHub Discussions URL]

### Support

For technical support and questions:

1. **Check Documentation**: Review this README and ARCHITECTURE.md
2. **Search Issues**: Look for existing solutions in GitHub issues
3. **Create Issue**: Submit detailed bug reports or feature requests
4. **Community**: Join discussions for general questions

---

**Scholars_XP** - Transforming content evaluation through gamification and community collaboration.

Built with ❤️ using Next.js 15, Supabase, and modern web technologies.

