-- Allow users to update their own deals (e.g. elements, is_committed, stage).
-- Fixes "Could not update deal. You may not have permission." when toggling elements.
alter table public.deals_tw enable row level security;

drop policy if exists "Users can update own deals" on public.deals_tw;
create policy "Users can update own deals"
  on public.deals_tw
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
