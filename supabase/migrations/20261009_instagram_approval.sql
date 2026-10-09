-- PostPilot Instagram approval workflow. Non-destructive: preserves existing posts and bulk batches.
alter table public.posts
  add column if not exists approval_status text not null default 'not_required',
  add column if not exists instagram_media_id text,
  add column if not exists publish_error text,
  add column if not exists approved_at timestamptz,
  add column if not exists published_at timestamptz;

alter table public.posts drop constraint if exists posts_approval_status_check;
alter table public.posts add constraint posts_approval_status_check
  check (approval_status in ('not_required','pending','approved','publishing','published','failed'));

-- Existing and future scheduled content requires review before API publishing.
update public.posts set approval_status = 'pending'
where status = 'scheduled' and approval_status = 'not_required';

create table if not exists public.instagram_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ig_user_id text not null,
  ig_username text,
  page_id text,
  token_ciphertext text not null,
  token_expires_at timestamptz,
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.instagram_connections enable row level security;
drop policy if exists "Users cannot read Instagram tokens" on public.instagram_connections;
-- Deliberately no client policies. Only the service-role Edge Function may access this table.

create table if not exists public.instagram_oauth_states (
  state_hash text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
alter table public.instagram_oauth_states enable row level security;
-- Deliberately no client policies.

create table if not exists public.instagram_publish_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.posts(id) on delete set null,
  action text not null,
  outcome text not null,
  meta_media_id text,
  message text,
  created_at timestamptz not null default now()
);
alter table public.instagram_publish_logs enable row level security;
create policy "Users can view their Instagram publish logs"
  on public.instagram_publish_logs for select to authenticated
  using (auth.uid() = user_id);

create index if not exists posts_approval_status_scheduled_idx
  on public.posts (user_id, approval_status, scheduled_at);
