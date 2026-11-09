-- Admin is an app_metadata claim, not something a user can set on themselves.
-- Copies only the is_admin key (and the existing exclude_from_reporting key,
-- so that reporting flag keeps its current value when writers move to
-- app_metadata). No other auth columns change. No rows in public tables change.

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('is_admin', true)
where case
        when jsonb_typeof(raw_user_meta_data->'is_admin') = 'boolean'
          then (raw_user_meta_data->>'is_admin')::boolean
        when lower(coalesce(raw_user_meta_data->>'is_admin', '')) in ('true', 't', '1')
          then true
        else false
      end
  and coalesce((raw_app_meta_data->>'is_admin')::boolean, false) is not true;

update auth.users
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
       'exclude_from_reporting',
       case
         when jsonb_typeof(raw_user_meta_data->'exclude_from_reporting') = 'boolean'
           then (raw_user_meta_data->>'exclude_from_reporting')::boolean
         when lower(coalesce(raw_user_meta_data->>'exclude_from_reporting', '')) in ('true', 't', '1')
           then true
         else false
       end
     )
where raw_user_meta_data ? 'exclude_from_reporting'
  and not (coalesce(raw_app_meta_data, '{}'::jsonb) ? 'exclude_from_reporting');

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select case
               when jsonb_typeof(u.raw_app_meta_data->'is_admin') = 'boolean'
                 then (u.raw_app_meta_data->>'is_admin')::boolean
               when lower(coalesce(u.raw_app_meta_data->>'is_admin', '')) in ('true', 't', '1')
                 then true
               else false
             end
      from auth.users u
      where u.id = (select auth.uid())
    ),
    false
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- The user list for the admin page reads the reporting flag from app_metadata.
-- is_manager stays a leftover display column and does not grant access.
create or replace function public.admin_users_list()
returns table(user_id uuid, email text, full_name text, last_login timestamptz, monthly_quota numeric, is_manager boolean, exclude_from_reporting boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select u.id,
         u.email::text,
         uq.full_name,
         u.last_sign_in_at,
         uq.monthly_quota::numeric,
         coalesce((u.raw_user_meta_data->>'is_manager')::boolean, false),
         coalesce((u.raw_app_meta_data->>'exclude_from_reporting')::boolean, false)
  from auth.users u
  left join public.user_quotas uq on u.id = uq.user_id
  where coalesce(public.is_admin(), false);
$$;

revoke all on function public.admin_users_list() from public, anon;
grant execute on function public.admin_users_list() to authenticated;

drop function if exists public.set_manager_status(uuid, boolean);

do $$
declare
  ret text;
  src text;
  argnames text[];
  a1 text;
  a2 text;
  a3 text;
begin
  -- sync_user_manager_status used to copy the manager flag. Keep the
  -- signature so a trigger does not break, and stop writing metadata.
  if to_regprocedure('public.sync_user_manager_status()') is not null then
    select t.typname into ret
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_type t on t.oid = p.prorettype
    where n.nspname = 'public' and p.proname = 'sync_user_manager_status'
      and pg_get_function_identity_arguments(p.oid) = '';
    if ret = 'trigger' then
      execute $fn$
        create or replace function public.sync_user_manager_status()
        returns trigger
        language plpgsql
        security definer
        set search_path = ''
        as $body$
        begin
          return new;
        end;
        $body$;
      $fn$;
    elsif ret = 'void' then
      execute $fn$
        create or replace function public.sync_user_manager_status()
        returns void
        language plpgsql
        security definer
        set search_path = ''
        as $body$
        begin
          return;
        end;
        $body$;
      $fn$;
    else
      raise notice 'sync_user_manager_status() returns % and was left in place', ret;
    end if;
    execute 'revoke all on function public.sync_user_manager_status() from public, anon';
  end if;

  if to_regprocedure('public.set_reporting_status(uuid,boolean)') is not null then
    begin
      execute $fn$
        create or replace function public.set_reporting_status(target_user_id uuid, exclude_from_reporting boolean)
        returns void
        language plpgsql
        security definer
        set search_path = ''
        as $body$
        begin
          if coalesce(public.is_admin(), false) is not true then
            raise exception 'admin only' using errcode = '42501';
          end if;
          update auth.users
          set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
            || jsonb_build_object('exclude_from_reporting', coalesce(exclude_from_reporting, false))
          where id = target_user_id;
        end;
        $body$;
      $fn$;
    exception
      when others then
        raise notice 'set_reporting_status was not replaced: %', sqlerrm;
    end;
    execute 'revoke all on function public.set_reporting_status(uuid,boolean) from public, anon';
    execute 'grant execute on function public.set_reporting_status(uuid,boolean) to authenticated';
  end if;

  select p.proargnames, p.prosrc
    into argnames, src
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'set_user_metadata_admin'
    and pg_get_function_identity_arguments(p.oid) = 'uuid, boolean, boolean';

  if found then
    if argnames is null or cardinality(argnames) < 3 then
      argnames := array['target_user_id', 'is_admin', 'exclude_from_reporting'];
    end if;
    a1 := argnames[1];
    a2 := argnames[2];
    a3 := argnames[3];
    -- A manager argument is not turned into an admin grant.
    execute format($fmt$
      create or replace function public.set_user_metadata_admin(%1$I uuid, %2$I boolean, %3$I boolean)
      returns void
      language plpgsql
      security definer
      set search_path = ''
      as $body$
      declare
        app jsonb := '{}'::jsonb;
        write_admin boolean := false;
        write_exclude boolean := false;
        admin_value boolean := false;
        exclude_value boolean := false;
      begin
        if coalesce(public.is_admin(), false) is not true then
          raise exception 'admin only' using errcode = '42501';
        end if;
        if position('manager' in lower(%2$L)) = 0 and position('admin' in lower(%2$L)) > 0 then
          write_admin := true;
          admin_value := coalesce(%2$I, false);
        elsif position('report' in lower(%2$L)) > 0 or position('exclu' in lower(%2$L)) > 0 then
          write_exclude := true;
          exclude_value := coalesce(%2$I, false);
        end if;
        if position('manager' in lower(%3$L)) = 0 and position('admin' in lower(%3$L)) > 0 then
          write_admin := true;
          admin_value := coalesce(%3$I, false);
        elsif position('report' in lower(%3$L)) > 0 or position('exclu' in lower(%3$L)) > 0 then
          write_exclude := true;
          exclude_value := coalesce(%3$I, false);
        end if;
        if not write_admin and not write_exclude then
          if position('manager' in lower(%2$L)) = 0 then
            write_admin := true;
            admin_value := coalesce(%2$I, false);
          end if;
          write_exclude := true;
          exclude_value := coalesce(%3$I, false);
        end if;
        select coalesce(raw_app_meta_data, '{}'::jsonb) into app
        from auth.users where id = %1$I;
        app := coalesce(app, '{}'::jsonb);
        if write_admin then
          app := app || jsonb_build_object('is_admin', admin_value);
        end if;
        if write_exclude then
          app := app || jsonb_build_object('exclude_from_reporting', exclude_value);
        end if;
        update auth.users set raw_app_meta_data = app where id = %1$I;
      end;
      $body$;
    $fmt$, a1, a2, a3);
    execute 'revoke all on function public.set_user_metadata_admin(uuid, boolean, boolean) from public, anon';
    execute 'grant execute on function public.set_user_metadata_admin(uuid, boolean, boolean) to authenticated';
  end if;
end $$;

do $$
declare
  r record;
  def text;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args, l.lanname
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    join pg_language l on l.oid = p.prolang
    where n.nspname = 'public'
      and p.proname = 'get_all_users_with_roles'
  loop
    execute format('revoke all on function public.get_all_users_with_roles(%s) from public, anon', r.args);
    execute format('grant execute on function public.get_all_users_with_roles(%s) to authenticated', r.args);
    def := pg_get_functiondef(r.oid);
    def := replace(def, 'raw_user_meta_data->>''is_admin''', 'raw_app_meta_data->>''is_admin''');
    def := replace(def, 'raw_user_meta_data ->> ''is_admin''', 'raw_app_meta_data ->> ''is_admin''');
    def := replace(def, 'user_metadata->>''is_admin''', 'app_metadata->>''is_admin''');
    def := replace(def, 'user_metadata ->> ''is_admin''', 'app_metadata ->> ''is_admin''');
    if r.lanname = 'plpgsql' and def !~* 'public\.is_admin\(\)' then
      def := regexp_replace(
        def,
        '(\$[A-Za-z0-9_]*\$[[:space:]]*)begin',
        E'\\1begin\n  if coalesce(public.is_admin(), false) is not true then\n    raise exception ''admin only'' using errcode = ''42501'';\n  end if;',
        'i'
      );
    end if;
    execute def;
  end loop;
end $$;

do $$
declare
  r record;
begin
  if to_regclass('public.user_feature_controls') is null then
    raise notice 'user_feature_controls is not present; feature-control policies were skipped';
    return;
  end if;

  execute 'alter table public.user_feature_controls enable row level security';
  for r in
    select p.polname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    where c.oid = 'public.user_feature_controls'::regclass
  loop
    execute format('drop policy %I on public.user_feature_controls', r.polname);
  end loop;

  execute $pol$
    create policy "Authenticated read feature controls"
      on public.user_feature_controls
      for select
      to authenticated
      using (true)
  $pol$;
  execute $pol$
    create policy "Admin insert feature controls"
      on public.user_feature_controls
      for insert
      to authenticated
      with check (coalesce(public.is_admin(), false))
  $pol$;
  execute $pol$
    create policy "Admin update feature controls"
      on public.user_feature_controls
      for update
      to authenticated
      using (coalesce(public.is_admin(), false))
      with check (coalesce(public.is_admin(), false))
  $pol$;
  execute $pol$
    create policy "Admin delete feature controls"
      on public.user_feature_controls
      for delete
      to authenticated
      using (coalesce(public.is_admin(), false))
  $pol$;
  execute 'revoke all on table public.user_feature_controls from anon';
  execute 'grant select, insert, update, delete on table public.user_feature_controls to authenticated';
end $$;

-- Rewrite any other function whose body decides is_admin from user-editable
-- metadata. full_name and tour flags are left alone.
do $$
declare
  r record;
  def text;
  next text;
begin
  for r in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname not in ('is_admin', 'admin_users_list', 'set_user_metadata_admin', 'set_reporting_status')
      and (
        p.prosrc ~* 'raw_user_meta_data\s*->>\s*''is_admin'''
        or p.prosrc ~* 'user_metadata\s*->>\s*''is_admin'''
        or p.prosrc ~* 'user_metadata''\s*->>\s*''is_admin'''
      )
  loop
    def := pg_get_functiondef(r.oid);
    next := def;
    next := replace(next, 'raw_user_meta_data->>''is_admin''', 'raw_app_meta_data->>''is_admin''');
    next := replace(next, 'raw_user_meta_data ->> ''is_admin''', 'raw_app_meta_data ->> ''is_admin''');
    next := replace(next, 'user_metadata->>''is_admin''', 'app_metadata->>''is_admin''');
    next := replace(next, 'user_metadata ->> ''is_admin''', 'app_metadata ->> ''is_admin''');
    if next <> def then
      execute next;
      raise notice 'rewrote %.%(%) off user-editable is_admin', 'public', r.proname, r.args;
    end if;
  end loop;

  for r in
    select c.relname, p.polname,
           coalesce(pg_get_expr(p.polqual, p.polrelid), '') as using_expr,
           coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as check_expr
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and (
        coalesce(pg_get_expr(p.polqual, p.polrelid), '') ~* 'user_metadata|raw_user_meta_data'
        or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') ~* 'user_metadata|raw_user_meta_data'
      )
  loop
    raise notice 'policy %.% still reads user metadata: using [%] check [%]',
      r.relname, r.polname, r.using_expr, r.check_expr;
  end loop;
end $$;
