-- Phase 9 tables shipped without RLS. Close that.
--
-- 003/004/005 created api.mail_categories, api.mail_action_log, and
-- api.mail_preferences but never enabled row level security and never wrote
-- policies. 001 grants DML on the schema to `anon, authenticated, service_role`
-- and sets `alter default privileges` to keep doing so for future tables, on the
-- understanding that RLS is the gate. With RLS off, that grant was the whole
-- story: an unauthenticated caller could read and write all three tables.
--
-- Policies follow 001 exactly: `auth.uid()` returns the PostgREST JWT `sub` as
-- text, matching the `user_id text` columns, and it is null for `anon`, so
-- `auth.uid() = user_id` is null -> false and unauthenticated access sees
-- nothing. No `to` clause, also per 001, so the same rule covers every role that
-- reaches PostgREST.
--
-- Writes additionally prove ownership of the parent api.accounts row rather than
-- trusting `user_id` alone, so a caller cannot attach a row to another user's
-- account. The proof is inlined rather than factored into a helper function on
-- purpose: PGRST_DB_SCHEMAS exposes `api`, so a helper there would also become a
-- callable /rpc endpoint. The subquery reads api.accounts under that table's own
-- RLS from 001, which already restricts it to `auth.uid() = user_id`, so an
-- unowned account_id simply matches no row.

alter table api.mail_categories enable row level security;
alter table api.mail_action_log enable row level security;
alter table api.mail_preferences enable row level security;

-- Idempotent: this migration is the first to define these names, but a partial
-- apply must be safe to re-run.
drop policy if exists mail_categories_select_own on api.mail_categories;
drop policy if exists mail_categories_insert_own on api.mail_categories;
drop policy if exists mail_categories_update_own on api.mail_categories;
drop policy if exists mail_categories_delete_own on api.mail_categories;
drop policy if exists mail_action_log_select_own on api.mail_action_log;
drop policy if exists mail_action_log_insert_own on api.mail_action_log;
drop policy if exists mail_preferences_select_own on api.mail_preferences;
drop policy if exists mail_preferences_insert_own on api.mail_preferences;
drop policy if exists mail_preferences_update_own on api.mail_preferences;
drop policy if exists mail_preferences_delete_own on api.mail_preferences;

create policy mail_categories_select_own
  on api.mail_categories for select
  using (auth.uid() = user_id);

-- account_id is nullable here by design: a null account_id is a user-global
-- category (see the two partial unique indexes in 003), so only a non-null
-- account_id has to resolve to an owned account.
create policy mail_categories_insert_own
  on api.mail_categories for insert
  with check (
    auth.uid() = user_id
    and (
      account_id is null
      or exists (
        select 1 from api.accounts a
        where a.id = mail_categories.account_id
          and a.user_id = auth.uid()
      )
    )
  );

create policy mail_categories_update_own
  on api.mail_categories for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      account_id is null
      or exists (
        select 1 from api.accounts a
        where a.id = mail_categories.account_id
          and a.user_id = auth.uid()
      )
    )
  );

create policy mail_categories_delete_own
  on api.mail_categories for delete
  using (auth.uid() = user_id);

-- mail_action_log is append-only (see mailpilot/action_logger.py), so it gets no
-- update or delete policy, the same way 001 gives run_jobs only select+insert.
create policy mail_action_log_select_own
  on api.mail_action_log for select
  using (auth.uid() = user_id);

create policy mail_action_log_insert_own
  on api.mail_action_log for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from api.accounts a
      where a.id = mail_action_log.account_id
        and a.user_id = auth.uid()
    )
  );

create policy mail_preferences_select_own
  on api.mail_preferences for select
  using (auth.uid() = user_id);

create policy mail_preferences_insert_own
  on api.mail_preferences for insert
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from api.accounts a
      where a.id = mail_preferences.account_id
        and a.user_id = auth.uid()
    )
  );

create policy mail_preferences_update_own
  on api.mail_preferences for update
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from api.accounts a
      where a.id = mail_preferences.account_id
        and a.user_id = auth.uid()
    )
  );

create policy mail_preferences_delete_own
  on api.mail_preferences for delete
  using (auth.uid() = user_id);
