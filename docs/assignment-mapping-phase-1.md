# Assignment Mapping Phase 1 - Documentation

## Overview

Assignment Mapping Phase 1 enables per-question mapping to DESE Standards and IEP Goal Codes with immediate submission scoring and progress tracking. This system supports:

- **HTML Package** assignments with embedded manifest
- **TXT Quick Quiz** assignments with simple text-based mapping
- **Google Form** integration (coming in Phase 2)

## TXT Mapping Format

TXT mapping files use a simple pipe-delimited format:

### Format Specification

```
#question_ref|points|correct|dese_codes|goal_codes|notes
```

### Field Descriptions

1. **question_ref** (required): Unique identifier for the question (e.g., `Q1`, `Q2`, `#1`)
   - Can optionally start with `#` (will be stripped)
   - Must be unique within the assignment

2. **points** (required): Maximum points for the question
   - Must be a non-negative number
   - Can be decimal (e.g., `1.5`, `2.0`)

3. **correct**: Correct answer(s)
   - For MCQ: single value (e.g., `A`, `Option 1`)
   - For Multi-select: semicolon-separated values (e.g., `A;B;C`)
   - For Boolean: `true` or `false` (case-insensitive)
   - For Constructed: empty or `-` (uses keyword-based scoring)

4. **dese_codes**: DESE standard codes (semicolon-separated)
   - Format: `MA.8.EE.1;MA.8.EE.2`
   - Can be empty or `-`

5. **goal_codes**: IEP goal codes (semicolon-separated)
   - Format: `MATH.1;MATH.2;READ.5`
   - Can be empty or `-`

6. **notes**: Optional notes/description
   - Free text field

### Example TXT Mapping File

```txt
# Assignment: Math Assessment Week 1
# Created: 2025-11-08

# Basic MCQ questions
Q1|1|A|MA.8.EE.1|MATH.1|Solve linear equations
Q2|1|B|MA.8.EE.2|MATH.1;MATH.2|Identify slope from equation
Q3|1|C|MA.8.F.1|MATH.3|Graph linear functions

# Multi-select question
Q4|2|A;C;D|MA.8.EE.3|MATH.2|Select all expressions that simplify correctly

# Boolean question
Q5|1|true|MA.8.G.1|MATH.4|True/false: All squares are rectangles

# Constructed response (keyword-based)
Q6|3|-|MA.8.EE.4;MA.8.F.2|MATH.1;MATH.5|Explain the relationship between slope and y-intercept

# Question with no goal mapping
Q7|1|D|MA.8.NS.1|-|Number sense warm-up

# Question with no DESE mapping
Q8|1|B|-|SOCIAL.1|Collaboration question
```

### Comments

- Lines starting with `#` (without a `|` delimiter) are treated as comments
- Empty lines are ignored
- Comments can be used for section headers or metadata

### Answer Type Detection

The system automatically infers answer type based on the `correct` field:

- **MCQ**: Single value that's not true/false
- **Multi**: Contains semicolon (`;`) separator
- **Boolean**: Exactly `true` or `false` (case-insensitive)
- **Constructed**: Empty, `-`, or null

## JSON Manifest Format

JSON manifests provide more control and support advanced scoring configurations.

### Schema

```json
{
  "title": "Assignment Title",
  "version": "1.0",
  "items": [
    {
      "ref": "Q1",
      "answer_type": "mcq",
      "points": 1,
      "correct": "A",
      "dese_codes": ["MA.8.EE.1"],
      "goal_codes": ["MATH.1", "MATH.2"],
      "notes": "Optional description"
    }
  ]
}
```

### Field Descriptions

#### Top-Level Fields

- **title** (optional): Assignment title
- **version** (optional): Manifest version
- **items** (required): Array of item objects

#### Item Fields

- **ref** (required): Unique question identifier
- **answer_type** (required): One of:
  - `mcq`: Multiple choice (single selection)
  - `multi`: Multiple selection
  - `boolean`: True/false
  - `constructed`: Constructed response
- **points** (required): Maximum points (number)
- **correct** (optional): Correct answer(s)
  - MCQ: string (e.g., `"A"`)
  - Multi: array of strings (e.g., `["A", "C", "D"]`)
  - Boolean: boolean (e.g., `true`)
  - Constructed: not used (scoring via keywords)
