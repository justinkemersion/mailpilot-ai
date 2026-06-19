-- Stable mailbox identity: user_id + provider + normalized_email (not OAuth subject).
-- Reconnect upserts credentials onto the existing row; soft disconnect preserves history.

-- ---------------------------------------------------------------------------
-- 1. New columns (nullable until backfill)
-- ---------------------------------------------------------------------------

alter table api.accounts
  add column if not exists provider text,
  add column if not exists normalized_email text,
  add column if not exists needs_reauth boolean not null default false;

comment on column api.accounts.provider is
  'Mailbox provider slug (gmail today). Part of stable identity with normalized_email.';
comment on column api.accounts.normalized_email is
  'Lowercase trimmed email from provider profile. Part of stable identity with user_id + provider.';
comment on column api.accounts.needs_reauth is
  'True when OAuth tokens expired/revoked; row kept for history until user reconnects.';

-- ---------------------------------------------------------------------------
-- 2. Backfill provider + normalized_email
-- ---------------------------------------------------------------------------

update api.accounts
set
  provider = coalesce(provider, 'gmail'),
  normalized_email = coalesce(normalized_email, lower(trim(email)))
where provider is null or normalized_email is null;

-- ---------------------------------------------------------------------------
-- 3. DRY-RUN / REPORTING (run standalone before merge if you want a preview)
--
-- Lists duplicate identity groups, canonical vs duplicate account ids, and
-- dependent row counts per account. Safe to run repeatedly (read-only).
-- ---------------------------------------------------------------------------

/*
WITH duplicate_groups AS (
  SELECT
    user_id,
    provider,
    normalized_email,
    count(*) AS account_count
  FROM api.accounts
  WHERE normalized_email IS NOT NULL
  GROUP BY user_id, provider, normalized_email
  HAVING count(*) > 1
),
processed_counts AS (
  SELECT account_id, count(*) AS cnt
  FROM api.processed_emails
  GROUP BY account_id
),
claims_counts AS (
  SELECT account_id, count(*) AS cnt
  FROM api.processing_claims
  GROUP BY account_id
),
preferences_counts AS (
  SELECT account_id, count(*) AS cnt
  FROM api.mail_preferences
  GROUP BY account_id
),
action_log_counts AS (
  SELECT account_id, count(*) AS cnt
  FROM api.mail_action_log
  GROUP BY account_id
),
category_counts AS (
  SELECT account_id, count(*) AS cnt
  FROM api.mail_categories
  WHERE account_id IS NOT NULL
  GROUP BY account_id
),
ranked_accounts AS (
  SELECT
    a.id,
    a.user_id,
    a.provider,
    a.normalized_email,
    a.email,
    a.active,
    coalesce(pc.cnt, 0) AS processed_emails_count,
    coalesce(cc.cnt, 0) AS processing_claims_count,
    coalesce(pr.cnt, 0) AS mail_preferences_count,
    coalesce(al.cnt, 0) AS mail_action_log_count,
    coalesce(mc.cnt, 0) AS mail_categories_count,
    row_number() OVER (
      PARTITION BY a.user_id, a.provider, a.normalized_email
      ORDER BY
        a.active DESC,
        coalesce(pc.cnt, 0) DESC,
        a.id ASC
    ) AS rank_in_group
  FROM api.accounts a
  INNER JOIN duplicate_groups dg
    ON dg.user_id = a.user_id
   AND dg.provider = a.provider
   AND dg.normalized_email = a.normalized_email
  LEFT JOIN processed_counts pc ON pc.account_id = a.id
  LEFT JOIN claims_counts cc ON cc.account_id = a.id
  LEFT JOIN preferences_counts pr ON pr.account_id = a.id
  LEFT JOIN action_log_counts al ON al.account_id = a.id
  LEFT JOIN category_counts mc ON mc.account_id = a.id
),
canonical AS (
  SELECT * FROM ranked_accounts WHERE rank_in_group = 1
),
duplicates AS (
  SELECT * FROM ranked_accounts WHERE rank_in_group > 1
)
SELECT
  c.user_id,
  c.provider,
  c.normalized_email,
  c.id AS canonical_account_id,
  c.email AS canonical_email,
  c.active AS canonical_active,
  c.processed_emails_count AS canonical_processed_emails,
  c.mail_preferences_count AS canonical_preferences,
  d.id AS duplicate_account_id,
  d.email AS duplicate_email,
  d.active AS duplicate_active,
  d.processed_emails_count AS duplicate_processed_emails,
  d.processing_claims_count AS duplicate_processing_claims,
  d.mail_preferences_count AS duplicate_preferences,
  d.mail_action_log_count AS duplicate_action_log,
  d.mail_categories_count AS duplicate_categories
FROM canonical c
INNER JOIN duplicates d
  ON d.user_id = c.user_id
 AND d.provider = c.provider
 AND d.normalized_email = c.normalized_email
ORDER BY c.user_id, c.normalized_email, d.id;
*/

