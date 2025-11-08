-- Portal B: Resubmission Support Schema
-- Adds one-time resubmission capability for all assignments

-- Add resubmission_count to assignment_instances
-- Track how many times a student has resubmitted (limit 1)
alter table assignment_instances 
add column if not exists resubmission_count int not null default 0;

-- Add resubmission fields to submissions table
-- Link resubmissions back to their original submission
alter table submissions
add column if not exists original_submission_id uuid references submissions(id) on delete set null,
add column if not exists submission_type text not null default 'initial' 
  check (submission_type in ('initial', 'resubmission'));

-- Create index for performance when querying resubmissions
create index if not exists idx_submissions_original on submissions(original_submission_id);
create index if not exists idx_submissions_type on submissions(submission_type);
create index if not exists idx_assignment_instances_resubmission on assignment_instances(resubmission_count);

-- RPC function to create a resubmission atomically
-- Ensures idempotency and proper increment of resubmission_count
create or replace function create_resubmission(
  p_instance_id uuid,
  p_original_submission_id uuid,
  p_answers jsonb default '{}'::jsonb
)
returns uuid language plpgsql as $$
declare
  v_instance record;
  v_submission_id uuid;
begin
  -- Fetch and lock the instance row
  select * into v_instance
  from assignment_instances
  where id = p_instance_id
  for update;
  
  if not found then
    raise exception 'Assignment instance % not found', p_instance_id;
  end if;
  
  -- Check if resubmission is allowed (count < 1)
  if v_instance.resubmission_count >= 1 then
    raise exception 'Resubmission limit reached for instance %', p_instance_id;
  end if;
  
  -- Create new submission
  insert into submissions (
    instance_id,
    submission_type,
    original_submission_id,
    answers,
    submitted_at
  ) values (
    p_instance_id,
    'resubmission',
    p_original_submission_id,
    p_answers,
    now()
  )
  returning id into v_submission_id;
  
  -- Increment resubmission count
  update assignment_instances
  set 
    resubmission_count = resubmission_count + 1,
    status = 'Submitted'
  where id = p_instance_id;
  
  return v_submission_id;
end $$;

-- Helper function to get latest submission for an instance
-- Returns the most recent submission (initial or resubmission)
create or replace function get_latest_submission(p_instance_id uuid)
returns table(
  id uuid,
  instance_id uuid,
  submitted_at timestamptz,
  submission_type text,
  original_submission_id uuid,
  answers jsonb,
  score_auto numeric,
  score_manual numeric,
  score_total numeric,
  detail jsonb,
  notes text
) language sql stable as $$
  select 
    id,
    instance_id,
    submitted_at,
    submission_type,
    original_submission_id,
    answers,
    score_auto,
    score_manual,
    score_total,
    detail,
    notes
  from submissions
  where submissions.instance_id = p_instance_id
  order by submitted_at desc
  limit 1;
$$;

-- Add comment for documentation
comment on function create_resubmission is 
  'Creates a resubmission for an assignment instance. Ensures atomic increment of resubmission_count and enforces limit of 1 resubmission.';

comment on function get_latest_submission is 
  'Returns the most recent submission (initial or resubmission) for an assignment instance.';