- **dese_codes** (optional): Array of DESE standard codes
- **goal_codes** (optional): Array of IEP goal codes
- **scoring** (optional): Scoring configuration object
  - For constructed responses:
    ```json
    {
      "keywords": ["slope", "intercept", "equation"],
      "min_keywords": 2
    }
    ```
- **notes** (optional): Description or notes

### Example JSON Manifest

```json
{
  "title": "Math Assessment Week 1",
  "version": "1.0",
  "items": [
    {
      "ref": "Q1",
      "answer_type": "mcq",
      "points": 1,
      "correct": "A",
      "dese_codes": ["MA.8.EE.1"],
      "goal_codes": ["MATH.1"],
      "notes": "Solve linear equations"
    },
    {
      "ref": "Q2",
      "answer_type": "multi",
      "points": 2,
      "correct": ["A", "C", "D"],
      "dese_codes": ["MA.8.EE.3"],
      "goal_codes": ["MATH.2"],
      "notes": "Select all that apply"
    },
    {
      "ref": "Q3",
      "answer_type": "boolean",
      "points": 1,
      "correct": true,
      "dese_codes": ["MA.8.G.1"],
      "goal_codes": ["MATH.4"]
    },
    {
      "ref": "Q4",
      "answer_type": "constructed",
      "points": 3,
      "dese_codes": ["MA.8.EE.4", "MA.8.F.2"],
      "goal_codes": ["MATH.1", "MATH.5"],
      "scoring": {
        "keywords": ["slope", "intercept", "linear", "equation", "graph"],
        "min_keywords": 2
      },
      "notes": "Explain the relationship between slope and y-intercept"
    }
  ]
}
```

## HTML Inline Mapping Convention (`data-rc-*` Attributes)

HTML assignment authors can embed mapping data directly in their markup using data attributes
on question container elements.  When `detectQuestionsFromHTML()` finds `[data-qref]` elements
it extracts all of these attributes and builds a fully-mapped question object — no sidecar file needed.

### Attribute Reference

| Attribute | Required | Default | Description | Example |
|---|---|---|---|---|
| `data-qref` | Yes | — | Unique question reference | `data-qref="Q1"` |
| `data-points` | No | `1` | Max points for the question | `data-points="2"` |
| `data-correct` | No | — | Correct answer(s); semicolon-separated for multi-select | `data-correct="B"` or `data-correct="A;C;D"` |
| `data-answer-type` | No | auto-detected | One of: `mcq`, `multi`, `boolean`, `constructed` | `data-answer-type="constructed"` |
| `data-dese` | No | — | DESE standard codes, semicolon-separated | `data-dese="MA.8.EE.1;MA.8.EE.2"` |
| `data-goal` | No | — | IEP goal codes, semicolon-separated | `data-goal="MATH.1;MATH.2"` |

### Answer-Type Auto-Detection

When `data-answer-type` is omitted the type is inferred from `data-correct` using the same
rules as the TXT mapping pipeline:

| `data-correct` value | Detected type |
|---|---|
| empty or `-` | `constructed` |
| contains `;` | `multi` |
| `true` or `false` (any case) | `boolean` |
| anything else | `mcq` |

Providing `data-answer-type` explicitly overrides auto-detection.

### Example Annotated HTML

```html
<div data-qref="Q1" data-points="1" data-correct="B" data-dese="MA.8.EE.1" data-goal="MATH.1">
  <p>1. What is 2 + 2?</p>
  <label><input type="radio" name="Q1" value="A"> 3</label>
  <label><input type="radio" name="Q1" value="B"> 4</label>
</div>

<div data-qref="Q2" data-points="2" data-correct="A;C;D" data-dese="MA.8.EE.3" data-goal="MATH.2">
  <p>2. Select all that simplify correctly</p>
  <label><input type="checkbox" name="Q2" value="A"> Option A</label>
  <label><input type="checkbox" name="Q2" value="C"> Option C</label>
  <label><input type="checkbox" name="Q2" value="D"> Option D</label>
</div>

<div data-qref="Q3" data-points="1" data-correct="true" data-dese="MA.8.G.1" data-goal="MATH.4">
  <p>3. All squares are rectangles. True or False?</p>
  <label><input type="radio" name="Q3" value="true"> True</label>
  <label><input type="radio" name="Q3" value="false"> False</label>
</div>

<div data-qref="Q4" data-points="3" data-answer-type="constructed"
     data-dese="MA.8.EE.4;MA.8.F.2" data-goal="MATH.1;MATH.5">
  <p>4. Explain the relationship between slope and y-intercept.</p>
  <textarea name="Q4"></textarea>
</div>
```

