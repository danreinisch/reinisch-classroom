# IEP Section Spec — Teacher Center

This document captures the structure, fields, and layout of the SpedTrack IEP system based on screenshot analysis. It serves as the foundation for building the IEP section in the Teacher Center.

## Overall Structure

- **Source system**: SpedTrack (web-based IEP management)
- **URL pattern**: `winfield.spedtrack.com/iep/IEP.aspx?iid={id}&tab={tabname}`
- **15 tabs** in the IEP interface, arranged in two rows

### Header Bar (Purple)
- Student name (Last, First)
- IEP type (e.g., "Active Annual IEP", "Inactive Initial IEP")
- Date range (start - end)
- Case Manager name

### Action Toolbar
- Student Record | Print | Email | Make Draft | Amend IEP | Copy to New IEP | Errors/Warnings | History

### Tab Navigation (Two Rows)
Row 1: Checklist | Meetings | Participants | Notices | Services/IEP Dates | Present Levels | Special Considerations | Goals | Transportation | Reg Ed Participation | Placement | Class Accom/Mod
Row 2: Other Forms | Attachments | Progress

- Tabs show counts when applicable, e.g., "Notices (1)", "Other Forms (4)", "Attachments (1)"
- Completed tabs show a green checkmark icon

---

## Tabs Fully Documented

### 1. Checklist

**Table columns**: Item | Due Date | Days Left | Completed | Completed By | Outcome | Notes

- Each row has an edit icon
- Green checkmark for completed items
- Completed date can be highlighted yellow if completed late
- Notes column can show "Auto-completed" for system-generated completions

**Typical checklist items**:
- Send Notification of Meeting for IEP Meeting
- Send Second Notification of Meeting for IEP Meeting
- Hold IEP Meeting
- Annual IEP Due Date
- Provide Copy of IEP to Parents

### Key Dates & Student Demographic Data (Sub-section under Checklist)

**Key Dates fields**:
- Date of IEP Meeting
- Projected Date of Annual IEP Review
- Date of Previous IEP Review
- Date of Most Recent Evaluation/Reevaluation
- Projected Date for Next Triennial Evaluation
- Date IEP Provided to Parent
- Date Procedural Safeguards Provided

**Visual Timeline**: Horizontal timeline showing milestones with dates:
- Most Recent Eval/Reeval
- Previous IEP Review
- Procedural Safeguards Provided
- IEP Meeting
- IEP Provided to Parent
- Projected Annual IEP Review
- Projected Next Triennial Eval

**Student Demographic Data fields**:
- Language (dropdown)
- Address 1
- Address 2
- City
- State (dropdown)
- Zip
- Home Phone

Note: *"Some of these dates may autofill from the Student Record or the Checklist above."*

---

### 2. Notices

#### List View
**Table columns**: Date | Action
- Each row has a magnifying glass icon (view/edit) and a green status indicator
- Tab label shows count: "Notices (1)"

#### Detail View (IEP Notice of Action)

**Fields**:
- **Date Notice Provided** (*) — date field
- **Method of Provision** — radio buttons:
  - Personally Presented
  - Mailed
  - Emailed
  - Hand carried by student
  - Other:
- **Type** (*) — checkboxes (multi-select):
  - Initial Evaluation
  - Reevaluation (With Assessment)
  - Ineligibility for services
  - Change of services
  - Change in Eligibility
  - Initial Eligibility
  - Initial services
  - Initial placement
  - Change of placement
  - Graduation with regular diploma
  - Other:
- **Proposed/Refused Above Action(s)** — radio:
  - Proposed
  - Refused
- **Explanation of Action** — large text area (the reason(s) for the proposal or refusal)
- **Options Considered and Why Rejected** — large text area
- **Basis for the Action** (*) — large text area
  - Helper: *"Information may come from a current IEP, Diagnostic Data, Testing, Parent Records/Reports, etc."*
