# ScholarXP Evaluation System

A Next.js-based XP evaluation system where users submit content for review, AI agents assign XP automatically, and peer reviewers help ensure fairness. The system supports incentive mechanics like streaks, caps, and leaderboards while providing admin oversight and structured review workflows.

## 🚀 Features

### Core Functionality
- **Content Submission**: Users can submit Twitter/X or Medium links for evaluation
- **AI Evaluation**: Automated content analysis and XP assignment using GPT-4
- **Peer Review System**: Community-driven validation with reviewer incentives
- **XP Aggregation**: Weighted combination of AI and peer scores with weekly caps
- **Weekly Management**: Automated streak tracking, penalties, and leaderboard generation

### User Experience
- **Real-time Notifications**: In-app notification system for XP awards and review assignments
- **Leaderboards**: Weekly and all-time rankings with detailed statistics
- **Admin Panel**: Comprehensive management interface for flagged content and system operations
- **Responsive Design**: Mobile-friendly interface with modern UI components

### Security & Quality
- **Content Validation**: Automatic detection of spam, AI-generated content, and duplicates
- **Rate Limiting**: Protection against abuse with configurable limits
- **Error Handling**: Comprehensive error tracking and retry mechanisms
- **Security Headers**: Protection against common web vulnerabilities

## 🛠 Tech Stack

| Component | Technology |
|-----------|------------|
| Frontend | Next.js 15 (App Router), React, TypeScript |
| Backend | Next.js API Routes, Server Actions |
| Database | PostgreSQL with Prisma ORM |
| AI | OpenAI GPT-4 for content evaluation |
| Styling | Tailwind CSS, shadcn/ui components |
| Authentication | NextAuth.js (ready for integration) |
| Scheduling | node-cron for weekly operations |
| Deployment | Vercel-ready configuration |

## 📋 System Requirements

- Node.js 18+ 
- PostgreSQL database
- OpenAI API key (for AI evaluation)

## 🚀 Quick Start

### 1. Clone and Install
```bash
git clone <repository-url>
cd xp-evaluation-system
npm install
```

### 2. Environment Setup
Create a `.env` file with:
```env
DATABASE_URL="postgresql://username:password@localhost:5432/xpeval"
OPENAI_API_KEY="your-openai-api-key"
NEXTAUTH_SECRET="your-nextauth-secret"
NEXTAUTH_URL="http://localhost:3000"
```

### 3. Database Setup
```bash
# Generate Prisma client
npx prisma generate

# Run database migrations
npx prisma migrate dev

# (Optional) Seed with sample data
npx prisma db seed
```

### 4. Start Development Server
```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

## 📊 Database Schema

### Core Models

**User**
- Tracks total XP, weekly XP, streaks, and missed reviews
- Supports authentication integration

**Submission**
- Content submissions with URL, platform, and evaluation status
- Links to AI evaluation results and peer reviews

**PeerReview**
- Individual peer review scores and comments
- Tracks reviewer participation for incentives

**WeeklyStats**
- Historical weekly performance data
- Supports leaderboard generation and analytics

### Status Flow
```
PENDING → AI_REVIEWED → UNDER_PEER_REVIEW → FINALIZED
                    ↓
                 FLAGGED/REJECTED
