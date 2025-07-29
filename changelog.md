# Changelog

All notable changes to the Scholars XP platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.4.0] - 2025-07-29

### Added
- Comprehensive user account merge system with atomic transaction processing
- Advanced legacy account matching using Discord handles and email addresses
- Real-time merge progress monitoring with detailed status tracking
- Admin merge management interface with history and statistics
- Automated data validation and integrity checking for merge operations
- Background job processing for large-scale merge operations
- Merge conflict resolution with manual override capabilities

### Changed
- Enhanced authentication context to support merge status tracking
- Improved admin dashboard with merge management capabilities
- Updated user profile system to handle merged account data

### Technical
- Added UserMergeHistory table for tracking merge operations
- Implemented atomic database functions for safe merge processing
- Created comprehensive merge validation system with rollback capabilities
- Added Discord field support for legacy account identification
- Implemented transaction isolation fixes for concurrent operations

## [1.3.1] - 2025-07-29

### Added
- User profile page with comprehensive account information display
- Profile navigation link in main menu for easy access

### Fixed
- Resolved PerformanceDashboard import case sensitivity issues
- Fixed Prisma client generation in Vercel deployment process
- Corrected build configuration for production deployment
- Updated application metadata description for clarity

### Technical
- Added Vercel deployment configuration with proper build settings
- Improved build process reliability with npx commands
- Enhanced .gitignore patterns for better file management

## [1.3.0] - 2025-07-28

### Added
- Professional changelog system with dedicated `/changelog` route
- Interactive timeline-based changelog interface with visual design consistency
- Comprehensive automation system with cron job scheduling for XP calculations and leaderboard updates
- Enhanced admin dashboard with real-time automation monitoring and system control
- Interactive XP trend charts using shadcn/ui components with hover tooltips and improved accessibility
- Automation status monitoring with job execution history and error tracking
- System control endpoints for starting/stopping automation and clearing cache

### Changed
- Migrated XP trend charts from recharts to shadcn/ui chart components for better interactivity
- Updated landing page content to focus on peer collaboration rather than AI-driven evaluation
- Enhanced admin interface with better organization and real-time status updates
- Improved chart responsiveness and user experience across all devices

### Technical
- Added automation_jobs table for tracking cron job execution
- Added system_settings table for configuration management
- Created comprehensive database migration for automation infrastructure
- Implemented real-time status monitoring with automatic refresh capabilities
- Created changelog parsing utilities for markdown-based changelog management


## [1.2.0] - 2025-07-18

### Added
- Advanced analytics dashboard with detailed XP breakdown charts
- Weekly goals widget with progress tracking and streak counters
- Achievement gallery with visual progress indicators
- Mobile-optimized navigation with bottom tab bar
- Comprehensive notification system with real-time updates

### Changed
- Redesigned dashboard layout with improved mobile responsiveness
- Enhanced leaderboard with filtering and search capabilities
- Upgraded submission form with multi-step validation
- Improved performance monitoring and error tracking

### Fixed
- Resolved mobile layout issues on smaller screens
- Fixed XP calculation inconsistencies in edge cases
- Corrected notification timing and delivery issues

## [1.1.0] - 2025-07-16

### Added
- Peer review system with quality scoring
- Reviewer role management and permissions
- Submission flagging and moderation tools
- XP transaction history and audit trail
- Dark/light theme toggle with system preference detection

### Changed
- Enhanced admin panel with comprehensive management tools
- Improved submission evaluation algorithm
- Updated user profile system with role-based access

### Fixed
- Database performance optimizations
- Authentication flow improvements
- Mobile compatibility enhancements

## [1.0.0] - 2025-07-16

### Added
- Initial release of Scholars XP platform
- User authentication and profile management
- Content submission system for Twitter, Medium, and Reddit links
- Automated content evaluation and XP scoring
- Basic leaderboard and ranking system
- Admin dashboard for system management
- Responsive design with mobile support

### Technical
- Built with Next.js 14 and TypeScript
- Supabase backend with PostgreSQL database
- Tailwind CSS with shadcn/ui component library
- Real-time updates with Supabase Realtime
- Comprehensive testing suite with Jest and React Testing Library
