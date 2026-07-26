alter table public.community_posts
  add column if not exists source_trip_id uuid references public.trips(id) on delete set null;

drop policy if exists "users create own posts" on public.community_posts;
create policy "users create own posts" on public.community_posts
for insert to authenticated
with check (
  author_id = (select auth.uid())
  and (source_trip_id is null or public.is_trip_member(source_trip_id))
);

create index if not exists community_posts_source_trip_idx
  on public.community_posts(source_trip_id, created_at desc)
  where source_trip_id is not null;

comment on column public.community_posts.source_trip_id is '게시글 초안을 만든 여행. 한 여행에서 여러 준비 기록·여행 소식·후기를 게시할 수 있음';
