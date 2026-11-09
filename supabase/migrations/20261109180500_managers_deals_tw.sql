-- Managers can read, update, and delete every deal.
-- This mirrors public.is_manager(), the gate already used by
-- "Managers read all" on cognito_discovery_tw and cognito_sdr_leads_tw
-- (20261104120000). It does not create a new role or function.
-- Owner insert and owner update policies are left in place.
-- The deals page turns team view on from user_metadata.is_manager.
-- admin_users_list reads that same metadata key. The policy calls
-- public.is_manager(), which is the existing SQL check. If that
-- function is not installed, this migration stops.

do $$
begin
  if to_regprocedure('public.is_manager()') is null then
    raise exception 'public.is_manager() is not installed, so manager deal policies were not created';
  end if;
end $$;

alter table public.deals_tw enable row level security;

drop policy if exists "Managers read all deals" on public.deals_tw;
create policy "Managers read all deals"
  on public.deals_tw
  for select
  to authenticated
  using (public.is_manager() = true);

drop policy if exists "Managers update all deals" on public.deals_tw;
create policy "Managers update all deals"
  on public.deals_tw
  for update
  to authenticated
  using (public.is_manager() = true)
  with check (public.is_manager() = true);

drop policy if exists "Managers delete all deals" on public.deals_tw;
create policy "Managers delete all deals"
  on public.deals_tw
  for delete
  to authenticated
  using (public.is_manager() = true);