- **Other Factors Relevant to the Action** — large text area
- **Contact Name** — text
- **Contact Title** — text
- **Contact Phone Number** — text

**Required Signatures section**:
- Checkbox: "Consent REQUIRED for Action to be Carried Out (check if signature required)"
- Green banner: *"PARENT SIGNATURE FOR CONSENT IS REQUIRED before the following actions can be initiated"*
- Checkboxes:
  - Initial evaluation (with assessment* or without assessment)
  - Initial Services
  - Reevaluation (with assessment*)
- Date signed consent received by public agency — *"This date will auto-print if the form is signed electronically"*

**Waiver of 10 Days for the Initiation of Action**:
- Checkbox with legal text: *"Parent: I understand that the action being proposed cannot be carried out for ten days from the date of the Notice, unless I waive that time requirement..."*

---

### 3. Services/IEP Dates

#### IEP Dates Table
**Columns**: Title | Start Date | End Date | Building | Grade | Total Minutes | Min Out | % In | % Out

- Date ranges can be split across the IEP period (e.g., grade 11 for first semester, grade 12 for second)
- Total Minutes and Min Out are used to calculate % In and % Out

#### Services Table
**Columns**: Name | Sped Min/Week | Frequency | Provider | Start | End

- Each row has a radio button and magnifying glass (view/edit) icon
- Services can change mid-IEP (different date ranges with different minutes)
- Example services:
  - "Specialized Instruction in Mathematics Problem Solving Skills" — 245 min/week
  - "Specialized Instruction in Written Expression" — 735 min → later 245 min

#### Parent and School Personnel Support Table
**Columns**: Title | Minutes | Frequency | Start Date | End Date

#### Supplementary Aids/Services Table
**Columns**: Aid/Service | Minutes | Frequency | Location | Start Date | End Date

#### Service Detail Form (Edit/Add)

**Fields**:
- **Dates** (*) — checkbox to select which IEP date range applies (e.g., "IEP Dates (2/25/25 - 2/24/26)")
- **Service** (*) — dropdown (e.g., "Specialized Instruction in Reading Co...")
- **Service Type** (*) — dropdown (e.g., "Special Ed")
- **Location** (*) — dropdown (e.g., "Regular Classroom")
- **Primary Provider** — dropdown
- **Secondary Providers** — two additional dropdowns
- **Service Amount** — number + frequency dropdown (e.g., "25 minutes Weekly")
  - Helper: *"Please enter the amount of minutes to be provided in a specified interval (e.g. 90 minutes per Week). This will be used for calculations & reporting."*
- **Amount/Frequency** (*) — dropdown (e.g., "25 minutes weekly")
  - Helper: *"This field will print on the IEP and allows detailed specifics of how the service will be provided (e.g. '30 minutes 3x per week')."*
- **Placement Information** — *"Used for calculating time in or out of the regular classroom"*
  - Min/Week | Inside (radio) / Outside (radio) | Reg Class (number)
  - Helper: *"This will not print. Only used for calculating the percentage of time in/out of the classroom."*
- **Notes** — large text area

---

### 4. Present Levels (PLEP)

A long-form page with multiple narrative sections. Each section has a **guidance prompt** (in a bordered box) followed by a **large text area**.

**Section 1 — How the disability affects involvement/progress**
- Prompt: *"How the child's disability affects his/her involvement and progress in the general education curriculum; or for preschool children, participation in age-appropriate activities. (For students with transition plans, consider how the student's disability will affect the child's ability to reach his/her post-secondary goals...) For children with the most significant cognitive disabilities, describe how the disability impacts the child's access to the general education curriculum and how the alternate standards are appropriate."*

**Section 2 — Strengths of the child**
- Prompt: *"The strengths of the child. (For students with transition plans, consider how the strengths of the child relate to the student's post-secondary goals.)"*

