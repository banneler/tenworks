-- People directory policies. Separate from the column migration.
-- Signed-in users can read. Inserts and updates require public.is_ops()
-- (app_metadata role admin or ops, or is_admin).
-- shop_talent and shop_trades have no delete policy: retire them with active = false.
-- Skill, PTO, and rate-history rows can be removed by ops because those edits
-- replace a person's current skills, days off, or rate rows.

do $$
declare
  t text;
  tables text[] := array[
    'shop_talent',
    'shop_trades',
    'talent_skills',
    'talent_availability',
    'talent_rate_history'
  ];
begin
  foreach t in array tables
  loop
    if to_regclass('public.' || t) is null then
      raise notice '% is missing; policies skipped', t;
      continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Authenticated full access" on public.%I', t);
    execute format('drop policy if exists "Team full access" on public.%I', t);
    execute format('drop policy if exists "People read" on public.%I', t);
    execute format('drop policy if exists "Ops insert" on public.%I', t);
    execute format('drop policy if exists "Ops update" on public.%I', t);
    execute format('drop policy if exists "Ops delete" on public.%I', t);
    execute format(
      'create policy "People read" on public.%I for select to authenticated using (true)',
      t
    );
    execute format(
      'create policy "Ops insert" on public.%I for insert to authenticated with check (coalesce(public.is_ops(), false))',
      t
    );
    execute format(
      'create policy "Ops update" on public.%I for update to authenticated using (coalesce(public.is_ops(), false)) with check (coalesce(public.is_ops(), false))',
      t
    );
    if t in ('talent_skills', 'talent_availability', 'talent_rate_history') then
      execute format(
        'create policy "Ops delete" on public.%I for delete to authenticated using (coalesce(public.is_ops(), false))',
        t
      );
    end if;
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;
end $$;

do $$
declare
  seq record;
begin
  for seq in
    select sn.nspname, s.relname
    from pg_class s
    join pg_namespace sn on sn.oid = s.relnamespace
    join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    join pg_class tbl on tbl.oid = d.refobjid
    join pg_namespace tn on tn.oid = tbl.relnamespace
    where s.relkind = 'S'
      and tn.nspname = 'public'
      and tbl.relname = 'talent_rate_history'
  loop
    execute format('revoke all on sequence %I.%I from anon', seq.nspname, seq.relname);
    execute format('grant usage, select on sequence %I.%I to authenticated', seq.nspname, seq.relname);
  end loop;
end $$;
