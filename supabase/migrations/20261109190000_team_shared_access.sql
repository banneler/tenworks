-- Signed-in users share CRM rows. Owner and manager policies are replaced
-- with one team policy. user_id columns and auth.uid() defaults stay, so a
-- new row still records who created it. No row values are rewritten.
--
-- Personal connection tables stay owner-scoped and are not touched:
--   user_integrations (Nylas grant ids)
--   user_settings (email signature)
--
-- Anon is revoked on the tables whose policies change. Customer portal
-- RPCs are SECURITY DEFINER and do not use these policies.
-- is_manager() is dropped only when no policy still calls it, and the
-- drop is caught if another object still depends on the function.

do $$
declare
  r record;
  t text;
  seq record;
  touched text[] := array[]::text[];
  known text[] := array[
    'deals_tw',
    'accounts',
    'contacts',
    'proposals_tw',
    'cognito_discovery_tw',
    'cognito_sdr_leads_tw',
    'activities',
    'tasks',
    'sequences',
    'contact_sequences',
    'campaigns',
    'cognito_alerts',
    'user_quotas'
  ];
begin
  execute 'drop policy if exists "Users can insert own deals" on public.deals_tw';
  execute 'drop policy if exists "Users can update own deals" on public.deals_tw';
  execute 'drop policy if exists "Users can manage own proposals" on public.proposals_tw';
  execute 'drop policy if exists "Users manage own rows" on public.cognito_discovery_tw';
  execute 'drop policy if exists "Managers read all" on public.cognito_discovery_tw';
  execute 'drop policy if exists "Users manage own rows" on public.cognito_sdr_leads_tw';
  execute 'drop policy if exists "Managers read all" on public.cognito_sdr_leads_tw';

  for r in
    select n.nspname, c.relname, p.polname,
           pg_get_expr(p.polqual, p.polrelid) as using_expr,
           pg_get_expr(p.polwithcheck, p.polrelid) as check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relname not in ('user_integrations', 'user_settings')
  loop
    if coalesce(r.using_expr, '') ~* 'is_manager\s*\('
       or coalesce(r.check_expr, '') ~* 'is_manager\s*\('
       or coalesce(r.using_expr, '') ~* 'auth\.uid\(\)\s*=\s*user_id'
       or coalesce(r.using_expr, '') ~* 'user_id\s*=\s*auth\.uid\(\)'
       or coalesce(r.check_expr, '') ~* 'auth\.uid\(\)\s*=\s*user_id'
       or coalesce(r.check_expr, '') ~* 'user_id\s*=\s*auth\.uid\(\)'
    then
      execute format('drop policy %I on %I.%I', r.polname, r.nspname, r.relname);
      touched := array_append(touched, r.relname);
    end if;
  end loop;

  foreach t in array known
  loop
    if to_regclass('public.' || t) is not null then
      touched := array_append(touched, t);
    end if;
  end loop;

  for t in
    select distinct name
    from unnest(touched) as name
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Team full access" on public.%I', t);
    execute format(
      'create policy "Team full access" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;

  for seq in
    select distinct sn.nspname, s.relname
    from pg_class s
    join pg_namespace sn on sn.oid = s.relnamespace
    join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    join pg_class tbl on tbl.oid = d.refobjid
    join pg_namespace tn on tn.oid = tbl.relnamespace
    where s.relkind = 'S'
      and tn.nspname = 'public'
      and tbl.relname in (select distinct name from unnest(touched) as name)
  loop
    execute format('revoke all on sequence %I.%I from anon', seq.nspname, seq.relname);
    execute format('grant usage, select on sequence %I.%I to authenticated', seq.nspname, seq.relname);
  end loop;
end $$;

do $$
begin
  if to_regprocedure('public.is_manager()') is null then
    return;
  end if;

  if exists (
    select 1
    from pg_policy p
    where coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~* 'is_manager\s*\('
       or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~* 'is_manager\s*\('
  ) then
    raise notice 'public.is_manager() is still used by a policy and was left in place';
    return;
  end if;

  begin
    execute 'drop function public.is_manager()';
  exception
    when dependent_objects_still_exist then
      raise notice 'public.is_manager() still has dependents and was left in place';
  end;
end $$;