**Section 3 — Parent/guardian concerns**
- Prompt: *"Concerns of the parent/guardian for enhancing the education of the student. (For students with transition plans, consider the parent/guardian's expectations for the student after the student leaves high school.)"*

**Section 4 — Changes in current functioning**
- Prompt: *"Changes in current functioning of the student since the initial or prior IEP. (For students with transition plans, consider how the changes in the child's current functioning will impact the student's ability to reach his/her post-secondary goals.)"*
- Contains per-goal-area narratives with current performance data

**Section 5 — Summary of most recent evaluation/re-evaluation results**
- Prompt: *"A summary of the most recent evaluation/re-evaluation results."*
- Contains evaluation history, testing instruments (e.g., WISC-V scores), eligibility determination

**Section 6 — MAP-A guidance (alternative standards)**
- Prompt: *"Once the IEP team determines that the student is unable to access the regular curriculum and that a curriculum based on alternative standards is appropriate (MAP-A guidance), complete this section by describing the following:"*
- Sub-prompts:
  - How the student demonstrates the most significant cognitive disabilities and limited adaptive skills that may be combined with physical or behavioral limitations.
  - How the most significant cognitive disability impacts the student's access to the curriculum and requires specialized instruction.
  - How the most significant cognitive disability impacts the student's post-school outcomes.
  - Any additional factors considered. (The student's inability to participate in the general education assessment must be primarily the result of the most significant cognitive disability and NOT excessive absences; visual or auditory disabilities; or social, cultural, language, or economic differences.)

**Section 7 — Alternative assessments**
- Prompt: *"Please select one of the following for students determined eligible for alternative assessments"*
- Checkbox: "Objectives/benchmarks are on goal page(s)"
- Checkbox: "Objectives/benchmarks described below:" → text area

---

### 5. Special Considerations

A checklist-style form with Yes/No questions, each with conditional follow-up content.

**Question 1 — Is the student blind or visually impaired?**
- No / Yes → If yes, complete Form A: Blind and Visually Impaired.

**Question 2 — Is the student deaf or hearing impaired?**
- No / Yes → If yes, expanded text about language/communication considerations.

**Question 3 — Does the student exhibit behaviors that impede his/her learning or that of others?**
- No / Yes → If yes, expanded text about positive behavior interventions.
- **Explain:** (text area)

**Question 4 — Does the student have limited English proficiency?**
- No / Yes → If yes, language needs addressed, WIDA-ACCESS noted.

**Question 5 — Does the student have communication needs?**
- No / Yes → If yes, communication needs addressed in IEP.

**Question 6 — Does the student require Assistive Technology device(s) and/or services?**
- No / Yes → If yes, AT needs addressed in IEP.
- **Explain:** (text area)

**Question 7 — Extended School Year**
- No, the student is not eligible for ESY services.
- Yes, the student is eligible for ESY services. Complete Form B (if IEP Amendment, attach IEP Amendment Form)
- The need for ESY services will be addressed at a later date. Will be addressed by: (month/day/year)

**Question 8 — Transfer of Rights**
- Guidance: *"Notification must be given beginning not later than one year before the student is 18..."*
- N/A for this student/IEP
- Notification was given: (month/day/year)

**Question 9 — State Assessments**
- Guidance: *"IDEA requires students with disabilities to participate in the following state assessments:"*
- Checkboxes:
  - Grade-Level Assessment for Grades 3-8 (Form D-1) (NA for MAP-A eligible)
  - End of Course (EOC) Exams (Form D-2) (NA for MAP-A-eligible)
  - MAP-A for eligible students in grades 3-8, 11 (Form D-3)
  - WIDA ACCESS for EL students in grades K-12 (Form D-4)
  - NAEP / International Assessments for selected students (Form D-5) (NA for MAP-A eligible)
- OR:
  - No statewide assessment is required for this student at this time
  - No further assessment is required, student meets all state assessment participation requirements

**Question 10 — District-wide Assessments**
- No / Yes → If yes, Complete Form E.

**Question 11 — Post-secondary Transition Services**
- Guidance: *(Must be included not later than the first IEP to be in effect when the child turns 16, and updated annually thereafter.)*
- No (Child will not turn sixteen while this IEP is in effect.)
- Yes → Complete Form C – Post-secondary Transition Plan

**Question 12 — Alternate Method of Instruction (AMI) plan**
- This district is choosing to utilize AMI for up to 36 instructional hours → documented on Form G.
- This district is not using AMI.

---

### 6. Goals

#### List View
**Table columns**: # | Area | Goal | Implementer
- Each row has a magnifying glass (view/edit) icon and a green status indicator
- Green status = complete/active

#### Goal Detail Form

**Fields**:
- **Progress Monitoring** (*) — radio: Yes / No
  - Note: *"If you want to change Measured At, you will need to abandon this goal, and create a new one."*
- **Area** (*) — dropdown with 22+ options:
  - Life Skills Writing Skills, Listening Comprehension, Math Calculation, Math Problem Solving, Math Skills, Oral Expression, OT, Pragmatics, Pre Academic Math Skills, Pre Academic Reading, Pre Academic Written Expression, Preacademic, PT, Readiness Skills, Reading Comprehension, Reading Fluency, Reading Skills, Receptive Language, Social Skills, Social/Emotional (ECSE), Speech, Written Expression
- **Goal** (*) — large text area
- **Short Description** (*) — text (often auto-filled from Area)
- **Primary Implementer** (*) — dropdown
- **Data Collector** — two dropdowns
- **Frequency** (*) — dropdown (e.g., "Quarterly")
- **Reporting Duration** — radio: School Year Only / School Year & ESY
- **Dates** — Begin / End
  - Helper: *"Leave blank if same as IEP dates"*
- **Measurement Type** (*) — dropdown (e.g., "Percent")
- **Measured At** — radio options:
  - **Goal** — Measures a single data point over the course of the IEP (e.g., 80% by the end of the IEP)
  - **Benchmark** — Measures a single data point over the course of the IEP (e.g., 50% by end of Q1, 60% by end of Q2 etc)
  - **Objective** — Measures multiple data points over the course of the IEP (e.g., 1-digit multiplication, 3-digit subtraction, etc)
  - Helper: *"The choice of what data will be recorded throughout the year is independent of how your state is setup to report on the quarterly Progress Report."*
- **Baseline** (*) — number (e.g., 0)
- **Mastery** (*) — number (e.g., 80) + dropdown (e.g., "One Attempt")
- **Missouri Learning Standards** — reference links grid:
  - ELA: K to 5 | Science: K to 5 | MAP Alternate Crosswalk: ELA
  - ELA: 6 to 12 | Science: 6 to 12 | MAP Alternate Crosswalk: Math
  - Math: K to 5 | Social Studies: K to 5 | MAP Alternate Crosswalk: Science
  - Math: 6 to 12 | Social Studies: 6 to 12 | Early Learning Standards
- **Standard** — text area

---

## Tabs Still Needed

The following tabs have NOT yet been documented from screenshots:

- [ ] Meetings
- [ ] Participants
- [ ] Transportation
- [ ] Reg Ed Participation
- [ ] Placement
- [ ] Class Accom/Mod
- [ ] Other Forms
- [ ] Attachments
- [ ] Progress

---

## Design Notes for Teacher Center Implementation

### Navigation Concept
- When user selects "IEP" in the Teacher Center, the left-hand sidebar collapses upward
- Replaced by IEP sub-menu (PLEP, Goals, Service Summary, etc.)
- User can toggle back via a compact icon/text element at the top

### Key Improvements Over SpedTrack
- Modern UI with better responsiveness
- Integration with classroom assignments (link IEP goals to assignments)
- Goal progress tracking built into the assignment workflow
- Streamlined data entry with smart defaults

(*) = required field