-- Migration: 20260321_archive_stale_goals
-- Purpose: Archive any goals in the goals table that are not in the authoritative
--          goal code list from the master IEP CSV. This cleans up orphaned/eliminated
--          goal rows that were inflating the Overview page "missing progress" count and
--          the "At-Risk Students" / "Overdue Items" panels.
--
-- The whitelist is the complete set of valid goal codes derived from the master CSV
-- as documented in the 20260320_fix_goal_descriptions migration plus S045 goals added
-- in 20260309_add_s045_update_s026.
--
-- Goals with codes NOT in this list are archived (status = 'archived', active = false).

UPDATE public.goals
SET status = 'archived',
    active = false
WHERE active = true
  AND (status IS NULL OR status NOT IN ('archived', 'closed'))
  AND code NOT IN (
    -- S001
    'S001.11.1', 'S001.11.2', 'S001.11.3-1', 'S001.11.3-2', 'S001.11.3-3',
    -- S002
    'S002.11.1', 'S002.11.2',
    -- S003
    'S003.11.1',
    -- S004
    'S004.11.1', 'S004.11.2', 'S004.11.3', 'S004.11.4',
    -- S005
    'S005.11.1', 'S005.11.2',
    -- S006
    'S006.11.1', 'S006.11.2', 'S006.11.3', 'S006.11.4',
    -- S007
    'S007.11.1', 'S007.11.2',
    -- S008
    'S008.11.1', 'S008.11.2', 'S008.11.3', 'S008.11.4',
    -- S009
    'S009.11.1', 'S009.11.2', 'S009.11.4-1', 'S009.11.4-2', 'S009.11.4-3',
    -- S010
    'S010.11.1', 'S010.11.2',
    -- S011
    'S011.12.1', 'S011.12.2',
    -- S012
    'S012.12.2', 'S012.12.3', 'S012.12.4', 'S012.12.5', 'S012.12.6',
    -- S013
    'S013.12.1',
    -- S014
    'S014.12.1', 'S014.12.2',
    -- S015
    'S015.11.1-1', 'S015.11.1-2', 'S015.11.1-3',
    'S015.11.2-1', 'S015.11.2-2',
    'S015.11.4-1', 'S015.11.4-2',
    -- S016
    'S016.11.1',
    'S016.11.2-1', 'S016.11.2-2',
    'S016.11.3-1', 'S016.11.3-2', 'S016.11.3-3',
    -- S017
    'S017.9.1', 'S017.9.2',
    -- S018
    'S018.9.1', 'S018.9.2', 'S018.9.3',
    -- S019
    'S019.10.1', 'S019.10.2', 'S019.10.4',
    -- S020
    'S020.12.1', 'S020.12.2', 'S020.12.3', 'S020.12.4',
    -- S022
    'S022.12.1', 'S022.12.2',
    -- S023
    'S023.10.1', 'S023.10.2', 'S023.10.4',
    -- S024
    'S024.9.1', 'S024.9.2', 'S024.9.3',
    -- S025
    'S025.9.1',
    -- S026
    'S026.9.1', 'S026.9.2',
    -- S027
    'S027.9.1', 'S027.9.2',
    -- S028
    'S028.9.1',
    -- S031
    'S031.10.1', 'S031.10.2',
    -- S032
    'S032.10.1', 'S032.10.2',
    -- S033
    'S033.10.1', 'S033.10.2', 'S033.10.3', 'S033.10.4', 'S033.10.5',
    -- S035
    'S035.10.1',
    -- S036
    'S036.10.1', 'S036.10.2',
    -- S038
    'S038.9.1',
    -- S039
    'S039.11.2', 'S039.11.3',
    -- S040
    'S040.10.1', 'S040.10.2',
    -- S041
    'S041.9.1',
    -- S042
    'S042.9.1', 'S042.9.2', 'S042.9.4',
    -- S043
    'S043.10.1', 'S043.10.2',
    -- S044
    'S044.10.1',
    -- S045
    'S045.11.1', 'S045.11.2'
  );
