-- Stable mailbox identity: user_id + provider + normalized_email (not OAuth subject).

alter table public.accounts
  add column if not exists provider text,
  add column if not exists normalized_email text,
  add column if not exists needs_reauth boolean not null default false;

comment on column public.accounts.provider is
  'Mailbox provider slug (gmail today). Part of stable identity with normalized_email.';
comment on column public.accounts.normalized_email is
  'Lowercase trimmed email from provider profile. Part of stable identity with user_id + provider.';
comment on column public.accounts.needs_reauth is
  'True when OAuth tokens expired/revoked; row kept for history until user reconnects.';

update public.accounts
set
  provider = coalesce(provider, 'gmail'),
  normalized_email = coalesce(normalized_email, lower(trim(email)))
where provider is null or normalized_email is null;

-- See flux/migrations/007_mailbox_identity.sql for duplicate merge DO block and dry-run CTE.
-- Supabase deployments with duplicate rows must run that merge before the unique constraint below.

alter table public.accounts
  alter column provider set default 'gmail',
  alter column provider set not null;

alter table public.accounts
  drop constraint if exists accounts_provider_check;

alter table public.accounts
  add constraint accounts_provider_check
  check (provider in ('gmail'));

alter table public.accounts
  alter column normalized_email set not null;

alter table public.accounts
  drop constraint if exists accounts_user_id_email_key;

alter table public.accounts
  drop constraint if exists accounts_user_provider_email_key;

alter table public.accounts
  add constraint accounts_user_provider_email_key
  unique (user_id, provider, normalized_email);