```

## 🔧 API Endpoints

### Content Management
- `POST /api/submissions` - Submit new content
- `GET /api/submissions` - List submissions
- `POST /api/evaluate` - Trigger AI evaluation

### Peer Review
- `GET /api/peer-reviews/pending` - Get pending reviews
- `POST /api/peer-reviews` - Submit peer review

### System Operations
- `POST /api/aggregate-xp` - Process XP aggregation
- `POST /api/weekly` - Trigger weekly operations
- `GET /api/leaderboard` - Get leaderboard data

### Admin
- `GET /api/admin/stats` - System statistics
- `PATCH /api/admin/submissions` - Manage submissions

## 🎯 XP System

### Task Categories & Caps
- **Task A** (Thread or Long Article): 20-30 XP, max 90/week (3 completions)
- **Task B** (Platform Article): 75-150 XP, max 450/week (3 completions) - Reddit/Notion/Medium only
- **Task C** (Tutorial/Guide): 20-30 XP, max 90/week (3 completions)
- **Task D** (Protocol Explanation): 50-75 XP, max 225/week (3 completions)
- **Task E** (Correction Bounty): 50-75 XP, max 225/week (3 completions)
- **Task F** (Strategies): 50-75 XP, max 225/week (3 completions)

### Scoring Algorithm
1. **AI Evaluation**: GPT-4 analyzes content for quality, originality, and task classification
2. **Peer Review**: 3 community reviewers validate and score (48-72 hour deadline)
3. **Final XP**: Weighted average (40% AI, 60% peer) with weekly caps applied
4. **Bonuses**: Streak bonuses every 4 weeks, review participation rewards

### Quality Controls
- **Originality Detection**: AI flags potentially generated content
- **Spam Prevention**: Pattern detection for promotional content
- **Duplicate Checking**: Content similarity analysis
- **Review Penalties**: -50 XP per missed review assignment

## 🔐 Security Features

### Input Validation
- URL format and platform verification
- Content length and hashtag requirements
- XP score bounds checking

### Rate Limiting
- 10 submissions per hour per user
- 20 reviews per hour per user
- 60 general API requests per minute

### Content Security
- XSS protection headers
- CSRF protection
- Content Security Policy
- Input sanitization

## 🎨 UI Components

Built with shadcn/ui for consistent, accessible design:

- **SubmissionForm**: Content submission interface
- **PeerReviewCard**: Review assignment interface  
- **NotificationCenter**: Real-time notification system
- **Leaderboard**: Rankings and statistics display
- **AdminPanel**: System management interface

## 📱 Mobile Support

- Responsive design for all screen sizes
- Touch-friendly interface elements
- Mobile navigation optimization
- Progressive Web App ready

## 🔄 Weekly Operations

Automated weekly processes:
1. **Streak Calculation**: Award streaks for 100+ XP weeks
2. **Penalty Application**: Deduct XP for missed reviews
3. **Leaderboard Generation**: Create weekly rankings
4. **XP Reset**: Clear weekly counters
5. **Bonus Awards**: Parthenon XP for 4-week streaks

## 🚀 Deployment

### Vercel (Recommended)
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Docker
```bash
# Build image
docker build -t xp-evaluation-system .

# Run container
docker run -p 3000:3000 xp-evaluation-system
```

## 🧪 Testing

### Manual Testing Checklist
- [ ] Content submission flow
- [ ] AI evaluation process
- [ ] Peer review assignment
- [ ] XP aggregation logic
- [ ] Weekly operations
- [ ] Admin panel functions
- [ ] Notification system
- [ ] Mobile responsiveness

### Automated Testing (Future)
- Unit tests for utility functions
- Integration tests for API endpoints
- E2E tests for user workflows

## 🔧 Configuration

### AI Evaluation
Customize evaluation prompts and scoring in `src/lib/ai-evaluator.ts`

### XP Caps
Modify weekly limits in `src/lib/xp-aggregator.ts`

### Rate Limits
Adjust limits in `src/middleware.ts`

### Notifications
Configure notification types in `src/lib/notifications.ts`

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

## 🆘 Support

For issues and questions:
1. Check the GitHub issues
2. Review the documentation
3. Contact the development team

## 🗺 Roadmap

### Phase 1 (Current)
- [x] Core submission and review system
- [x] AI evaluation integration
- [x] Basic admin panel
- [x] Notification system

### Phase 2 (Future)
- [ ] User authentication system
- [ ] Advanced analytics dashboard
- [ ] Mobile app development
- [ ] API rate limiting with Redis
- [ ] Automated testing suite

### Phase 3 (Future)
- [ ] Multi-language support
- [ ] Advanced AI models
- [ ] Blockchain integration
- [ ] Social media integration
- [ ] Advanced gamification

---

Built with ❤️ using Next.js and modern web technologies.

