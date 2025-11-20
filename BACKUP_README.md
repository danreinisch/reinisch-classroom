# Reinisch Classroom - Backup and Project Map

This directory contains comprehensive backup and mapping tools for the Reinisch Classroom project.

## Quick Start

### Option 1: View the Project Map (No Backup Needed)

Simply open `PROJECT_MAP.md` to see a complete documentation of the project structure, all files, and their purposes.

```bash
# View the map
cat PROJECT_MAP.md
# or open in your editor
```

### Option 2: Create a Full Backup

Run the backup script to create a complete archive of all source code:

```bash
# Create backup
./create-backup.sh
```

This will create a timestamped archive file: `reinisch-classroom-backup-YYYY-MM-DD-HHMMSS.tar.gz`

## What's Included

### PROJECT_MAP.md

A comprehensive documentation file containing:
- **Complete project overview** - What the project is and what it does
- **Directory structure** - Full directory tree with explanations
- **File inventory** - Every file documented with its purpose
- **Component documentation** - Student portals, teacher center, admin dashboard
- **Technology stack** - All technologies and frameworks used
- **Database schema** - Complete database documentation
- **Workflows** - How different parts of the system work together
- **Development phases** - History of project development

### create-backup.sh

An automated backup script that:
- Creates an organized backup of all source code
- Separates source, documentation, database, config, and tests
- Generates metadata and file inventory
- Creates a compressed `.tar.gz` archive
- Includes restoration instructions

## Backup Contents

When you run `create-backup.sh`, it creates a backup with this structure:

```
reinisch-classroom-backup-YYYY-MM-DD-HHMMSS/
├── source/              # All source code
│   ├── site/           # Main website
│   ├── web/            # Shared modules
│   ├── netlify/        # Serverless functions
│   ├── assets/         # Global assets
│   ├── scripts/        # Build scripts
│   └── presentations/  # Presentation files
├── documentation/       # All documentation
│   ├── docs/           # Documentation directory
│   └── *.md            # All markdown files
├── database/           # Database schemas
│   └── supabase/       # Supabase migrations and schemas
├── config/             # Configuration files
│   ├── package.json
│   ├── netlify.toml
│   └── other configs
├── tests/              # Test suites
│   └── Playwright tests
├── metadata/           # Backup metadata
│   ├── BACKUP_INFO.txt     # Backup information
│   └── FILE_INVENTORY.txt  # Complete file list
└── PROJECT_MAP.md      # Complete project documentation
```

## Using the Backup

### Extract the Backup

```bash
# Extract the archive
tar -xzf reinisch-classroom-backup-YYYY-MM-DD-HHMMSS.tar.gz

# Navigate to extracted directory
cd reinisch-classroom-backup-YYYY-MM-DD-HHMMSS
```

### View Contents

```bash
# List all files
tar -tzf reinisch-classroom-backup-YYYY-MM-DD-HHMMSS.tar.gz

# View with pagination
tar -tzf reinisch-classroom-backup-YYYY-MM-DD-HHMMSS.tar.gz | less
```

### Restore Project

1. Extract the backup
2. Copy files back to a new directory
3. Install dependencies:
   ```bash
   npm install
   ```
4. Set up environment variables (see documentation)
5. Set up Supabase database (see `database/supabase/`)
6. Deploy or run locally

## File Statistics

The project contains approximately:
- **242** total source files
- **120** JavaScript/MJS files
- **80** HTML files
- **10** CSS files
- **20** SQL files
- **35** Markdown documentation files
- **10** JSON configuration files

## Project Components

### Main Components
- **Student Portals** (A, B, C) - Assignment submission and progress tracking
- **Teacher Center** - Student management, grading, IEP tracking
- **Admin Dashboard** - System administration and management
- **Curriculum Content** - Language Arts, Life Skills, Math Toolkit
- **Netlify Functions** - Serverless backend API
- **Supabase Database** - PostgreSQL database with RLS

### Technology Stack
- Frontend: HTML5, CSS3, Vanilla JavaScript (ES6+)
- Backend: Netlify Functions, Netlify Edge Functions
- Database: Supabase (PostgreSQL)
- Testing: Playwright
- Deployment: Netlify

## Documentation Files

Key documentation in the project:
- `PROJECT_MAP.md` - Complete project map (this is the most comprehensive doc)
- `ADMIN_SESSION_HARDENING.md` - Admin security documentation
- `DEPLOYMENT_VERIFICATION.md` - Deployment procedures
- `docs/STUDENT_MANAGER.md` - Student manager documentation
- `docs/SUPABASE_SETUP.md` - Database setup guide
- `docs/PORTAL_B.md`, `docs/PORTAL_C.md` - Portal documentation
- And many more in the `docs/` directory

## Quick Reference

### View Project Structure
```bash
# See the project map
less PROJECT_MAP.md

# or search for specific topics
grep -i "student portal" PROJECT_MAP.md
```

### Create Backup
```bash
# Run the backup script
./create-backup.sh

# The script will output the location of the backup file
```

### Find Specific Files
```bash
# Search for a specific file type
find . -name "*.js" -type f | grep -v node_modules

# Search for files containing specific text
grep -r "function submitAssignment" site/ web/
```

## Security Notes

⚠️ **Important**: 
- The backup does NOT include `.env` files (secrets)
- The backup does NOT include `node_modules` (dependencies)
- The backup does NOT include `.git` directory (version history)
- Never commit sensitive data like passwords or API keys
- Environment variables must be set up separately after restoration

## Support

For questions about the backup or project structure:
1. Start with `PROJECT_MAP.md` - it has everything documented
2. Check the `docs/` directory for specific topics
3. Look at root-level `.md` files for implementation notes
4. Review the backup metadata in `metadata/BACKUP_INFO.txt`

## Updates

To update the backup after making changes:
```bash
# Simply run the backup script again
./create-backup.sh

# It will create a new timestamped backup
```

## Maintenance

The backup script is self-contained and requires only:
- Bash shell
- `tar` command
- Basic Unix utilities (`find`, `cp`, `mkdir`, etc.)

Optional for better output:
- `tree` command (for visual directory trees)

---

**Created**: 2025-11-20  
**Purpose**: Complete backup and documentation of Reinisch Classroom project  
**Maintained by**: Project repository
