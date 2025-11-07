-- ============================================================================
-- Roster CSV Inline Ingest (Safe)
-- ============================================================================
-- Purpose: Import class roster data from inline CSV into canonical classes
--          and class_enrollments tables.
-- 
-- Usage: Paste your roster CSV data into the $roster$ block below, then run
--        this script in the Supabase SQL Editor.
--
-- Expected CSV format:
--   Student Code Name,Class,...
--   S001 John Doe,LA1,LA2
--   S002 Jane Smith,LSLA,LS
--
-- Features:
--   - Creates temporary staging tables
--   - Canonicalizes class names to standard codes
--   - Inserts classes first (FK-safe)
--   - Inserts enrollments with proper class_id + student_id
--   - Updates students.class_code (primary) based on first-seen enrollment
--   - Reports unmapped class aliases
--
-- Safety: This script does NOT modify constraints or drop existing data.
--         Multiple runs are safe (upserts will update existing records).
-- ============================================================================

DO $$
DECLARE
  roster_csv TEXT := $roster$
-- ============================================================================
-- REPLACE THE SAMPLE DATA BELOW WITH YOUR ACTUAL ROSTER CSV
-- ============================================================================
-- Expected format: Student Code Name,Class1,Class2,Class3,...
--   - First column: Student code and name (e.g., "S001 John Doe")
--   - Remaining columns: Class codes (comma-separated)
-- Example rows shown below - DELETE THESE and paste your actual roster data
-- ============================================================================
Student Code Name,Class
S001 John Doe,LA1,LA2
S002 Jane Smith,LSLA,LS
S003 Bob Brown,LA3
S004 Alice Green,ELA101,ALG1
S005 Charlie White,GEOM,CMATH
S006 Diana Black,SPEECH
S007 Eve Gray,WARRIOR
S008 Frank Blue,LS,LA3
$roster$;

  line TEXT;
  lines TEXT[];
  student_code_name TEXT;
  student_code TEXT;
  student_name TEXT;
  class_list TEXT;
  class_code_raw TEXT;
  class_code_canonical TEXT;
  class_codes TEXT[];
  unmapped_aliases TEXT[] := ARRAY[]::TEXT[];
  i INT;
  