## HTML Question Detection Strategy

`detectQuestionsFromHTML()` applies detection passes in priority order.  Each pass only runs
if all previous passes found zero questions.

| Pass | Selector / Strategy | Notes |
|---|---|---|
| 1 | `[data-qref]` | Full inline attribute extraction (points, correct, DESE, goal codes) |
| 2 | `input[name], select[name], textarea[name]` | Names matching `/^Q\d+$/i` or `/^question/i`; grouped by name |
| 3 | `fieldset` with `legend` | Legend text becomes the question label |
| 4 | `ol > li` | Each `<li>` longer than 10 chars becomes a question |
| 5 | `.question`, `[class*="q-"]`, `[id^="q-"]`, `[id^="question"]`, `[data-question]` | Common class/ID patterns |
| 6 | `table tr` | Rows whose first `td`/`th` matches `/^\d+[.)\s]/` or `/^Q\d+/i` |
| 7 | `p, div.question, section, article, li` | Legacy block-element fallback (10–500 char filter) |



HTML packages can include an `assignment_manifest.json` file in the ZIP root:

```
assignment.zip
├── assignment_manifest.json  (uses JSON format above)
├── index.html
├── styles.css
└── images/
    └── hero.jpg
```

Alternatively, you can upload a separate mapping file (TXT or JSON) when creating the assignment.

## Scoring

### Phase 1 Scoring Rules

1. **MCQ**: Case-insensitive exact match
2. **Boolean**: Accepts variations (true/t/1/yes vs false/f/0/no)
3. **Multi-select**: Order-agnostic set equality (all-or-nothing, no partial credit)
4. **Constructed**: Keyword-based
   - Full credit if student answer contains >= N keywords (default 2)
   - Zero credit otherwise
   - Keywords from `scoring.keywords` array
   - Configurable threshold via `scoring.min_keywords`

### Goal and Standard Rollups

Phase 1 awards **full credit** to each mapped goal/standard (no weighting split):

- If a question is worth 2 points and maps to MATH.1 and MATH.2:
  - Both MATH.1 and MATH.2 get 2 points toward their totals
- Percent_correct is computed per goal/standard across all mapped questions

### Progress Tracking

After submission is scored:
1. System computes percent_correct for each goal_code
2. Inserts a `goal_progress` entry for each goal with:
   - `value`: percent_correct (0-100)
   - `source`: 'assignment'
   - `date`: submission date
3. Multiple submissions on the same day create separate progress entries (explicit history)

## Version Lock

Once a student submits an assignment:
- The assignment is **version locked**
- Mapping cannot be edited
- UI displays a warning with guidance to create a new version

This prevents retroactive changes that would invalidate submitted results.

## Performance Target

Phase 1 supports up to **300 questions** per assignment with a scoring target of **< 300ms** on typical server hardware.

Validation will warn if an assignment exceeds 300 items.

## Feature Flag

The Assignment Mapping V1 feature is controlled by the feature flag:

```javascript
setFeatureFlag('assignmentMappingV1', true);
```

Default: `false` (dark launch until review complete)

## Limitations (Phase 1)

- Google Form ingestion not yet implemented (Phase 2)
- No partial credit for multi-select questions
- Constructed response scoring is basic (keyword-based only)
- Weighting is always 1.0 (full credit duplication)
- No advanced analytics or reporting dashboards

## Next Steps (Future Phases)

- Phase 2: Google Form webhook integration
- Advanced constructed-response scoring (NLP, rubrics)
- Weighted mapping (split credit across goals)
- Partial credit for multi-select
- Enhanced analytics and dashboards
