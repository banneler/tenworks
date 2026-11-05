-- Polish pass (2026-11-04): enable RLS on previously open tables, lock down admin views,
-- and restore the missing auth.users -> user_quotas trigger.

-- 1) Shared shop / ERP tables: any signed-in user may read & write (team-wide data); anon gets nothing.
do $$
declare t text;
begin
  foreach t in array array['inventory_items','project_bom','project_tasks','project_template_tasks',
    'project_templates','projects','shop_machines','shop_talent','shop_trades','talent_availability']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Authenticated full access" on public.%I', t);
    execute format('create policy "Authenticated full access" on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- 2) Cognito feeds: owner-scoped (scripts write with the service role, which bypasses RLS); managers can read all.
do $$
declare t text;
begin
  foreach t in array array['cognito_discovery_tw','cognito_sdr_leads_tw']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Users manage own rows" on public.%I', t);
    execute format('create policy "Users manage own rows" on public.%I for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
    execute format('drop policy if exists "Managers read all" on public.%I', t);
    execute format('create policy "Managers read all" on public.%I for select to authenticated using (public.is_manager() = true)', t);
  end loop;
end $$;

-- 3) Admin views: data now comes from admin-gated SECURITY DEFINER functions; views are security_invoker.
create or replace function public.admin_users_list()
returns table(user_id uuid, email text, full_name text, last_login timestamptz, monthly_quota numeric, is_manager boolean, exclude_from_reporting boolean)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, uq.full_name, u.last_sign_in_at, uq.monthly_quota::numeric,
         coalesce((u.raw_user_meta_data->>'is_manager')::boolean, false),
         coalesce((u.raw_user_meta_data->>'exclude_from_reporting')::boolean, false)
  from auth.users u left join public.user_quotas uq on u.id = uq.user_id
  where coalesce(public.is_admin(), false);
$$;

create or replace function public.admin_activity_log_list()
returns table(activity_date timestamptz, user_name text, activity_type text, description text, contact_name text, account_name text)
language sql stable security definer set search_path = '' as $$
  select a.date::timestamptz, uq.full_name, a.type::text, a.description::text,
         (c.first_name || ' ' || c.last_name)::text, ac.name::text
  from public.activities a
  join public.user_quotas uq on a.user_id = uq.user_id
  left join public.contacts c on a.contact_id = c.id
  left join public.accounts ac on a.account_id = ac.id
  where coalesce(public.is_admin(), false);
$$;

create or replace function public.admin_script_logs_list()
returns table(id bigint, script_name text, last_completed_at timestamptz, outcome text, user_id uuid, full_name text)
language sql stable security definer set search_path = '' as $$
  select srl.id, srl.script_name::text, srl.last_completed_at, srl.outcome::text, srl.user_id, uq.full_name
  from public.script_run_logs srl left join public.user_quotas uq on srl.user_id = uq.user_id
  where coalesce(public.is_admin(), false);
$$;

revoke all on function public.admin_users_list(), public.admin_activity_log_list(), public.admin_script_logs_list() from public, anon;
grant execute on function public.admin_users_list(), public.admin_activity_log_list(), public.admin_script_logs_list() to authenticated;

drop view if exists public.admin_users_view;
drop view if exists public.admin_activity_log_view;
drop view if exists public.admin_script_logs_view;
create view public.admin_users_view with (security_invoker = true) as select * from public.admin_users_list();
create view public.admin_activity_log_view with (security_invoker = true) as select * from public.admin_activity_log_list();
create view public.admin_script_logs_view with (security_invoker = true) as select * from public.admin_script_logs_list();
revoke all on public.admin_users_view, public.admin_activity_log_view, public.admin_script_logs_view from anon, public;
grant select on public.admin_users_view, public.admin_activity_log_view, public.admin_script_logs_view to authenticated;

-- 4) New sign-ups get a user_quotas row (handle_new_user existed but no trigger called it).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
insert into public.user_quotas (user_id, full_name)
select u.id, u.raw_user_meta_data->>'full_name' from auth.users u
where not exists (select 1 from public.user_quotas q where q.user_id = u.id)
  and u.email not like 'zz-agent-test%';
