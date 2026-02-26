-- Clear all assignment data for a fresh start.
-- Order respects foreign key constraints: child tables before parent tables.
-- Uses DELETE FROM (not TRUNCATE) to be safe with foreign key constraints.

DELETE FROM submissions;
DELETE FROM assignment_instances;
DELETE FROM assignments;
