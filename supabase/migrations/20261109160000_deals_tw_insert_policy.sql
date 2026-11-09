-- Polish pass (2026-11-09): signed-in users could read/update their own deals but had no INSERT policy,
-- so every New Deal failed with an RLS violation. Mirror the accounts pattern: owner-scoped insert,
-- and default user_id to the caller.
alter table public.deals_tw alter column user_id set default auth.uid();
drop policy if exists "Users can insert own deals" on public.deals_tw;
create policy "Users can insert own deals"
  on public.deals_tw
  for insert
  to authenticated
  with check (auth.uid() = user_id);
