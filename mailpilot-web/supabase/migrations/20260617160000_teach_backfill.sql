-- Phase 9H: teach backfill tracking + teach_revert audit action.

ALTER TABLE public.processed_emails
  ADD COLUMN IF NOT EXISTS taught_preference_id BIGINT
    REFERENCES public.mail_preferences(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS taught_revert_state JSONB;

CREATE INDEX IF NOT EXISTS processed_emails_taught_preference_idx
  ON public.processed_emails (taught_preference_id)
  WHERE taught_preference_id IS NOT NULL;

ALTER TABLE public.mail_action_log
  DROP CONSTRAINT IF EXISTS mail_action_log_action_taken_check;

ALTER TABLE public.mail_action_log
  ADD CONSTRAINT mail_action_log_action_taken_check
  CHECK (action_taken IN (
    'label',
    'archive',
    'keep',
    'archive_blocked',
    'undo_archive',
    'teach',
    'teach_revert',
    'cleanup_archive',
    'cleanup_keep'
  ));
