-- Agency tasks can now wait for an admin's review between "in progress" and "done".
-- (On its own: a new enum value can't be used in the same transaction that adds it.)
alter type public.task_status add value if not exists 'in_review' after 'in_progress';
