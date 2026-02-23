-- Proposal Generator: save/load proposals in Supabase.
-- Run via Supabase dashboard SQL Editor or: supabase db push

create table if not exists public.proposals_tw (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deal_id bigint references public.deals_tw(id) on delete set null,
  project_id bigint references public.projects(id) on delete set null,
  title text,
  client_name text,
  content_json jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft','sent','won')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists proposals_tw_user_id_idx on public.proposals_tw(user_id);
create index if not exists proposals_tw_deal_id_idx on public.proposals_tw(deal_id);
create index if not exists proposals_tw_updated_at_idx on public.proposals_tw(updated_at desc);

alter table public.proposals_tw enable row level security;

drop policy if exists "Users can manage own proposals" on public.proposals_tw;
create policy "Users can manage own proposals"
  on public.proposals_tw for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.proposals_tw_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists proposals_tw_updated_at on public.proposals_tw;
create trigger proposals_tw_updated_at
  before update on public.proposals_tw
  for each row execute function public.proposals_tw_updated_at();
