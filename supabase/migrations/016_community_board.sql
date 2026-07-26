create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  author_name text not null default '여행자',
  destination text,
  category text not null default 'tip' check (category in ('tip','question','review','companion')),
  title text not null check (char_length(title) between 2 and 120),
  content text not null check (char_length(content) between 2 and 4000),
  hidden boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.community_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (char_length(reason) between 2 and 500),
  status text not null default 'pending' check (status in ('pending','reviewed','dismissed')),
  created_at timestamptz not null default now(),
  unique(post_id, reporter_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

alter table public.community_posts enable row level security;
alter table public.community_reports enable row level security;
alter table public.user_blocks enable row level security;

create policy "authenticated read visible posts" on public.community_posts
for select to authenticated using (
  hidden = false or author_id = (select auth.uid())
  or coalesce((select (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean), false)
);
create policy "users create own posts" on public.community_posts
for insert to authenticated with check (author_id = (select auth.uid()));
create policy "users update own posts" on public.community_posts
for update to authenticated using (author_id = (select auth.uid()))
with check (author_id = (select auth.uid()));
create policy "users delete own posts" on public.community_posts
for delete to authenticated using (
  author_id = (select auth.uid())
  or coalesce((select (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean), false)
);
create policy "admins moderate posts" on public.community_posts
for update to authenticated
using (coalesce((select (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean), false))
with check (coalesce((select (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean), false));

create policy "users create own reports" on public.community_reports
for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "users read own reports" on public.community_reports
for select to authenticated using (
  reporter_id = (select auth.uid())
  or coalesce((select (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean), false)
);
create policy "admins update reports" on public.community_reports
for update to authenticated
using (coalesce((select (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean), false))
with check (coalesce((select (auth.jwt() -> 'app_metadata' ->> 'is_admin')::boolean), false));

create policy "users manage own blocks" on public.user_blocks
for all to authenticated
using (blocker_id = (select auth.uid()))
with check (blocker_id = (select auth.uid()));

create index if not exists community_posts_created_idx on public.community_posts(created_at desc);
create index if not exists community_posts_destination_idx on public.community_posts(destination);
create index if not exists community_reports_status_idx on public.community_reports(status, created_at);
