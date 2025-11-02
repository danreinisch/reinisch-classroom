# Phase B: Teacher Center Assignment Management

## Overview

Phase B adds comprehensive assignment management capabilities to the Teacher Center, enabling teachers to:
- Upload HTML assignment packages with automatic validation
- Create Google Form assignments with answer keys
- Issue assignments to classes or individual students
- Simulate and test submissions with goal-based progress tracking

## Features Implemented

### 1. HTML Package Uploader

**Location**: `prototypes/teacher-center-unified.html` - Assignments tab

Teachers can upload ZIP files containing:
- `assignment.json` manifest (required)
- HTML, CSS, JavaScript files for the assignment
- Images and other assets

**Manifest Format**:
```json
{
  "version": "1.0",
  "title": "Assignment Title",
  "series": "Language Arts",
  "questions": [
    {
      "id": "q1",
      "text": "Question text",
      "answer": "Correct answer",
      "iep_goal_codes": ["S001.11.1", "S001.12.2"]
    }
  ]
}
```

**Validation**:
- Checks for `assignment.json` in ZIP root
- Validates required fields: `version`, `title`, `questions` array
- Displays manifest preview before creation
- Shows clear error messages for invalid files

### 2. Google Forms Integration

**Location**: `prototypes/teacher-center-unified.html` - Assignments tab (Google Form type)

Features:
- Form URL input (required)
- Answer Key in JSON format (optional)
- IEP Goal Codes array (optional)
- CSV response import with auto-grading

**Answer Key Format**:
```json
{
  "q1": "A",
  "q2": "B",
  "q3": "C"
}
```

### 3. Class-Based Assignment Issuing

**Location**: `prototypes/teacher-center-unified.html` - Issue Assignment section

Features:
- Multi-select class picker
- Automatic student enrollment resolution
- Manual add/remove individual students
- Real-time selected students counter
- Due date picker (optional)
- Progress indicator during issuing

### 4. Submission Simulator

**Location**: `prototypes/teacher-center-unified.html` - Submission Simulator section

For testing purposes, teachers can:
- Select an assignment instance
- Enter a goal code
- Set a score (0-100)
- Create a test submission
- Automatically create progress entries

## Database Schema

**File**: `supabase/schema/002_phase_a_assignments.sql`

### Tables

#### assignments
```sql
id bigserial primary key
title text not null
type assignment_type (enum: 'html', 'google_form')
series text
page text (URL to assignment)
hero text (hero image URL)
meta jsonb (extensible metadata)
created_by text
created_at timestamptz
```

#### assignment_instances
```sql
id uuid primary key
assignment_id bigint FK -> assignments.id
student_id uuid FK -> students.id
assigned_at timestamptz
due_at date
status text ('Assigned', 'In Progress', 'Submitted', 'Graded')
settings jsonb
```

#### submissions
```sql
id uuid primary key
instance_id uuid FK -> assignment_instances.id
submitted_at timestamptz
answers jsonb
score_auto numeric
score_manual numeric
score_total numeric
detail jsonb (includes per_goal breakdown)
notes text
```

### RPC Functions

#### process_submission(p_submission_id uuid)
Automatically creates progress entries from submission detail.per_goal data.

For each goal code in detail.per_goal:
1. Looks up the goal by code for the student
2. Creates a progress_entry with the score
3. Sets method='Assignment', via='assignment'

## Data Adapter Functions

**File**: `web/data-adapter.js`

### Storage Functions

#### uploadAssignmentZip(file, manifest, createdBy)
- Validates and creates assignment from ZIP manifest
- Returns assignment object with metadata
- **Note**: Actual file upload to Supabase Storage requires additional implementation

#### saveFormMeta(assignmentId, meta)
- Merges new metadata with existing assignment meta
- Used for storing Google Form URLs and answer keys
- Uses parameterized queries to prevent SQL injection

### Class Functions

#### listClasses()
- Returns all classes from database
- Falls back to stub data in local mode

#### listClassEnrollments()
- Returns array of { class_id, student_id, student_code }
- Used to resolve class selections to student lists

### CSV Import

#### importResponsesFromCSV(assignmentId, csvData, answerKey)
- Processes Google Form responses from CSV
- Auto-grades based on answer key
- Creates submissions with per_goal detail
- Calls process_submission for each row

## Security Considerations

### Fixed Issues
✅ SQL injection in saveFormMeta (now uses parameterized queries)
✅ XSS in submission simulator (HTML escaping added)
✅ Missing SRI on JSZip CDN (integrity hash added)

### Known Limitations
⚠️ RLS policies use basic authenticated access - needs user/role-based filtering for production
⚠️ CSV import uses sequential processing - consider batching for large files
⚠️ File upload to Supabase Storage is documented but not fully implemented

## Usage Examples

### Creating an HTML Assignment

1. Select "HTML Package" type
2. Enter title and optional metadata
3. Choose ZIP file containing assignment.json
4. Review manifest preview
5. Click "Create Assignment"

### Creating a Google Form Assignment

1. Select "Google Form" type
2. Enter title and form URL
3. (Optional) Add answer key JSON
4. (Optional) Add IEP goal codes
5. Click "Create Assignment"

### Issuing to Classes

1. Select an assignment
2. Choose one or more classes
3. Click "Add Students from Selected Classes"
4. Review selected students list
5. Set due date (optional)
6. Click "Issue to Selected Students"

### Testing with Simulator

1. Select an instance from dropdown
2. Enter a goal code (e.g., S001.11.1)
3. Set a score (0-100)
4. Click "Simulate Submission"
5. Check result message and instances table

## Browser Compatibility

- Modern browsers with ES6+ support
- JSZip library loaded from CDN (with fallback notification)
- Supabase library loaded from CDN (with fallback to localStorage)
- Local mode works without external dependencies

## Future Enhancements

- Complete Supabase Storage file upload implementation
- Batch CSV import for better performance
- Enhanced RLS policies with role-based access
- Student-facing assignment viewer
- Real-time grading interface
- Progress analytics dashboard
