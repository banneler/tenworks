-- New Project can be created without a deal.
-- Adds projects.account_id when it is missing, using the live accounts.id type.
-- Drops NOT NULL on projects.deal_id only when that column is currently required.
-- js/talent.js already inserts Shop Infrastructure without a deal_id, so this
-- drop is a no-op when the column is already nullable. No row values change.

do $$
declare
  account_type text;
  deal_nullable text;
begin
  select c.is_nullable into deal_nullable
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'projects'
    and c.column_name = 'deal_id';

  if deal_nullable = 'NO' then
    execute 'alter table public.projects alter column deal_id drop not null';
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'projects'
      and column_name = 'account_id'
  ) then
    select format_type(a.atttypid, a.atttypmod) into account_type
    from pg_attribute a
    join pg_class cl on cl.oid = a.attrelid
    join pg_namespace n on n.oid = cl.relnamespace
    where n.nspname = 'public'
      and cl.relname = 'accounts'
      and a.attname = 'id'
      and not a.attisdropped;

    if account_type is null then
      raise exception 'public.accounts.id was not found; projects.account_id was not added';
    end if;

    execute format(
      'alter table public.projects add column account_id %s references public.accounts(id) on delete set null',
      account_type
    );
  end if;
end $$;

create index if not exists idx_projects_account_id on public.projects (account_id);
