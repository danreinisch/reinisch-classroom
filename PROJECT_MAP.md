# Reinisch Classroom - Complete Project Map

**Generated**: 2025-11-20  
**Purpose**: Complete documentation of project structure, components, and file purposes

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Directory Structure](#directory-structure)
3. [Core Components](#core-components)
4. [File Inventory](#file-inventory)
5. [Technology Stack](#technology-stack)
6. [Database Schema](#database-schema)
7. [Deployment & Infrastructure](#deployment--infrastructure)

---

## Project Overview

**Reinisch Classroom** is a comprehensive educational management platform designed for special education classrooms. It provides tools for teachers, students, and administrators to manage curriculum, assignments, progress tracking, and student data.

### Key Features:
- **Student Management**: Track student progress, IEP goals, and assignments
- **Assignment Portal**: Multiple portals (A, B, C) for different student workflows
- **Teacher Tools**: Unified teacher center with roster management, progress tracking
- **Admin Dashboard**: Administrative functions with session hardening
- **Curriculum Content**: Language Arts, Life Skills, Math Toolkit presentations
- **Substitute Plans**: Sub-teacher access and materials

---

## Directory Structure

```
reinisch-classroom/
├── .github/                    # GitHub workflows and configurations
├── assets/                     # Global assets (backgrounds, data, scripts)
├── docs/                       # Project documentation
├── netlify/                    # Netlify serverless functions and edge functions
├── presentations/              # Standalone presentation files
├── prototypes/                 # UI/UX prototypes and experimental features
├── scripts/                    # Build and utility scripts
├── site/                       # Main website source code (deployed)
├── supabase/                   # Database schemas, migrations, and SQL utilities
├── tests/                      # Automated test suites (Playwright)
├── web/                        # Shared web modules and libraries
└── [Root files]                # Configuration and entry points
```

---

## Core Components

### 1. Student Portals

**Portal A** (Original Assignment System)
- Location: `site/student/index.html`
- Purpose: Basic assignment submission and viewing
- Features: Simple assignment list, submission forms

**Portal B** (Enhanced Assignment System)
- Location: Uses `portal-b-helpers.js`, `portal-b-ui.js`
- Purpose: Improved assignment submission with resubmission support
- Features: Assignment scoring, resubmission workflow, enhanced UI

**Portal C** (Advanced Progress Tracking)
- Location: Uses `portal-c-helpers.js`, `portal-c-ui.js`
- Purpose: Comprehensive student progress and goal tracking
- Features: IEP goal mapping, progress grids, visual dashboards

### 2. Teacher Center

**Unified Teacher Interface**
- Location: `site/teacher/index.html`
- Purpose: Central hub for all teacher functions
- Features:
  - Student roster management
  - Progress tracking and reporting
  - Assignment creation and grading
  - IEP goal tracking
  - Class enrollment management

**Components**:
- `student-manager-ui.js` - UI for managing students
- `student-manager-rpc.js` - Backend RPC calls for student data
- `progress-grid-v2.js` - Visual progress tracking grid
- `teacher-center-theme.css` - Teacher interface styling

### 3. Admin Dashboard

**Location**: `site/admin/`
**Purpose**: Administrative functions and system management

**Key Files**:
- `admin/index.html` - Admin dashboard interface
- `admin/app.js` - Admin application logic
- `admin/gate.js` - Authentication gate for admin access
- `admin-login/index.html` - Admin login page

**Security Features**:
- Session hardening (see `ADMIN_SESSION_HARDENING.md`)
- Basic auth with Netlify edge functions
- Session refresh and timeout mechanisms
- Environment diagnostics

### 4. Curriculum Content

#### Language Arts
**Location**: `site/language-arts/`

**Modules**:
- **A Door Into Time** (`a-door-into-time/`) - 13-week novel study
- **Lost in Kragdon-ah** (`lost-in-kragdon-ah/`)
- **Return from Kragdon-ah** (`return-from-kragdon-ah/`)
- **Warrior of Kragdon-ah** (`warrior-of-kragdon-ah/`)
- **Language Arts Toolkit** (`toolkit/`) - Skills-based presentations

**Presentations**: Weekly HTML presentations with interactive content

#### Life Skills
**Location**: `site/life-skills/`

**Presentations**:
1. Grocery Shopping and Nutrition (1 week)
2. Job Hunting and Applications (2 weeks)
3. Money Counting
4. Complete Money Unit

#### Math Toolkit
**Location**: `site/math-toolkit/`
**Purpose**: Math skills and practice resources

### 5. Hub & Navigation

**Student Hub**
- Location: `site/hub/index.html`
- Purpose: Main navigation for students
- Features: Unit selection, theme customization, progress overview

**Assignment Hub**
- Location: `site/language-arts/assignment-hub/`
- Purpose: Central assignment submission interface

---

## File Inventory

### Root Level Configuration Files

| File | Purpose |
|------|---------|
| `index.html` | Project root landing page |
| `package.json` | Node.js dependencies and scripts |
| `package-lock.json` | Locked dependency versions |
| `netlify.toml` | Netlify deployment configuration |
| `playwright.config.js` | Playwright test configuration |
| `.eslintrc.json` | ESLint linting rules |
| `.eslintignore` | ESLint ignore patterns |
| `.prettierrc.json` | Prettier code formatting rules |
| `.gitignore` | Git ignore patterns |
| `_headers` | HTTP headers configuration |
| `styles.css` | Global stylesheet |

### Documentation Files (Root)

| File | Purpose |
|------|---------|
| `ADMIN_SESSION_HARDENING.md` | Admin security implementation docs |
| `ADMIN_UPLOAD_GUIDE.md` | Guide for uploading admin content |
| `AUTH_MIGRATION_AND_GUARDRAILS.md` | Authentication system documentation |
| `DEPLOYMENT_VERIFICATION.md` | Deployment checklist and verification |
| `IMPLEMENTATION_PHASE2_PR_A.md` | Phase 2 implementation notes |
| `IMPLEMENTATION_SUMMARY.md` | Overall implementation summary |
| `PR_A2_BEFORE_AFTER.md` | PR comparison documentation |
| `PR_A2_SUMMARY.md` | PR A2 summary |
| `README.unified-teacher-center.md` | Teacher center documentation |
| `SESSION_HARDENING_SUMMARY.md` | Session security summary |
| `STABILIZATION_PATCH_A.2.1.md` | Patch notes |

### Scripts (Root)

| File | Purpose |
|------|---------|
| `check-fallback.mjs` | Verify fallback mechanisms |
| `check-loading.mjs` | Check loading states |
| `final-screenshot.mjs` | Take final screenshots for testing |
| `take-screenshot.mjs` | Screenshot utility |

---

## `/assets` Directory

### Structure
```
assets/
├── bg/                         # Background images/patterns
│   ├── bg5e_soft_grid.png
│   └── bg5e_soft_grid.svg
├── data/                       # Global data files
│   └── site-state.json
├── js/                         # Global JavaScript
│   ├── adit-week11-bg-preload.js
│   └── presentation-nav.js
├── HomePageBackground.mp4      # Homepage video background
├── background.mp4 -> HomePageBackground.mp4
└── README.md
```

---

## `/docs` Directory

### Documentation Files

| File | Purpose |
|------|---------|
| `BATCH_UPDATE_PRESENTATIONS.md` | Batch updating presentation files |
| `CSP_COMPLIANCE_SUMMARY.md` | Content Security Policy compliance |
| `DEPLOYMENT_VERIFICATION.md` | Deployment verification procedures |
| `GUARDRAILS.md` | Development guardrails and best practices |
| `IEP_PROGRESS_PHASES_4_5.md` | IEP progress tracking documentation |
| `LIFE_SKILLS_UPLOAD.md` | Life skills content upload guide |
| `MIGRATIONS.md` | Database migration documentation |
| `PHASE_6_8_SUMMARY.md` | Development phases 6-8 summary |
| `PHASE_6_8_TESTING.md` | Testing guide for phases 6-8 |
| `PHASE_B_IMPLEMENTATION.md` | Portal B implementation guide |
| `PORTAL_B.md` | Portal B documentation |
| `PORTAL_B_SUMMARY.md` | Portal B feature summary |
| `PORTAL_C.md` | Portal C documentation |
| `PORTAL_C_SUMMARY.md` | Portal C feature summary |
| `STUDENT_MANAGER.md` | Student manager documentation |
| `SUPABASE_SETUP.md` | Supabase database setup guide |
| `TEACHER_AUTH_ENV.sample.md` | Teacher authentication environment variables |
| `TESTING_GUIDE_PHASES_4_5.md` | Testing guide for phases 4-5 |
| `VISUAL_FEATURE_GUIDE.md` | Visual features documentation |
| `assignment-manifest.schema.json` | Assignment manifest JSON schema |
| `assignment-mapping-phase-1.md` | Assignment mapping phase 1 |
| `assignment-mapping-reference.md` | Assignment mapping reference |
| `assignment-mapping-summary.md` | Assignment mapping summary |
| `assignment-mapping-testing.md` | Assignment mapping testing guide |
| `phase-6-8-demo.html` | Interactive demo for phases 6-8 |

### Examples
```
docs/examples/
├── mapping-example-20items.txt
├── mapping-example-science.json
└── mapping-stress-300items.txt
```

---

## `/netlify` Directory

### Edge Functions (`netlify/edge-functions/`)

Edge functions run at CDN edge locations for fast response times.

| File | Purpose |
|------|---------|
| `admin-auth-guard.js` | Protects admin routes |
| `admin-basic-auth.js` | Basic authentication for admin |
| `admin-hardblock.js` | Hard security block for admin access |
| `edge-ping.js` | Edge function health check |

### Serverless Functions (`netlify/functions/`)

Backend API endpoints running on Netlify Functions.

#### Library (`_lib/`)
| File | Purpose |
|------|---------|
| `auth.js` | Authentication utilities |
| `http.js` | HTTP helper functions |
| `supa.js` | Supabase client wrapper |
| `token-utils.js` | JWT token utilities |
| `token-utils.test.js` | Token utility tests |

#### API Endpoints
| File | Purpose |
|------|---------|
| `admin-env-diagnostics.js` | Admin environment diagnostics |
| `admin-logout.js` | Admin logout handler |
| `admin-session-check.js` | Check admin session validity |
| `admin-session-refresh.js` | Refresh admin session |
| `admin-session-touch.js` | Update session last activity |
| `admin-session.js` | Admin session management |
| `assignments-list.js` | Fetch assignments list |
| `auth-health.js` | Authentication health check |
| `client-error.js` | Client-side error reporting |
| `csp-report.js` | Content Security Policy violation reports |
| `env-check.js` | Environment variable checker |
| `fetch-html-url.js` | Fetch and proxy HTML content |
| `hello.js` | Test/hello endpoint |
| `incremental-deploy.js` | Incremental deployment handler |
| `submissions-create.js` | Create student submissions |
| `teacher-login.js` | Teacher authentication |
| `teacher-session.js` | Teacher session management |

---

## `/scripts` Directory

Build and maintenance scripts.

| File | Purpose |
|------|---------|
| `add-week.mjs` | Add new week to curriculum |
| `batch-update-presentations.cjs` | Batch update presentation files |
| `build-math-toolkit-index.js` | Generate math toolkit index |
| `check-asset-paths.cjs` | Verify asset path correctness |
| `check-env-leaks.js` | Check for leaked environment variables |
| `check-inline-scripts.cjs` | Verify inline scripts for CSP compliance |

---

## `/site` Directory (Main Website)

### Site Structure
```
site/
├── admin/                      # Admin dashboard
├── admin-login/                # Admin login page
├── assets/                     # Site-specific assets
├── hub/                        # Student hub
├── language-arts/              # Language Arts curriculum
├── life-skills/                # Life Skills curriculum
├── math-toolkit/               # Math resources
├── presentations/              # Presentation system
├── student/                    # Student portal
├── sub/                        # Substitute teacher interface
├── teacher/                    # Teacher center
├── teacher-tools/              # Teacher utilities
├── vendor/                     # Third-party libraries
├── web/                        # Shared web modules
├── _headers                    # HTTP headers
├── _redirects                  # URL redirects
└── index.html                  # Site homepage
```

### `/site/assets`

```
assets/
├── bg/                         # Background images
├── css/
│   ├── site.css                # Global site styles
│   └── theme.css               # Theme definitions
├── data/
│   ├── presentations.json      # Presentation metadata
│   ├── site-state.json         # Site state data
│   └── units.json              # Unit definitions
├── images/                     # Image assets
└── js/
    ├── adit-week11-bg-preload.js
    ├── adit-week6-bg-preload.js
    ├── presentation-nav.js     # Presentation navigation
    ├── section-nav.js          # Section navigation
    ├── site.js                 # Global site JavaScript
    └── unit-grid.js            # Unit grid display
```

### `/site/web` (Shared Modules)

Core application logic shared across the site.

| File | Purpose |
|------|---------|
| `assignment-manifest.js` | Assignment manifest handling |
| `auth-handoff.js` | Authentication handoff between pages |
| `auth-modal-extend.js` | Session extension modal |
| `codebook.js` | Student codebook for login |
| `csv-iep-validators.js` | CSV validation for IEP data |
| `data-adapter.js` | Data layer adapter |
| `diagnostics.js` | System diagnostics |
| `feature-flags.js` | Feature flag management |
| `hub-defensive-wiring.js` | Hub defensive programming |
| `hub-healthcheck.js` | Hub health monitoring |
| `hub-init.js` | Hub initialization |
| `hub-theme-boot.js` | Theme bootstrapping |
| `hub-ux-enhancement.js` | UX enhancements |
| `library.js` | Shared utility library |
| `portal-b-helpers.js` | Portal B helper functions |
| `portal-b-ui.js` | Portal B UI components |
| `student-manager-rpc.js` | Student manager RPC calls |
| `student-manager-ui.js` | Student manager UI |
| `student-portal-auto-login.js` | Auto-login for students |
| `student-portal-error-handler.js` | Error handling for student portal |
| `student-portal-failsafe.js` | Failsafe mechanisms |
| `sub-plans.js` | Substitute plans management |
| `supabase-client.js` | Supabase client initialization |
| `supabase-settings.js` | Supabase configuration |
| `supabase-util.js` | Supabase utilities |
| `teacher-center-theme.css` | Teacher center styling |
| `user-auth.js` | User authentication |
| `validation.js` | Form validation utilities |

### `/site/vendor`

Third-party libraries bundled with the site.

- `supabase-js@2.mjs` - Supabase JavaScript client library

---

## `/supabase` Directory

### Database Schema (`/supabase/schema`)

Core database schema files, applied in order:

| File | Purpose |
|------|---------|
| `001_init.sql` | Initial database setup |
| `002_phase_a_assignments.sql` | Assignment tables (Phase A) |
| `003_class_enrollments.sql` | Class and enrollment management |
| `004_portal_b_resubmission.sql` | Portal B resubmission support |
| `005_student_manager.sql` | Student manager tables |
| `006_student_manager_extensions.sql` | Student manager extensions |

### Migrations (`/supabase/migrations`)

Database migrations for iterative updates:

| File | Purpose |
|------|---------|
| `20251105_app_users_and_sub_plans.sql` | App users and sub plans |
| `20251108_assignment_mapping_phase_1.sql` | Assignment-goal mapping |
| `20251108_goal_progress_table.sql` | Goal progress tracking |
| `20251108_phase_6_8_saved_views.sql` | Saved views for phases 6-8 |
| `20251108_phases_4_5_assignment_goal_mapping.sql` | IEP goal mapping |
| `20251108_portal_c_saved_views.sql` | Portal C views |
| `20251109_student_manager_consolidated.sql` | Consolidated student manager |
| `test_student_manager.sql` | Student manager test data |

### SQL Utilities (`/supabase/sql`)

| File | Purpose |
|------|---------|
| `cleanup_zero_enrollment_classes.sql` | Remove empty classes |
| `ingest_roster_csv_inline_safe.sql` | Safely import roster CSV |
| `repair_enrollment_ids.sql` | Fix enrollment ID issues |

### SQL Extras (`/supabase/sql-extras`)

| File | Purpose |
|------|---------|
| `00_performance_indexes.sql` | Performance optimization indexes |
| `01_triggers_updated_at.sql` | Auto-update timestamp triggers |
| `03_optional_bulk_rpcs.sql` | Bulk operation RPCs |
| `04_dev_policies_open.sql` | Development RLS policies (open) |
| `04_prod_policies_recommended.sql` | Production RLS policies (secure) |

### Legacy Schema

- `schema_teacher.sql` - Legacy teacher-specific schema

---

## `/tests` Directory

Automated tests using Playwright.

| File | Purpose |
|------|---------|
| `session-hardening.spec.ts` | Session security tests |
| `student-manager-smoke.spec.ts` | Student manager smoke tests |
| `student-manager.spec.js` | Comprehensive student manager tests |

---

## `/web` Directory

Shared web modules (duplicated from site/web for build purposes).

| File | Purpose |
|------|---------|
| `assignment-manifest.js` | Assignment manifest system |
| `assignment-mapping-db.js` | Assignment-goal mapping DB layer |
| `assignment-mapping-parsers.js` | Parse assignment mapping data |
| `assignment-scoring.js` | Assignment scoring logic |
| `auth-handoff.js` | Authentication handoff |
| `auth-modal-extend.js` | Session extension modal |
| `codebook.js` | Student codebook system |
| `data-adapter.js` | Data layer adapter |
| `diagnostics.js` | Diagnostic utilities |
| `feature-flags.js` | Feature flags |
| `library.js` | Shared library functions |
| `portal-b-helpers.js` | Portal B helpers |
| `portal-b-ui.js` | Portal B UI |
| `portal-c-helpers.js` | Portal C helpers |
| `portal-c-ui.js` | Portal C UI |
| `progress-grid-v2.css` | Progress grid styles |
| `progress-grid-v2.js` | Progress grid implementation |
| `student-manager-rpc.js` | Student manager RPC |
| `student-manager-ui.js` | Student manager UI |
| `sub-plans.js` | Substitute plans |
| `supabase-client.js` | Supabase client |
| `supabase-settings.js` | Supabase settings |
| `teacher-center-theme.css` | Teacher center theme |

---

## Technology Stack

### Frontend
- **HTML5**: Semantic markup, accessible content
- **CSS3**: Custom styling, themes, responsive design
- **JavaScript (ES6+)**: Modern JavaScript with modules
- **No Framework**: Vanilla JS for performance and simplicity

### Backend
- **Netlify Functions**: Serverless API endpoints
- **Netlify Edge Functions**: Edge computing for auth
- **Supabase**: PostgreSQL database with RLS (Row Level Security)
- **Supabase Auth**: Authentication system

### Development Tools
- **Playwright**: End-to-end testing
- **ESLint**: JavaScript linting
- **Prettier**: Code formatting
- **Node.js**: Build scripts and tooling

### Deployment
- **Netlify**: Static site hosting and serverless functions
- **Git**: Version control
- **GitHub**: Repository hosting

---

## Database Schema

### Core Tables

1. **app_users**: User accounts (students, teachers, admins)
2. **students**: Student profiles and metadata
3. **classes**: Class definitions
4. **class_enrollments**: Student-class relationships
5. **assignments**: Assignment definitions
6. **submissions**: Student assignment submissions
7. **iep_goals**: IEP goal definitions
8. **goal_progress**: Student progress on IEP goals
9. **assignment_goal_mapping**: Map assignments to IEP goals
10. **sub_plans**: Substitute teacher plans

### Key Features
- **Row Level Security (RLS)**: Data isolation by user role
- **Triggers**: Auto-update timestamps
- **Views**: Saved queries for common data needs
- **RPCs**: Stored procedures for complex operations

---

## Deployment & Infrastructure

### Netlify Configuration (`netlify.toml`)

**Key Settings**:
- Build command: `npm run postbuild`
- Publish directory: `site`
- Functions directory: `netlify/functions`
- Edge functions directory: `netlify/edge-functions`

### Environment Variables

Required environment variables (see docs for details):
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_SERVICE_KEY`: Supabase service role key
- `ADMIN_USERNAME`: Admin username
- `ADMIN_PASSWORD`: Admin password hash
- `JWT_SECRET`: JWT signing secret
- `TEACHER_PASSWORD`: Teacher password

### Security Features

1. **Content Security Policy (CSP)**: Strict CSP headers
2. **Session Hardening**: Timeout, refresh, activity tracking
3. **Basic Auth**: Admin route protection
4. **Edge Function Guards**: Pre-execution auth checks
5. **RLS Policies**: Database-level access control

---

## Content Organization

### Presentations

Presentations are organized by curriculum area and week:

**Structure**:
```
site/presentations/
├── _template/                  # Presentation template
├── a-door-into-time/          # Novel study (Weeks 3-13)
│   ├── presentation-03/
│   ├── presentation-04/
│   └── ...
└── reading-habits/            # Reading habits module
```

**Format**: HTML presentations with embedded JavaScript and CSS

### Assignments

Assignments are defined in `assignments` table and linked to:
- Curriculum unit
- IEP goals (via `assignment_goal_mapping`)
- Presentations
- Grading rubrics

---

## Key Workflows

### 1. Student Assignment Workflow
1. Student logs in via codebook (`codebook.js`)
2. Student hub loads (`hub/index.html`)
3. Student navigates to assignment hub
4. Student views assignments (Portal A/B/C)
5. Student submits work
6. Submission stored in database (`submissions` table)

### 2. Teacher Progress Tracking
1. Teacher logs in (`teacher-login.js`)
2. Teacher center loads (`teacher/index.html`)
3. Teacher views student manager (`student-manager-ui.js`)
4. Progress grid displays IEP goal progress (`progress-grid-v2.js`)
5. Teacher can update grades and notes

### 3. Admin Management
1. Admin logs in via basic auth (`admin-login/`)
2. Admin gate validates session (`admin/gate.js`)
3. Admin dashboard loads (`admin/index.html`)
4. Admin can manage users, classes, system settings
5. Session hardening enforces timeouts

---

## Development Phases

The project has been developed in multiple phases:

- **Phase A**: Basic assignment system
- **Phase B**: Enhanced assignment portal with resubmission
- **Phase C**: Advanced progress tracking and IEP integration
- **Phases 4-5**: Assignment-goal mapping
- **Phases 6-8**: Student manager and consolidated views

See docs for detailed phase documentation.

---

## Build & Test Commands

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run specific tests
npm run test:smoke

# Lint code
npm run lint

# Format code
npm run format

# Check formatting
npm run format:check

# Post-build checks
npm run postbuild
```

---

## File Count Summary

- **Total Source Files**: ~242
- **JavaScript/MJS Files**: ~120
- **HTML Files**: ~80
- **CSS Files**: ~10
- **SQL Files**: ~20
- **Markdown Documentation**: ~35
- **JSON Configuration**: ~10

---

## Notes for Developers

### Code Organization
- `/site` is the deployed website (public-facing)
- `/web` contains source modules (some duplicated in `/site/web`)
- `/netlify` contains backend functions (not public)
- `/supabase` contains database definitions (not public)

### Security Considerations
- Never commit `.env` files
- Use environment variables for all secrets
- Follow CSP compliance guidelines
- Test authentication flows before deployment

### Testing
- Always run smoke tests before deploying
- Test session hardening features
- Verify student manager functionality
- Check assignment submission workflows

### Documentation
- Update relevant markdown files when making changes
- Follow existing documentation structure
- Include examples where helpful

---

## Future Enhancements

Potential areas for expansion:
1. Mobile-responsive design improvements
2. Additional curriculum modules
3. Parent portal
4. Enhanced reporting and analytics
5. Real-time collaboration features
6. Offline mode support

---

## Support & Contact

For questions or issues, refer to:
- Project documentation in `/docs`
- Implementation summaries (root-level `.md` files)
- GitHub issues and pull requests

---

**End of Project Map**