-- ---------------------------------------------------------------------------
-- 4. Merge duplicates (only when groups exist) + emit report via RAISE NOTICE
-- ---------------------------------------------------------------------------

do $mailbox_identity_merge$
declare
  dup_group record;
  dup_account record;
  canonical_id bigint;
  report_line text;
  groups_found integer := 0;
begin
  -- Report pass: log each duplicate group before any writes
  for dup_group in
    with duplicate_groups as (
      select user_id, provider, normalized_email, count(*) as account_count
      from api.accounts
      where normalized_email is not null
      group by user_id, provider, normalized_email
      having count(*) > 1
    )
    select * from duplicate_groups
    order by user_id, normalized_email
  loop
    groups_found := groups_found + 1;
    raise notice
      'mailbox_identity duplicate group: user_id=% provider=% email=% accounts=%',
      dup_group.user_id,
      dup_group.provider,
      dup_group.normalized_email,
      dup_group.account_count;
  end loop;

  if groups_found = 0 then
    raise notice 'mailbox_identity merge: no duplicate groups found';
  else
    raise notice 'mailbox_identity merge: % duplicate group(s) to merge', groups_found;
  end if;

  -- Merge pass: one canonical per duplicate group
  for dup_group in
    with processed_counts as (
      select account_id, count(*) as cnt from api.processed_emails group by account_id
    ),
    ranked_accounts as (
      select
        a.id,
        a.user_id,
        a.provider,
        a.normalized_email,
        row_number() over (
          partition by a.user_id, a.provider, a.normalized_email
          order by
            a.active desc,
            coalesce(pc.cnt, 0) desc,
            a.id asc
        ) as rank_in_group
      from api.accounts a
      left join processed_counts pc on pc.account_id = a.id
      where a.normalized_email is not null
    ),
    duplicate_groups as (
      select user_id, provider, normalized_email
      from ranked_accounts
      group by user_id, provider, normalized_email
      having count(*) > 1
    )
    select dg.user_id, dg.provider, dg.normalized_email
    from duplicate_groups dg
    order by dg.user_id, dg.normalized_email
  loop
    select ra.id
    into canonical_id
    from (
      with processed_counts as (
        select account_id, count(*) as cnt from api.processed_emails group by account_id
      )
      select
        a.id,
        row_number() over (
          partition by a.user_id, a.provider, a.normalized_email
          order by
            a.active desc,
            coalesce(pc.cnt, 0) desc,
            a.id asc
        ) as rank_in_group
      from api.accounts a
      left join processed_counts pc on pc.account_id = a.id
      where a.user_id = dup_group.user_id
        and a.provider = dup_group.provider
        and a.normalized_email = dup_group.normalized_email
    ) ra
    where ra.rank_in_group = 1;

    raise notice
      'mailbox_identity merge: canonical account_id=% for %/%',
      canonical_id,
      dup_group.user_id,
      dup_group.normalized_email;

    for dup_account in
      select a.id
      from api.accounts a
      where a.user_id = dup_group.user_id
        and a.provider = dup_group.provider
        and a.normalized_email = dup_group.normalized_email
        and a.id <> canonical_id
      order by a.id
    loop
      select format(
        '  duplicate account_id=% processed_emails=% claims=% preferences=% action_log=% categories=%',
        dup_account.id,
        (select count(*) from api.processed_emails where account_id = dup_account.id),
        (select count(*) from api.processing_claims where account_id = dup_account.id),
        (select count(*) from api.mail_preferences where account_id = dup_account.id),
        (select count(*) from api.mail_action_log where account_id = dup_account.id),
        (select count(*) from api.mail_categories where account_id = dup_account.id)
      )
      into report_line;
      raise notice '%', report_line;

      -- processed_emails: reassign or drop rows that would violate unique (account_id, gmail_message_id)
      delete from api.processed_emails dup_pe
      where dup_pe.account_id = dup_account.id
        and exists (
          select 1
          from api.processed_emails canon_pe
          where canon_pe.account_id = canonical_id
            and canon_pe.gmail_message_id = dup_pe.gmail_message_id
        );

      update api.processed_emails
      set account_id = canonical_id
      where account_id = dup_account.id;

      -- processing_claims: same dedupe strategy
      delete from api.processing_claims dup_cl
      where dup_cl.account_id = dup_account.id
        and exists (
          select 1
          from api.processing_claims canon_cl
          where canon_cl.account_id = canonical_id
            and canon_cl.gmail_message_id = dup_cl.gmail_message_id
        );

      update api.processing_claims
      set account_id = canonical_id
      where account_id = dup_account.id;

      -- mail_action_log: reassign (no unique on account_id + message)
      update api.mail_action_log
      set account_id = canonical_id
      where account_id = dup_account.id;

      -- mail_preferences: drop duplicates that would conflict on enabled rows, then reassign
      delete from api.mail_preferences dup_mp
      where dup_mp.account_id = dup_account.id
        and exists (
          select 1
          from api.mail_preferences canon_mp
          where canon_mp.account_id = canonical_id
            and canon_mp.match_type = dup_mp.match_type
            and canon_mp.match_conditions_json = dup_mp.match_conditions_json
            and canon_mp.enabled = true
            and dup_mp.enabled = true
        );

      update api.mail_preferences
      set account_id = canonical_id
      where account_id = dup_account.id;

      -- mail_categories (account-scoped): drop slug conflicts, then reassign
      delete from api.mail_categories dup_mc
      where dup_mc.account_id = dup_account.id
        and exists (
          select 1
          from api.mail_categories canon_mc
          where canon_mc.account_id = canonical_id
            and canon_mc.slug = dup_mc.slug
        );

      update api.mail_categories
      set account_id = canonical_id
      where account_id = dup_account.id;

      delete from api.accounts where id = dup_account.id;

      raise notice '  merged and deleted duplicate account_id=%', dup_account.id;
    end loop;
  end loop;
end
$mailbox_identity_merge$;

-- ---------------------------------------------------------------------------
-- 5. Constraints after backfill + merge
-- ---------------------------------------------------------------------------

alter table api.accounts
  alter column provider set default 'gmail',
  alter column provider set not null;

alter table api.accounts
  drop constraint if exists accounts_provider_check;

alter table api.accounts
  add constraint accounts_provider_check
  check (provider in ('gmail'));

alter table api.accounts
  alter column normalized_email set not null;

alter table api.accounts
  drop constraint if exists accounts_user_id_email_key;

alter table api.accounts
  drop constraint if exists accounts_user_provider_email_key;

alter table api.accounts
  add constraint accounts_user_provider_email_key
  unique (user_id, provider, normalized_email);