BEGIN
  -- Create temporary staging tables
  DROP TABLE IF EXISTS temp_roster_staging;
  CREATE TEMP TABLE temp_roster_staging (
    student_code TEXT,
    student_name TEXT,
    class_codes TEXT[]
  );

  DROP TABLE IF EXISTS temp_class_alias_map;
  CREATE TEMP TABLE temp_class_alias_map (
    alias TEXT PRIMARY KEY,
    canonical TEXT NOT NULL
  );

  -- Populate class alias mapping
  -- Format: alias -> canonical code
  -- Canonical codes: LA1, LA2, LA3, LA4, LSLA, LS, ELA101, ALG1, GEOM, CMATH, SPEECH, WARRIOR
  INSERT INTO temp_class_alias_map (alias, canonical) VALUES
    ('LA1', 'LA1'),
    ('LA2', 'LA2'),
    ('LA3', 'LA3'),
    ('LA4', 'LA4'),
    ('LSLA', 'LSLA'),
    ('LS', 'LS'),
    ('Life Skills', 'LS'),
    ('ELA101', 'ELA101'),
    ('ALG1', 'ALG1'),
    ('GEOM', 'GEOM'),
    ('CMATH', 'CMATH'),
    ('SPEECH', 'SPEECH'),
    ('WARRIOR', 'WARRIOR'),
    ('Language Arts 1', 'LA1'),
    ('Language Arts 2', 'LA2'),
    ('Language Arts 3', 'LA3'),
    ('Language Arts 4', 'LA4'),
    ('Life Skills LA', 'LSLA')
  ON CONFLICT (alias) DO NOTHING;

  -- Parse CSV into staging table
  lines := string_to_array(roster_csv, E'\n');
  
  -- Skip header line (first line)
  FOR i IN 2..array_length(lines, 1) LOOP
    line := lines[i];
    
    -- Skip empty lines
    IF line IS NULL OR trim(line) = '' THEN
      CONTINUE;
    END IF;
    
    -- Parse line: first column is "Student Code Name", rest are class codes
    -- Split by comma
    student_code_name := split_part(line, ',', 1);
    class_list := substring(line from length(split_part(line, ',', 1)) + 2); -- Rest after first comma
    
    -- Extract student code (first token) and name (rest)
    student_code := split_part(student_code_name, ' ', 1);
    student_name := trim(substring(student_code_name from length(student_code) + 2));
    
    -- If name is empty, use code
    IF student_name IS NULL OR student_name = '' THEN
      student_name := student_code;
    END IF;
    
    -- Parse class codes (comma-separated)
    class_codes := string_to_array(class_list, ',');
    
    -- Trim and filter empty strings
    class_codes := ARRAY(
      SELECT trim(unnest(class_codes)) 
      WHERE trim(unnest(class_codes)) != ''
    );
    
    -- Insert into staging
    INSERT INTO temp_roster_staging (student_code, student_name, class_codes)
    VALUES (student_code, student_name, class_codes);
  END LOOP;

  -- ====================================================================
  -- Step 1: Canonicalize and insert classes
  -- ====================================================================
  
  -- Collect all unique class codes from staging
  FOR class_code_raw IN 
    SELECT DISTINCT trim(unnest(class_codes)) AS code
    FROM temp_roster_staging
    WHERE class_codes IS NOT NULL
  LOOP
    -- Look up canonical code
    SELECT canonical INTO class_code_canonical
    FROM temp_class_alias_map
    WHERE alias = class_code_raw;
    
    IF class_code_canonical IS NULL THEN
      -- Track unmapped alias
      unmapped_aliases := array_append(unmapped_aliases, class_code_raw);
      CONTINUE;
    END IF;
    
    -- Upsert class (code is unique)
    INSERT INTO classes (code, name)
    VALUES (class_code_canonical, class_code_canonical)
    ON CONFLICT (code) DO NOTHING;
  END LOOP;

  -- ====================================================================
  -- Step 2: Upsert students
  -- ====================================================================
  
  FOR student_code, student_name IN
    SELECT DISTINCT rs.student_code, rs.student_name
    FROM temp_roster_staging rs
  LOOP
    -- Upsert student (code is unique)
    INSERT INTO students (code, name)
    VALUES (student_code, student_name)
    ON CONFLICT (code) 
    DO UPDATE SET name = EXCLUDED.name
    WHERE students.name IS DISTINCT FROM EXCLUDED.name;
  END LOOP;

  -- ====================================================================
  -- Step 3: Insert class enrollments
  -- ====================================================================
  
  FOR student_code, class_codes IN
    SELECT rs.student_code, rs.class_codes
    FROM temp_roster_staging rs
  LOOP
    -- Iterate over each class code for this student
    FOREACH class_code_raw IN ARRAY class_codes LOOP
      -- Look up canonical code
      SELECT canonical INTO class_code_canonical
      FROM temp_class_alias_map
      WHERE alias = trim(class_code_raw);
      
      IF class_code_canonical IS NULL THEN
        CONTINUE; -- Skip unmapped classes
      END IF;
      
      -- Insert enrollment (class_id, student_id) from lookups
      INSERT INTO class_enrollments (class_id, student_id)
      SELECT c.id, s.id
      FROM classes c, students s
      WHERE c.code = class_code_canonical
        AND s.code = student_code
      ON CONFLICT (class_id, student_id) DO NOTHING;
    END LOOP;
  END LOOP;

  -- ====================================================================
  -- Step 4: Update students.class_code (primary class)
  -- ====================================================================
  -- Set students.class_code to the first class code they're enrolled in
  
  UPDATE students s
  SET class_code = (
    SELECT c.code
    FROM class_enrollments ce
    JOIN classes c ON ce.class_id = c.id
    WHERE ce.student_id = s.id
    ORDER BY c.code
    LIMIT 1
  )
  WHERE EXISTS (
    SELECT 1 FROM class_enrollments ce WHERE ce.student_id = s.id
  );

  -- ====================================================================
  -- Report unmapped aliases
  -- ====================================================================
  
  IF array_length(unmapped_aliases, 1) > 0 THEN
    RAISE NOTICE 'Unmapped class aliases (add to temp_class_alias_map if needed): %', 
      array_to_string(unmapped_aliases, ', ');
  ELSE
    RAISE NOTICE 'All class codes mapped successfully.';
  END IF;

  RAISE NOTICE 'Roster import complete. Classes and enrollments updated.';
  
END $$;
