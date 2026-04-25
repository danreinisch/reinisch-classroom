


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."assignment_type" AS ENUM (
    'html',
    'google_form'
);


ALTER TYPE "public"."assignment_type" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_student_goals"("p_student_code" "text", "p_goals" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_created int := 0;
begin
  -- Insert goals in one batch. We echo p_student_code to the client for diagnostics,
  -- but do not store PII and do not need a student_code column in goals.
  insert into goals (goal_code, goal_area, goal_text, baseline, target, case_manager, active, version, start_date)
  select
    g->>'goal_code',
    g->>'goal_area',
    g->>'goal_text',
    nullif(g->>'baseline','')::int,
    nullif(g->>'target','')::int,
    g->>'case_manager',
    true,
    coalesce(nullif(g->>'version','')::int, 1),
    coalesce((g->>'start_date')::date, current_date)
  from jsonb_array_elements(coalesce(p_goals, '[]'::jsonb)) g;

  get diagnostics v_created = ROW_COUNT;

  return jsonb_build_object('student_code', p_student_code, 'goals_created', v_created);
end;
$$;


ALTER FUNCTION "public"."add_student_goals"("p_student_code" "text", "p_goals" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_student_goals"("student_id" "uuid", "goal_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  g uuid;
BEGIN
  FOREACH g IN ARRAY goal_ids LOOP
    INSERT INTO goals(student_id, goal_template_id)
    VALUES (student_id, g);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."add_student_goals"("student_id" "uuid", "goal_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."app_users_touch_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."app_users_touch_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."apply_auto_student_rls"() RETURNS "void"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE
    r record;
    id_col text;
BEGIN
    FOR r IN
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE table_schema='public'
          AND column_name IN ('student_id','student_code')
    LOOP
        -- detect the actual column name (student_id or student_code)
        SELECT column_name INTO id_col
        FROM information_schema.columns
        WHERE table_schema='public'
          AND table_name = r.table_name
          AND column_name IN ('student_id','student_code')
        LIMIT 1;

        -- enable RLS
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.table_name);

        -- DROP OLD POLICIES
        EXECUTE format('DROP POLICY IF EXISTS %I_select ON public.%I;', r.table_name, r.table_name);
        EXECUTE format('DROP POLICY IF EXISTS %I_write_staff ON public.%I;', r.table_name, r.table_name);

        -- SELECT POLICY: students, teachers, staff
        EXECUTE format($pol$
            CREATE POLICY %I_select
            ON public.%I
            FOR SELECT
            USING (
                log_rls_hit(%L, 'select',
                    jsonb_build_object(
                        'row_student', %I
                    )
                )
                AND (
                    is_staff()
                    OR %I = current_student_id()
                    OR is_teacher_of(%I)
                )
            );
        $pol$, r.table_name, r.table_name, r.table_name, id_col, id_col, id_col);

        -- WRITE POLICY — staff only
        EXECUTE format($pol$
            CREATE POLICY %I_write_staff
            ON public.%I
            FOR ALL
            USING (
                log_rls_hit(%L, 'write') AND is_staff()
            )
            WITH CHECK (is_staff());
        $pol$, r.table_name, r.table_name, r.table_name);
    END LOOP;
END;
$_$;


ALTER FUNCTION "public"."apply_auto_student_rls"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."archive_goal"("goal_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  UPDATE goals
  SET archived = true,
      updated_at = now()
  WHERE id = goal_id;
END;
$$;


ALTER FUNCTION "public"."archive_goal"("goal_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."canonicalize_class"("class_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN lower(trim(class_name));
END;
$$;


ALTER FUNCTION "public"."canonicalize_class"("class_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_student_with_enrollments_and_goals"("payload" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_code text;
begin
  v_code := (payload->'student'->>'code');

  if v_code is null or length(trim(v_code)) = 0 then
    raise exception 'STUDENT_CODE_REQUIRED';
  end if;

  if exists (select 1 from students where code = v_code) then
    raise exception 'STUDENT_CODE_EXISTS';
  end if;

  insert into students (code, active) values (v_code, true);

  -- If your enrollments table is named differently, change the table name below.
  -- Expected columns: enrollments(student_code text, class_id uuid, start_date date)
  insert into enrollments (student_code, class_id, start_date)
  select v_code,
         (enr->>'class_id')::uuid,
         coalesce((enr->>'start_date')::date, current_date)
  from jsonb_array_elements(coalesce(payload->'enrollments','[]'::jsonb)) enr;

  insert into goals (goal_code, goal_area, goal_text, baseline, target, case_manager, active, version, start_date)
  select g->>'goal_code',
         g->>'goal_area',
         g->>'goal_text',
         nullif(g->>'baseline','')::int,
         nullif(g->>'target','')::int,
         g->>'case_manager',
         true,
         1,
         coalesce((g->>'start_date')::date, current_date)
  from jsonb_array_elements(coalesce(payload->'goals','[]'::jsonb)) g;

  return jsonb_build_object(
    'student_code', v_code,
    'enrollments_created', jsonb_array_length(coalesce(payload->'enrollments','[]'::jsonb)),
    'goals_created', jsonb_array_length(coalesce(payload->'goals','[]'::jsonb))
  );
end;
$$;


ALTER FUNCTION "public"."create_student_with_enrollments_and_goals"("payload" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_student_with_enrollments_and_goals"("p_name" "text", "p_grade" integer, "p_class_ids" "uuid"[], "p_goal_template_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  new_id uuid;
  cid uuid;
  gid uuid;
BEGIN
  INSERT INTO students(name, grade)
  VALUES (p_name, p_grade)
  RETURNING id INTO new_id;

  FOREACH cid IN ARRAY p_class_ids LOOP
    INSERT INTO class_enrollments(student_id, class_id)
    VALUES (new_id, cid);
  END LOOP;

  FOREACH gid IN ARRAY p_goal_template_ids LOOP
    INSERT INTO goals(student_id, goal_template_id)
    VALUES (new_id, gid);
  END LOOP;

  RETURN new_id;
END;
$$;


ALTER FUNCTION "public"."create_student_with_enrollments_and_goals"("p_name" "text", "p_grade" integer, "p_class_ids" "uuid"[], "p_goal_template_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_student_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE
    AS $$
    SELECT student_id
    FROM app_users
    WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."current_student_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."current_teacher_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT (raw_user_meta_data->>'teacher_id')::uuid
  FROM auth.users
  WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."current_teacher_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_teacher_signup"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  new_teacher_code text;
BEGIN
  -- Only run for teachers
  IF NEW.raw_user_meta_data->>'role' = 'teacher' THEN
    
    -- Generate teacher code like TEACHER001, TEACHER002, etc.
    SELECT 'TEACHER' || LPAD((COUNT(*) + 1)::text, 3, '0')
    INTO new_teacher_code
    FROM public.teacher;

    -- Insert teacher row
    INSERT INTO public.teacher (
        auth_user_id,
        teacher_code,
        full_name,
        first_name,
        last_name,
        active
    )
    VALUES (
        NEW.id,
        new_teacher_code,
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'first_name',
        NEW.raw_user_meta_data->>'last_name',
        true
    );

    -- Sync metadata to store teacher_id + teacher_code
    NEW.raw_user_meta_data = NEW.raw_user_meta_data || jsonb_build_object(
        'teacher_code', new_teacher_code,
        'teacher_id', (SELECT id FROM public.teacher WHERE auth_user_id = NEW.id)
    );
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_teacher_signup"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_staff"() RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
    SELECT role = 'staff'
    FROM app_users
    WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."is_staff"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_teacher_of"("student" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE
    AS $$
    SELECT EXISTS (
        SELECT 1
        FROM class_enrollments ce
        JOIN class_enrollments my_enroll
          ON my_enroll.class_id = ce.class_id
        JOIN app_users u ON u.id = auth.uid()
        WHERE ce.student_id = student
          AND u.role = 'teacher'
          AND my_enroll.student_id = u.student_id
    );
$$;


ALTER FUNCTION "public"."is_teacher_of"("student" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."log_rls_hit"("tbl" "text", "action" "text", "details" "jsonb" DEFAULT '{}'::"jsonb") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    INSERT INTO rls_log(table_name, action, user_id, student_id, is_staff, details)
    VALUES (
        tbl,
        action,
        auth.uid(),
        current_student_id(),
        is_staff(),
        details
    );
    RETURN TRUE;
END;
$$;


ALTER FUNCTION "public"."log_rls_hit"("tbl" "text", "action" "text", "details" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pretty_class_name"("class_name" "text") RETURNS "text"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  RETURN initcap(class_name);
END;
$$;


ALTER FUNCTION "public"."pretty_class_name"("class_name" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."pretty_class_name"("code" "text", "alias" "text") RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $_$
begin
  if code ~ '^LA[0-9]+$' then return 'Language Arts ' || substring(code from 3);
  elsif code = 'LSLA' then return 'Life Skills Language Arts';
  elsif code = 'LS' then return 'Life Skills';
  elsif code = 'CMATH' then return 'Consumer Math';
  elsif code = 'GEOM' then return 'Geometry';
  elsif code = 'ALG1' then return 'Algebra 1';
  elsif code = 'SPEECH' then return 'Speech/Language';
  elsif code ~ '^ELA[0-9]+$' then return 'ELA ' || substring(code from 4);
  elsif code = 'WARRIOR' then return 'Warrior Academy';
  end if;
  return trim(regexp_replace(coalesce(alias,''), '\s+(SC|S1)\s*$', '', 'i'));
end
$_$;


ALTER FUNCTION "public"."pretty_class_name"("code" "text", "alias" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."process_submission"("submission_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  UPDATE submissions
  SET processed = true,
      updated_at = now()
  WHERE id = submission_id;
END;
$$;


ALTER FUNCTION "public"."process_submission"("submission_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_goal_version"("old_goal_id" "uuid", "new_goal" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_old record;
  v_new_id uuid;
  v_new_version int;
  v_new_code text;
begin
  select * into v_old from goals where id = old_goal_id;
  if not found then
    raise exception 'GOAL_NOT_FOUND';
  end if;
  if v_old.active = false then
    raise exception 'GOAL_ALREADY_ARCHIVED';
  end if;

  v_new_version := coalesce(v_old.version,1) + 1;
  v_new_code := coalesce(new_goal->>'goal_code', v_old.goal_code || 'v' || v_new_version);

  -- Enforce goal_code uniqueness (adjust to per-student uniqueness if you track student in goals)
  if exists (select 1 from goals where goal_code = v_new_code) then
    raise exception 'GOAL_CODE_EXISTS';
  end if;

  update goals set active=false where id = old_goal_id;

  insert into goals (goal_code, goal_area, goal_text, baseline, target, case_manager, active, version, start_date)
  values (
    v_new_code,
    coalesce(new_goal->>'goal_area', v_old.goal_area),
    new_goal->>'goal_text',
    nullif(new_goal->>'baseline','')::int,
    nullif(new_goal->>'target','')::int,
    coalesce(new_goal->>'case_manager', v_old.case_manager),
    true,
    v_new_version,
    coalesce((new_goal->>'start_date')::date, current_date)
  ) returning id into v_new_id;

  update goals set replaced_by = v_new_id where id = old_goal_id;

  return jsonb_build_object('old_goal_id', old_goal_id, 'new_goal_id', v_new_id, 'version', v_new_version, 'new_code', v_new_code);
end;
$$;


ALTER FUNCTION "public"."replace_goal_version"("old_goal_id" "uuid", "new_goal" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."replace_goal_version"("old_goal" "uuid", "new_template" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  UPDATE goals
  SET goal_template_id = new_template,
      updated_at = now()
  WHERE id = old_goal;
END;
$$;


ALTER FUNCTION "public"."replace_goal_version"("old_goal" "uuid", "new_template" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_student_active"("p_code" "text", "p_active" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
begin
  update students set active = p_active where code = p_code;
  if not found then raise exception 'STUDENT_NOT_FOUND'; end if;
  return jsonb_build_object('student_code', p_code, 'active', p_active);
end;
$$;


ALTER FUNCTION "public"."set_student_active"("p_code" "text", "p_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_student_active"("student_id" "uuid", "is_active" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  UPDATE students
  SET active = is_active,
      updated_at = now()
  WHERE id = student_id;
END;
$$;


ALTER FUNCTION "public"."set_student_active"("student_id" "uuid", "is_active" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_student_password"("p_code" "text", "p_password" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select public.set_user_password(p_code, p_password);
$$;


ALTER FUNCTION "public"."set_student_password"("p_code" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_password"("p_username" "text", "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare
  v_exists boolean;
begin
  select true into v_exists from public.app_users where username = p_username;

  if v_exists then
    update public.app_users
       set password_hash = extensions.crypt(p_password, extensions.gen_salt('bf')),
           updated_at    = now()
     where username = p_username;
  else
    insert into public.app_users (username, role, password_hash)
    values (p_username, 'student', extensions.crypt(p_password, extensions.gen_salt('bf')))
    on conflict (username) do update
      set password_hash = excluded.password_hash,
          updated_at    = now();
  end if;

  return true;
end;
$$;


ALTER FUNCTION "public"."set_user_password"("p_username" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_password"("p_user_id" "uuid", "p_password" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  UPDATE app_users
  SET password_hash = crypt(p_password, gen_salt('bf'))
  WHERE id = p_user_id;
END;
$$;


ALTER FUNCTION "public"."set_user_password"("p_user_id" "uuid", "p_password" "text") OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" DEFAULT "extensions"."gen_random_uuid"() NOT NULL,
    "username" "text" NOT NULL,
    "role" "text" NOT NULL,
    "student_id" "uuid",
    "password_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "app_users_role_check" CHECK (("role" = ANY (ARRAY['student'::"text", 'teacher'::"text", 'substitute'::"text", 'admin'::"text"])))
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_user_password"("p_username" "text", "p_password" "text", "p_role" "text", "p_student_id" "uuid" DEFAULT NULL::"uuid") RETURNS "public"."app_users"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_user public.app_users;
begin
  if p_role not in ('admin','teacher','student','substitute') then
    raise exception 'Invalid role: %', p_role;
  end if;

  insert into public.app_users (username, password_hash, role, student_id)
    values (lower(p_username), crypt(p_password, gen_salt('bf')), p_role, p_student_id)
  on conflict (username) do update
    set password_hash = crypt(p_password, gen_salt('bf')),
        role = excluded.role,
        student_id = excluded.student_id,
        updated_at = now()
  returning * into v_user;

  return v_user;
end;
$$;


ALTER FUNCTION "public"."set_user_password"("p_username" "text", "p_password" "text", "p_role" "text", "p_student_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_app_users_from_students"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
declare v_count integer := 0;
begin
  insert into public.app_users (username, role, student_id, password_hash)
  select s.code, 'student', s.id, extensions.crypt(s.code || '!', extensions.gen_salt('bf'))
    from public.students s
    left join public.app_users u on u.username = s.code
   where u.username is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


ALTER FUNCTION "public"."sync_app_users_from_students"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."sync_teacher_metadata"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'role' = 'teacher' THEN
    UPDATE public.teacher
    SET 
      full_name = NEW.raw_user_meta_data->>'full_name',
      first_name = NEW.raw_user_meta_data->>'first_name',
      last_name = NEW.raw_user_meta_data->>'last_name',
      active = (NEW.raw_user_meta_data->>'active')::boolean,
      updated_at = now()
    WHERE auth_user_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."sync_teacher_metadata"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."tg_set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."tg_set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."trg_fill_class_id_from_code"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
BEGIN
  IF NEW.class_id IS NULL THEN
    SELECT id INTO NEW.class_id
    FROM classes
    WHERE code = NEW.class_code
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."trg_fill_class_id_from_code"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_student_enrollments"("p_student_id" "uuid", "p_class_ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  cid uuid;
BEGIN
  DELETE FROM class_enrollments
  WHERE student_id = p_student_id;

  FOREACH cid IN ARRAY p_class_ids LOOP
    INSERT INTO class_enrollments(student_id, class_id)
    VALUES (p_student_id, cid);
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."update_student_enrollments"("p_student_id" "uuid", "p_class_ids" "uuid"[]) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_student_enrollments"("p_code" "text", "p_add" "jsonb", "p_remove" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
declare
  v_added int := 0;
  v_removed int := 0;
begin
  -- Add enrollments
  insert into enrollments (student_code, class_id, start_date)
  select p_code, (enr->>'class_id')::uuid, coalesce((enr->>'start_date')::date, current_date)
  from jsonb_array_elements(coalesce(p_add,'[]'::jsonb)) enr
  on conflict do nothing;
  get diagnostics v_added = ROW_COUNT;

  -- Remove enrollments
  delete from enrollments
   where student_code = p_code
     and class_id in (
       select (enr->>'class_id')::uuid
       from jsonb_array_elements(coalesce(p_remove,'[]'::jsonb)) enr
     );
  get diagnostics v_removed = ROW_COUNT;

  return jsonb_build_object('student_code', p_code, 'added', v_added, 'removed', v_removed);
end;
$$;


ALTER FUNCTION "public"."update_student_enrollments"("p_code" "text", "p_add" "jsonb", "p_remove" "jsonb") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_student_password"("p_code" "text", "p_password" "text") RETURNS boolean
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public', 'extensions'
    AS $$
  select exists (select 1 from public.verify_user_password(p_code, p_password));
$$;


ALTER FUNCTION "public"."verify_student_password"("p_code" "text", "p_password" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."verify_user_password"("p_username" "text", "p_password" "text") RETURNS boolean
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_catalog'
    AS $$
DECLARE
  stored_hash text;
BEGIN
  SELECT password_hash INTO stored_hash
  FROM app_users
  WHERE username = p_username;

  IF stored_hash IS NULL THEN
    RETURN false;
  END IF;

  RETURN public.crypt(p_password, stored_hash) = stored_hash;
END;
$$;


ALTER FUNCTION "public"."verify_user_password"("p_username" "text", "p_password" "text") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "assignment_id" bigint NOT NULL,
    "student_id" "uuid" NOT NULL,
    "assigned_at" "date" DEFAULT CURRENT_DATE,
    "due_at" "date",
    "status" "text" DEFAULT 'Assigned'::"text",
    "settings" "jsonb" DEFAULT '{}'::"jsonb",
    "resubmission_count" integer DEFAULT 0 NOT NULL
);


ALTER TABLE "public"."assignment_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."assignment_items" (
    "id" bigint NOT NULL,
    "assignment_id" bigint NOT NULL,
    "item_ref" "text" NOT NULL,
    "answer_type" "text" NOT NULL,
    "points" numeric DEFAULT 1 NOT NULL,
    "meta" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "assignment_items_answer_type_check" CHECK (("answer_type" = ANY (ARRAY['mcq'::"text", 'multi'::"text", 'boolean'::"text", 'constructed'::"text"])))
);

ALTER TABLE ONLY "public"."assignment_items" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_items" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."assignment_items_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."assignment_items_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."assignment_items_id_seq" OWNED BY "public"."assignment_items"."id";



CREATE TABLE IF NOT EXISTS "public"."assignments" (
    "id" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text",
    "section" "text" DEFAULT 'language-arts'::"text",
    "due_date" "date",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "type" "public"."assignment_type" DEFAULT 'html'::"public"."assignment_type" NOT NULL,
    "series" "text",
    "page" "text",
    "hero" "text",
    "meta" "jsonb",
    "created_by" "text",
    "class_id" "uuid"
);


ALTER TABLE "public"."assignments" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."assignments_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."assignments_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."assignments_id_seq" OWNED BY "public"."assignments"."id";



CREATE TABLE IF NOT EXISTS "public"."class_enrollments" (
    "class_id" "uuid" NOT NULL,
    "student_id" "uuid" NOT NULL,
    "class_code" "text"
);


ALTER TABLE "public"."class_enrollments" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."classes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text",
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "teacher_id" "uuid"
);


ALTER TABLE "public"."classes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "type" "text",
    "student_id" "uuid",
    "date" "date",
    "due" "date",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."events" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goal_staging" (
    "student_code" "text",
    "goal_desc" "text",
    "goal_code" "text",
    "class" "text",
    "goal_area" "text",
    "case_manager" "text",
    "teacher_name" "text",
    "teacher_email" "text",
    "iep_due" "text",
    "eval_due" "text",
    "student_id" "uuid" NOT NULL
);

ALTER TABLE ONLY "public"."goal_staging" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."goal_staging" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goal_staging_csv" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "Student Code Name" "text",
    "IEP Goal with Student Code Name" "text",
    "Student Code IEP Goal Code" "text",
    "Class" "text",
    "Goal Area" "text",
    "Case Manager" "text",
    "Teacher to Collect Data" "text",
    "Teacher to Collect Data Email Address" "text",
    "IEP Due" "text",
    "Eval Due" "text",
    "student_id" "uuid" NOT NULL
);

ALTER TABLE ONLY "public"."goal_staging_csv" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."goal_staging_csv" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."goals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "code" "text",
    "desc" "text",
    "target" "text",
    "status" "text" DEFAULT 'Open'::"text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "version" integer DEFAULT 1 NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "replaced_by" "uuid",
    "start_date" "date"
);


ALTER TABLE "public"."goals" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "role" "text" DEFAULT 'student'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."progress_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "student_id" "uuid",
    "goal_id" "uuid",
    "date" "date",
    "percent" integer,
    "method" "text",
    "by_name" "text",
    "via" "text",
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."progress_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."public.students" (
    "id" bigint NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."public.students" OWNER TO "postgres";


ALTER TABLE "public"."public.students" ALTER COLUMN "id" ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME "public"."public.students_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);



CREATE TABLE IF NOT EXISTS "public"."rls_log" (
    "id" bigint NOT NULL,
    "table_name" "text",
    "action" "text",
    "user_id" "uuid",
    "student_id" "text",
    "is_staff" boolean,
    "timestamp" timestamp with time zone DEFAULT "now"(),
    "details" "jsonb"
);

ALTER TABLE ONLY "public"."rls_log" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."rls_log" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."rls_log_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."rls_log_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."rls_log_id_seq" OWNED BY "public"."rls_log"."id";



CREATE TABLE IF NOT EXISTS "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text",
    "class_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "class_code" "text",
    "active" boolean DEFAULT true NOT NULL
);


ALTER TABLE "public"."students" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."submission_answers" (
    "id" bigint NOT NULL,
    "submission_id" "uuid" NOT NULL,
    "assignment_item_id" bigint NOT NULL,
    "raw_answer" "jsonb",
    "is_correct" boolean,
    "earned_points" numeric,
    "max_points" numeric,
    "scored_at" timestamp with time zone DEFAULT "now"()
);

ALTER TABLE ONLY "public"."submission_answers" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."submission_answers" OWNER TO "postgres";


CREATE SEQUENCE IF NOT EXISTS "public"."submission_answers_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE "public"."submission_answers_id_seq" OWNER TO "postgres";


ALTER SEQUENCE "public"."submission_answers_id_seq" OWNED BY "public"."submission_answers"."id";



CREATE TABLE IF NOT EXISTS "public"."submissions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "instance_id" "uuid" NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"(),
    "answers" "jsonb",
    "score_auto" numeric,
    "score_manual" numeric,
    "score_total" numeric,
    "detail" "jsonb",
    "notes" "text",
    "original_submission_id" "uuid",
    "submission_type" "text" DEFAULT 'initial'::"text",
    "source_type" "text" DEFAULT 'portal'::"text",
    CONSTRAINT "submissions_submission_type_check" CHECK (("submission_type" = ANY (ARRAY['initial'::"text", 'resubmission'::"text"])))
);

ALTER TABLE ONLY "public"."submissions" FORCE ROW LEVEL SECURITY;


ALTER TABLE "public"."submissions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."teacher" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "auth_user_id" "uuid" NOT NULL,
    "teacher_code" "text" NOT NULL,
    "full_name" "text",
    "first_name" "text",
    "last_name" "text",
    "active" boolean DEFAULT true,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "username" "text"
);


ALTER TABLE "public"."teacher" OWNER TO "postgres";


ALTER TABLE ONLY "public"."assignment_items" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."assignment_items_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."assignments" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."assignments_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."rls_log" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."rls_log_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."submission_answers" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."submission_answers_id_seq"'::"regclass");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_username_key" UNIQUE ("username");



ALTER TABLE ONLY "public"."assignment_instances"
    ADD CONSTRAINT "assignment_instances_assignment_id_student_id_key" UNIQUE ("assignment_id", "student_id");



ALTER TABLE ONLY "public"."assignment_instances"
    ADD CONSTRAINT "assignment_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignment_items"
    ADD CONSTRAINT "assignment_items_assignment_id_item_ref_key" UNIQUE ("assignment_id", "item_ref");



ALTER TABLE ONLY "public"."assignment_items"
    ADD CONSTRAINT "assignment_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_pkey" PRIMARY KEY ("class_id", "student_id");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goal_staging_csv"
    ADD CONSTRAINT "goal_staging_csv_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."progress_entries"
    ADD CONSTRAINT "progress_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."public.students"
    ADD CONSTRAINT "public.students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."rls_log"
    ADD CONSTRAINT "rls_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submission_answers"
    ADD CONSTRAINT "submission_answers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."submission_answers"
    ADD CONSTRAINT "submission_answers_submission_id_assignment_item_id_key" UNIQUE ("submission_id", "assignment_item_id");



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teacher"
    ADD CONSTRAINT "teacher_auth_user_id_key" UNIQUE ("auth_user_id");



ALTER TABLE ONLY "public"."teacher"
    ADD CONSTRAINT "teacher_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."teacher"
    ADD CONSTRAINT "teacher_teacher_code_key" UNIQUE ("teacher_code");



CREATE INDEX "app_users_username_lower_idx" ON "public"."app_users" USING "btree" ("lower"("username"));



CREATE UNIQUE INDEX "classes_code_uidx" ON "public"."classes" USING "btree" ("code");



CREATE UNIQUE INDEX "classes_code_unique" ON "public"."classes" USING "btree" ("code");



CREATE UNIQUE INDEX "classes_id_uidx" ON "public"."classes" USING "btree" ("id");



CREATE UNIQUE INDEX "classes_name_unique" ON "public"."classes" USING "btree" ("name");



CREATE INDEX "idx_assignment_items_assignment_id" ON "public"."assignment_items" USING "btree" ("assignment_id");



CREATE INDEX "idx_assignments_active_due" ON "public"."assignments" USING "btree" ("active", "due_date");



CREATE INDEX "idx_events_due" ON "public"."events" USING "btree" ("due");



CREATE INDEX "idx_events_student" ON "public"."events" USING "btree" ("student_id");



CREATE INDEX "idx_goal_staging_csv_student_id" ON "public"."goal_staging_csv" USING "btree" ("student_id");



CREATE INDEX "idx_goal_staging_student_id" ON "public"."goal_staging" USING "btree" ("student_id");



CREATE INDEX "idx_goals_active" ON "public"."goals" USING "btree" ("active");



CREATE INDEX "idx_goals_replaced_by" ON "public"."goals" USING "btree" ("replaced_by");



CREATE INDEX "idx_instances_assignment" ON "public"."assignment_instances" USING "btree" ("assignment_id");



CREATE INDEX "idx_instances_student" ON "public"."assignment_instances" USING "btree" ("student_id");



CREATE INDEX "idx_progress_date" ON "public"."progress_entries" USING "btree" ("date");



CREATE INDEX "idx_progress_goal" ON "public"."progress_entries" USING "btree" ("goal_id");



CREATE INDEX "idx_progress_student" ON "public"."progress_entries" USING "btree" ("student_id");



CREATE INDEX "idx_students_active" ON "public"."students" USING "btree" ("active");



CREATE INDEX "idx_submission_answers_item_id" ON "public"."submission_answers" USING "btree" ("assignment_item_id");



CREATE INDEX "idx_submission_answers_submission_id" ON "public"."submission_answers" USING "btree" ("submission_id");



CREATE INDEX "idx_submissions_instance" ON "public"."submissions" USING "btree" ("instance_id");



CREATE INDEX "idx_submissions_original_submission_id" ON "public"."submissions" USING "btree" ("original_submission_id");



CREATE UNIQUE INDEX "uniq_events_student_type_due" ON "public"."events" USING "btree" ("student_id", "type", "due");



CREATE UNIQUE INDEX "uniq_goals_student_code" ON "public"."goals" USING "btree" ("student_id", "code");



CREATE UNIQUE INDEX "unique_class_code" ON "public"."classes" USING "btree" ("code");



CREATE UNIQUE INDEX "unique_class_name" ON "public"."classes" USING "btree" ("name");



CREATE UNIQUE INDEX "teacher_username_lower_uidx" ON "public"."teacher" USING "btree" ("lower"("username")) WHERE ("username" IS NOT NULL);



CREATE OR REPLACE TRIGGER "app_users_touch_updated_at_trig" BEFORE UPDATE ON "public"."app_users" FOR EACH ROW EXECUTE FUNCTION "public"."app_users_touch_updated_at"();



CREATE OR REPLACE TRIGGER "t_fill_class_id_from_code_ins" BEFORE INSERT ON "public"."class_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fill_class_id_from_code"();



CREATE OR REPLACE TRIGGER "t_fill_class_id_from_code_upd" BEFORE UPDATE ON "public"."class_enrollments" FOR EACH ROW EXECUTE FUNCTION "public"."trg_fill_class_id_from_code"();



CREATE OR REPLACE TRIGGER "trg_app_users_set_updated_at" BEFORE UPDATE ON "public"."app_users" FOR EACH ROW EXECUTE FUNCTION "public"."tg_set_updated_at"();



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_student_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."assignment_instances"
    ADD CONSTRAINT "assignment_instances_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_instances"
    ADD CONSTRAINT "assignment_instances_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignment_items"
    ADD CONSTRAINT "assignment_items_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "public"."assignments"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."assignments"
    ADD CONSTRAINT "assignments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."class_enrollments"
    ADD CONSTRAINT "class_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."classes"
    ADD CONSTRAINT "classes_teacher_id_fkey" FOREIGN KEY ("teacher_id") REFERENCES "public"."teacher"("id");



ALTER TABLE ONLY "public"."events"
    ADD CONSTRAINT "events_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goal_staging_csv"
    ADD CONSTRAINT "goal_staging_csv_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goal_staging"
    ADD CONSTRAINT "goal_staging_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_replaced_by_fkey" FOREIGN KEY ("replaced_by") REFERENCES "public"."goals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."goals"
    ADD CONSTRAINT "goals_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."progress_entries"
    ADD CONSTRAINT "progress_entries_goal_id_fkey" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."progress_entries"
    ADD CONSTRAINT "progress_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_class_id_fkey" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."submission_answers"
    ADD CONSTRAINT "submission_answers_assignment_item_id_fkey" FOREIGN KEY ("assignment_item_id") REFERENCES "public"."assignment_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submission_answers"
    ADD CONSTRAINT "submission_answers_submission_id_fkey" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_instance_id_fkey" FOREIGN KEY ("instance_id") REFERENCES "public"."assignment_instances"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."submissions"
    ADD CONSTRAINT "submissions_original_submission_id_fkey" FOREIGN KEY ("original_submission_id") REFERENCES "public"."submissions"("id") ON DELETE SET NULL;



CREATE POLICY "Teachers can read own teacher profile" ON "public"."teacher" FOR SELECT USING (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "Teachers can update own teacher profile" ON "public"."teacher" FOR UPDATE USING (("auth"."uid"() = "auth_user_id"));



CREATE POLICY "ai_select" ON "public"."assignment_instances" FOR SELECT USING (("public"."is_staff"() OR ("student_id" = "public"."current_student_id"()) OR "public"."is_teacher_of"("student_id")));



CREATE POLICY "ai_write" ON "public"."assignment_instances" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "anon can read active assignments" ON "public"."assignments" FOR SELECT TO "anon" USING (("active" IS TRUE));



ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignment_items" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."assignments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "class_enr_select" ON "public"."class_enrollments" FOR SELECT USING (("public"."is_staff"() OR ("student_id" = "public"."current_student_id"()) OR "public"."is_teacher_of"("student_id")));



CREATE POLICY "class_enr_write" ON "public"."class_enrollments" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



ALTER TABLE "public"."class_enrollments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."classes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."events" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "events_select" ON "public"."events" FOR SELECT USING (("public"."is_staff"() OR ("student_id" = "public"."current_student_id"()) OR "public"."is_teacher_of"("student_id")));



CREATE POLICY "events_write" ON "public"."events" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



ALTER TABLE "public"."goal_staging" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."goal_staging_csv" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goal_staging_csv_insert" ON "public"."goal_staging_csv" FOR INSERT WITH CHECK ("public"."is_staff"());



CREATE POLICY "goal_staging_csv_insert_staff" ON "public"."goal_staging_csv" FOR INSERT WITH CHECK ("public"."is_staff"());



CREATE POLICY "goal_staging_insert" ON "public"."goal_staging" FOR INSERT WITH CHECK ("public"."is_staff"());



CREATE POLICY "goal_staging_insert_staff" ON "public"."goal_staging" FOR INSERT WITH CHECK ("public"."is_staff"());



ALTER TABLE "public"."goals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "goals_select" ON "public"."goals" FOR SELECT USING (("public"."is_staff"() OR ("student_id" = "public"."current_student_id"()) OR "public"."is_teacher_of"("student_id")));



CREATE POLICY "goals_write" ON "public"."goals" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "gs_select" ON "public"."goal_staging" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "gs_write" ON "public"."goal_staging" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "gscsv_select" ON "public"."goal_staging_csv" FOR SELECT USING ("public"."is_staff"());



CREATE POLICY "gscsv_write" ON "public"."goal_staging_csv" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."progress_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "progress_entries_select" ON "public"."progress_entries" FOR SELECT USING (("public"."is_staff"() OR ("student_id" = "public"."current_student_id"()) OR "public"."is_teacher_of"("student_id")));



CREATE POLICY "progress_entries_write" ON "public"."progress_entries" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



ALTER TABLE "public"."public.students" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."rls_log" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "students_insert" ON "public"."students" FOR INSERT WITH CHECK ("public"."is_staff"());



CREATE POLICY "students_modify" ON "public"."students" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "students_select" ON "public"."students" FOR SELECT USING (("public"."is_staff"() OR ("id" = "public"."current_student_id"()) OR "public"."is_teacher_of"("id")));



CREATE POLICY "students_write" ON "public"."students" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



CREATE POLICY "subanswers_select" ON "public"."submission_answers" FOR SELECT USING (("public"."is_staff"() OR ("submission_id" IN ( SELECT "submissions"."id"
   FROM "public"."submissions"
  WHERE ("submissions"."instance_id" IN ( SELECT "assignment_instances"."id"
           FROM "public"."assignment_instances"
          WHERE ("assignment_instances"."student_id" = "public"."current_student_id"()))))) OR (EXISTS ( SELECT 1
   FROM ("public"."submissions" "s"
     JOIN "public"."assignment_instances" "ai" ON (("ai"."id" = "s"."instance_id")))
  WHERE (("s"."id" = "submission_answers"."submission_id") AND "public"."is_teacher_of"("ai"."student_id"))))));



CREATE POLICY "subanswers_write" ON "public"."submission_answers" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



ALTER TABLE "public"."submission_answers" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."submissions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "submissions_select" ON "public"."submissions" FOR SELECT USING (("public"."is_staff"() OR ("instance_id" IN ( SELECT "assignment_instances"."id"
   FROM "public"."assignment_instances"
  WHERE ("assignment_instances"."student_id" = "public"."current_student_id"()))) OR (EXISTS ( SELECT 1
   FROM "public"."assignment_instances" "ai"
  WHERE (("ai"."id" = "submissions"."instance_id") AND "public"."is_teacher_of"("ai"."student_id"))))));



CREATE POLICY "submissions_write" ON "public"."submissions" USING ("public"."is_staff"()) WITH CHECK ("public"."is_staff"());



ALTER TABLE "public"."teacher" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "teacher_read_students" ON "public"."students" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."class_enrollments" "ce_student"
     JOIN "public"."class_enrollments" "ce_teacher" ON (("ce_teacher"."class_id" = "ce_student"."class_id")))
  WHERE (("ce_student"."student_id" = "students"."id") AND ("ce_teacher"."student_id" = "public"."current_student_id"())))));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."add_student_goals"("p_student_code" "text", "p_goals" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."add_student_goals"("p_student_code" "text", "p_goals" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_student_goals"("p_student_code" "text", "p_goals" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_student_goals"("student_id" "uuid", "goal_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."add_student_goals"("student_id" "uuid", "goal_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_student_goals"("student_id" "uuid", "goal_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."app_users_touch_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."app_users_touch_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."app_users_touch_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."apply_auto_student_rls"() TO "anon";
GRANT ALL ON FUNCTION "public"."apply_auto_student_rls"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_auto_student_rls"() TO "service_role";



GRANT ALL ON FUNCTION "public"."archive_goal"("goal_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."archive_goal"("goal_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."archive_goal"("goal_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."canonicalize_class"("class_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."canonicalize_class"("class_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."canonicalize_class"("class_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_student_with_enrollments_and_goals"("payload" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_student_with_enrollments_and_goals"("payload" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_student_with_enrollments_and_goals"("payload" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_student_with_enrollments_and_goals"("p_name" "text", "p_grade" integer, "p_class_ids" "uuid"[], "p_goal_template_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."create_student_with_enrollments_and_goals"("p_name" "text", "p_grade" integer, "p_class_ids" "uuid"[], "p_goal_template_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_student_with_enrollments_and_goals"("p_name" "text", "p_grade" integer, "p_class_ids" "uuid"[], "p_goal_template_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."current_student_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_student_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_student_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."current_teacher_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."current_teacher_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."current_teacher_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_teacher_signup"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_teacher_signup"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_teacher_signup"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_staff"() TO "anon";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_staff"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_teacher_of"("student" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_teacher_of"("student" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_teacher_of"("student" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."log_rls_hit"("tbl" "text", "action" "text", "details" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."log_rls_hit"("tbl" "text", "action" "text", "details" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."log_rls_hit"("tbl" "text", "action" "text", "details" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."pretty_class_name"("class_name" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pretty_class_name"("class_name" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pretty_class_name"("class_name" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."pretty_class_name"("code" "text", "alias" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."pretty_class_name"("code" "text", "alias" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."pretty_class_name"("code" "text", "alias" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."process_submission"("submission_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."process_submission"("submission_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."process_submission"("submission_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_goal_version"("old_goal_id" "uuid", "new_goal" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_goal_version"("old_goal_id" "uuid", "new_goal" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_goal_version"("old_goal_id" "uuid", "new_goal" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."replace_goal_version"("old_goal" "uuid", "new_template" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."replace_goal_version"("old_goal" "uuid", "new_template" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."replace_goal_version"("old_goal" "uuid", "new_template" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_student_active"("p_code" "text", "p_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_student_active"("p_code" "text", "p_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_student_active"("p_code" "text", "p_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_student_active"("student_id" "uuid", "is_active" boolean) TO "anon";
GRANT ALL ON FUNCTION "public"."set_student_active"("student_id" "uuid", "is_active" boolean) TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_student_active"("student_id" "uuid", "is_active" boolean) TO "service_role";



GRANT ALL ON FUNCTION "public"."set_student_password"("p_code" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_student_password"("p_code" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_student_password"("p_code" "text", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_password"("p_username" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_password"("p_username" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_password"("p_username" "text", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_password"("p_user_id" "uuid", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_password"("p_user_id" "uuid", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_password"("p_user_id" "uuid", "p_password" "text") TO "service_role";



GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON FUNCTION "public"."set_user_password"("p_username" "text", "p_password" "text", "p_role" "text", "p_student_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."set_user_password"("p_username" "text", "p_password" "text", "p_role" "text", "p_student_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_user_password"("p_username" "text", "p_password" "text", "p_role" "text", "p_student_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_app_users_from_students"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_app_users_from_students"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_app_users_from_students"() TO "service_role";



GRANT ALL ON FUNCTION "public"."sync_teacher_metadata"() TO "anon";
GRANT ALL ON FUNCTION "public"."sync_teacher_metadata"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."sync_teacher_metadata"() TO "service_role";



GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."tg_set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."trg_fill_class_id_from_code"() TO "anon";
GRANT ALL ON FUNCTION "public"."trg_fill_class_id_from_code"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."trg_fill_class_id_from_code"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_student_enrollments"("p_student_id" "uuid", "p_class_ids" "uuid"[]) TO "anon";
GRANT ALL ON FUNCTION "public"."update_student_enrollments"("p_student_id" "uuid", "p_class_ids" "uuid"[]) TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_student_enrollments"("p_student_id" "uuid", "p_class_ids" "uuid"[]) TO "service_role";



GRANT ALL ON FUNCTION "public"."update_student_enrollments"("p_code" "text", "p_add" "jsonb", "p_remove" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."update_student_enrollments"("p_code" "text", "p_add" "jsonb", "p_remove" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_student_enrollments"("p_code" "text", "p_add" "jsonb", "p_remove" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_student_password"("p_code" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_student_password"("p_code" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_student_password"("p_code" "text", "p_password" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."verify_user_password"("p_username" "text", "p_password" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."verify_user_password"("p_username" "text", "p_password" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."verify_user_password"("p_username" "text", "p_password" "text") TO "service_role";


















GRANT ALL ON TABLE "public"."assignment_instances" TO "anon";
GRANT ALL ON TABLE "public"."assignment_instances" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_instances" TO "service_role";



GRANT ALL ON TABLE "public"."assignment_items" TO "anon";
GRANT ALL ON TABLE "public"."assignment_items" TO "authenticated";
GRANT ALL ON TABLE "public"."assignment_items" TO "service_role";



GRANT ALL ON SEQUENCE "public"."assignment_items_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."assignment_items_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."assignment_items_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."assignments" TO "anon";
GRANT ALL ON TABLE "public"."assignments" TO "authenticated";
GRANT ALL ON TABLE "public"."assignments" TO "service_role";



GRANT ALL ON SEQUENCE "public"."assignments_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."assignments_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."assignments_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."class_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."class_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."class_enrollments" TO "service_role";



GRANT ALL ON TABLE "public"."classes" TO "anon";
GRANT ALL ON TABLE "public"."classes" TO "authenticated";
GRANT ALL ON TABLE "public"."classes" TO "service_role";



GRANT ALL ON TABLE "public"."events" TO "anon";
GRANT ALL ON TABLE "public"."events" TO "authenticated";
GRANT ALL ON TABLE "public"."events" TO "service_role";



GRANT ALL ON TABLE "public"."goal_staging" TO "anon";
GRANT ALL ON TABLE "public"."goal_staging" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_staging" TO "service_role";



GRANT ALL ON TABLE "public"."goal_staging_csv" TO "anon";
GRANT ALL ON TABLE "public"."goal_staging_csv" TO "authenticated";
GRANT ALL ON TABLE "public"."goal_staging_csv" TO "service_role";



GRANT ALL ON TABLE "public"."goals" TO "anon";
GRANT ALL ON TABLE "public"."goals" TO "authenticated";
GRANT ALL ON TABLE "public"."goals" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";



GRANT ALL ON TABLE "public"."progress_entries" TO "anon";
GRANT ALL ON TABLE "public"."progress_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."progress_entries" TO "service_role";



GRANT ALL ON TABLE "public"."public.students" TO "anon";
GRANT ALL ON TABLE "public"."public.students" TO "authenticated";
GRANT ALL ON TABLE "public"."public.students" TO "service_role";



GRANT ALL ON SEQUENCE "public"."public.students_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."public.students_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."public.students_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."rls_log" TO "anon";
GRANT ALL ON TABLE "public"."rls_log" TO "authenticated";
GRANT ALL ON TABLE "public"."rls_log" TO "service_role";



GRANT ALL ON SEQUENCE "public"."rls_log_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."rls_log_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."rls_log_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";



GRANT ALL ON TABLE "public"."submission_answers" TO "anon";
GRANT ALL ON TABLE "public"."submission_answers" TO "authenticated";
GRANT ALL ON TABLE "public"."submission_answers" TO "service_role";



GRANT ALL ON SEQUENCE "public"."submission_answers_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."submission_answers_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."submission_answers_id_seq" TO "service_role";



GRANT ALL ON TABLE "public"."submissions" TO "anon";
GRANT ALL ON TABLE "public"."submissions" TO "authenticated";
GRANT ALL ON TABLE "public"."submissions" TO "service_role";



GRANT ALL ON TABLE "public"."teacher" TO "anon";
GRANT ALL ON TABLE "public"."teacher" TO "authenticated";
GRANT ALL ON TABLE "public"."teacher" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































