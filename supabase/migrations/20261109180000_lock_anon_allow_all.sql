-- Drop anonymous allow-all policies on six tables and replace them with the
-- same authenticated team-wide policy the other shop tables already use
-- (see 20261104120000_polish_rls_and_admin_views.sql).
--
-- Usage audit (every read/write in this repo):
--   talent_skills
--     js/talent.js select/delete/insert — signed-in (redirects to index.html)
--   task_assignments
--     js/talent.js select/delete/upsert/insert — signed-in
--     js/mobile.js select/update — signed-in (getSession, redirects)
--     js/shop.js select — signed-in (loadAllData returns unless currentUser)
--     js/schedule.js select — signed-in
--     js/projects.js select — signed-in
--     js/shop-dashboard.js select — NO session check. The same fetch also reads
--       projects, project_tasks, shop_talent, and shop_trades, which have been
--       authenticated-only since 20261104120000. An anonymous TV already gets
--       an empty board. No anon policy is added.
--   project_contacts
--     js/projects.js select — signed-in
--     js/project_launch_shared.js insert — signed-in
--     Customer portal (js/status.js) does not query this table. It calls
--       get_project_status, get_portal_projects, and get_project_status_by_portal.
--       Those are SECURITY DEFINER and keep working for anon.
--   project_notes
--     js/projects.js select/insert — signed-in
--     js/schedule.js select id — signed-in
--   project_change_orders
--     js/projects.js select/insert/delete — signed-in
--     Repo policy "Allow all for project_change_orders" has no TO role, so it
--       applies to PUBLIC (including anon).
--   purchase_orders
--     js/inventory.js select/insert/update — signed-in
--     js/projects.js insert — signed-in
--     Repo policy "Allow all for authenticated" has no TO role, so it applies
--       to PUBLIC despite the name.
--   api/ does not touch these tables. Seed SQL runs as the migration role.
--
-- This drops only policies granted to PUBLIC (oid 0) or anon. Authenticated-only
-- policies are left in place. No rows, columns, or other tables are changed.

do $$
declare
  r record;
  t text;
  seq record;
  tables text[] := array[
    'talent_skills',
    'task_assignments',
    'project_contacts',
    'project_notes',
    'project_change_orders',
    'purchase_orders'
  ];
begin
  for r in
    select n.nspname, c.relname, p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = any (tables)
      and (
        0::oid = any (p.polroles)
        or exists (
          select 1
          from pg_roles role
          where role.oid = any (p.polroles)
            and role.rolname = 'anon'
        )
      )
  loop
    execute format('drop policy %I on %I.%I', r.polname, r.nspname, r.relname);
  end loop;

  -- Known allow-all names, in case a policy row was missed above.
  execute 'drop policy if exists "Allow all for authenticated" on public.purchase_orders';
  execute 'drop policy if exists "Allow all for project_change_orders" on public.project_change_orders';

  foreach t in array tables
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Authenticated full access" on public.%I', t);
    execute format(
      'create policy "Authenticated full access" on public.%I for all to authenticated using (true) with check (true)',
      t
    );
    execute format('revoke all on table public.%I from anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
  end loop;

  for seq in
    select sn.nspname, s.relname
    from pg_class s
    join pg_namespace sn on sn.oid = s.relnamespace
    join pg_depend d on d.objid = s.oid and d.deptype in ('a', 'i')
    join pg_class tbl on tbl.oid = d.refobjid
    join pg_namespace tn on tn.oid = tbl.relnamespace
    where s.relkind = 'S'
      and tn.nspname = 'public'
      and tbl.relname = any (tables)
  loop
    execute format('revoke all on sequence %I.%I from anon', seq.nspname, seq.relname);
    execute format('grant usage, select on sequence %I.%I to authenticated', seq.nspname, seq.relname);
  end loop;
end $$;
