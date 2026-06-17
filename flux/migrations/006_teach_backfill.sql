-- Phase 9H: teach backfill tracking + teach_revert audit action.

alter table api.processed_emails
  add column if not exists taught_preference_id bigint
    references api.mail_preferences(id) on delete set null,
  add column if not exists taught_revert_state jsonb;

create index if not exists processed_emails_taught_preference_idx
  on api.processed_emails (taught_preference_id)
  where taught_preference_id is not null;

alter table api.mail_action_log
  drop constraint if exists mail_action_log_action_taken_check;

alter table api.mail_action_log
  add constraint mail_action_log_action_taken_check
  check (action_taken in (
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
