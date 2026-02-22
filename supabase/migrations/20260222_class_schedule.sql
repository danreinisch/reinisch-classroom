CREATE TABLE IF NOT EXISTS public.class_schedule (
  id serial PRIMARY KEY,
  hour_number int NOT NULL UNIQUE,
  start_time time NOT NULL,
  end_time time NOT NULL,
  label text NOT NULL,
  is_planning boolean DEFAULT false,
  active boolean DEFAULT true,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_schedule_active ON public.class_schedule(active);
CREATE INDEX IF NOT EXISTS idx_class_schedule_sort ON public.class_schedule(sort_order);

INSERT INTO public.class_schedule (hour_number, start_time, end_time, label, is_planning, sort_order) VALUES
  (1, '07:20', '08:10', 'Planning Period', true, 1),
  (2, '08:14', '09:04', 'Language Arts 2 SC', false, 2),
  (3, '09:08', '09:58', 'Language Arts 4 SC', false, 3),
  (4, '10:02', '10:52', 'Life Skills Language Arts SC', false, 4),
  (5, '10:54', '11:40', 'Tribe Time', false, 5),
  (6, '11:44', '12:34', 'Language Arts 1 SC', false, 6),
  (7, '12:38', '13:28', 'Language Arts 2 SC', false, 7),
  (8, '13:32', '14:22', 'Life Skills SC', false, 8)
ON CONFLICT DO NOTHING;

COMMENT ON TABLE public.class_schedule IS 'Bell schedule for the Class Clock feature';
