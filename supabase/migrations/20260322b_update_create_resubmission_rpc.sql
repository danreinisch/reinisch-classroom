-- Update create_resubmission to stamp school_year on the new submission row
CREATE OR REPLACE FUNCTION public.create_resubmission(
  p_instance_id uuid,
  p_original_submission_id uuid,
  p_answers jsonb default '{}'::jsonb
)
returns uuid language plpgsql as $$
declare
  v_instance record;
  v_submission_id uuid;
  v_school_year integer;
begin
  select * into v_instance
  from public.assignment_instances
  where id = p_instance_id
  for update;

  if not found then
    raise exception 'Assignment instance % not found', p_instance_id;
  end if;

  if v_instance.resubmission_count >= 1 then
    raise exception 'Resubmission limit reached for instance %', p_instance_id;
  end if;

  -- Calculate school year (Aug–Dec → current year; Jan–Jul → year - 1)
  v_school_year := CASE
    WHEN EXTRACT(MONTH FROM now()) >= 8 THEN EXTRACT(YEAR FROM now())::integer
    ELSE (EXTRACT(YEAR FROM now()) - 1)::integer
  END;

  insert into public.submissions (
    instance_id,
    submission_type,
    original_submission_id,
    answers,
    submitted_at,
    school_year
  ) values (
    p_instance_id,
    'resubmission',
    p_original_submission_id,
    p_answers,
    now(),
    v_school_year
  )
  returning id into v_submission_id;

  update public.assignment_instances
  set
    resubmission_count = resubmission_count + 1,
    status = 'In Progress'
  where id = p_instance_id;

  return v_submission_id;
end;
$$;
