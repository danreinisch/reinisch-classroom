# Teacher Center Assignments - Student Portal Integration Guide

## Overview
This guide explains how to verify that assignments created via the Teacher Center are accessible in the Student Portal.

## Prerequisites
- Teacher Center Assignments feature flag enabled: `teacherCenterAssignments = true`
- Supabase configured and connected
- At least one assignment created via Teacher Center

## Verification Steps

### 1. Create an Assignment in Teacher Center
1. Navigate to Hub → Work → Assignments
2. Fill in assignment details:
   - Title: "Test Assignment"
   - Type: "HTML Package" or "TXT Quick Quiz"
   - Upload source file(s)
   - (Optional) Upload mapping file for question mapping
3. Click "Create Assignment"
4. Verify assignment appears in the assignments list

### 2. Issue Assignment to Students
1. In the "Issue Assignment" section:
   - Select the test assignment
   - Select one or more students
   - (Optional) Set due date
2. Click "Issue to Selected Students"
3. Verify success notification

### 3. Verify in Student Portal
1. Navigate to Student Portal (click "Student Portal" button in header)
2. Sign in as a student who was assigned the assignment
3. Look for the assignment in the assignments list/dashboard
4. Click on the assignment card
5. Verify the assignment opens correctly:
   - For HTML Package: Assignment page loads from Supabase Storage URL
   - For TXT Quick Quiz: Quiz form displays with questions from mapping
   - For URL-based: External URL loads correctly

## Expected Behavior

### Assignment Display
- Assignment card should show:
  - Title
  - Type/source indicator
  - Due date (if set)
  - Status (not started, in progress, submitted)
- Card should be clickable to open the assignment

### Assignment Page
- **HTML Package**: Opens assignment in iframe or new tab from Supabase Storage URL
- **TXT Quick Quiz**: Displays auto-generated quiz form based on mapping
- **URL-based**: Opens external URL in iframe or new tab

### Mapping Integration
If a mapping file was uploaded:
- Questions should be tagged with DESE standards and IEP goal codes
- Upon submission, student responses should be scored automatically
- Goal progress entries should be created for mapped goals

## Current Implementation Status

### ✅ Complete
- Teacher Center UI for creating assignments
- Support for 3 assignment source types (URL, Single HTML, ZIP)
- Mapping file upload and preview
- Assignment data model (assignments table)

### ⚠️ Needs Verification
- Student Portal assignment display
- Assignment opening/launching from Student Portal
- Assignment instance creation when issuing to students
- Supabase Storage integration for file uploads

### 📝 Implementation Notes
The existing hub already has extensive assignment creation and issuing functionality. The Teacher Center Assignments feature enhances this with:
1. Mapping support for DESE standards and IEP goal codes
2. TXT Quick Quiz type for rapid quiz creation
3. Enhanced validation and preview

## Troubleshooting

### Assignment Not Visible in Student Portal
1. Verify assignment was successfully created (check database)
2. Verify assignment was issued to the student (check assignment_instances table)
3. Check student portal's assignment loading logic (may need to query assignments table)

### Assignment Page Not Loading
1. Verify `assignments.page` column contains valid URL
2. For Supabase Storage URLs, verify:
   - File was uploaded successfully
   - Public URL is accessible
   - Bucket permissions allow public read

### Mapping Not Working
1. Verify `assignment_items` table has entries for the assignment
2. Verify `assignment_item_mappings` table has goal/standard mappings
3. Check that mapping was parsed successfully (no validation errors)

## Database Schema Reference

### Key Tables
- `assignments`: Master assignment definitions
- `assignment_items`: Individual questions/items (Phase 1 mapping)
- `assignment_item_mappings`: DESE standards and goal code mappings
- `assignment_instances`: Assignment issuance to specific students
- `submissions`: Student submission records
- `submission_answers`: Per-item answers (Phase 1)

### Required Columns
- `assignments.page`: URL to assignment HTML page
- `assignments.type`: 'html', 'txt_quiz', 'google_form'
- `assignments.meta`: JSON with source info (e.g., `{ source: 'url', originalUrl: '...' }`)

## Next Steps
To fully integrate with Student Portal:
1. Verify student portal assignment loading query includes new assignments
2. Add UI to launch/open assignments from student portal
3. Test end-to-end flow: create → issue → view → submit → score
4. Verify goal progress entries are created after submission
