-- Applied to production on 2026-11-16 as migration "demo_security_tightening".
-- Gate reassign_user_records on is_admin() and stop anonymous callers.
CREATE OR REPLACE FUNCTION public.reassign_user_records(from_user_id uuid, to_user_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if not public.is_admin() then
    raise exception 'Only admins can reassign records' using errcode = '42501';
  end if;

  update public.contacts set user_id = to_user_id where user_id = from_user_id;
  update public.accounts set user_id = to_user_id where user_id = from_user_id;
  update public.deals set user_id = to_user_id
   where user_id = from_user_id and stage not in ('Closed Won', 'Closed Lost');
  update public.cognito_alerts set user_id = to_user_id where user_id = from_user_id;
end;
$function$;

revoke execute on function public.reassign_user_records(uuid, uuid) from public, anon;
grant execute on function public.reassign_user_records(uuid, uuid) to authenticated, service_role;

-- Portal token minting is only called from the signed-in Projects page; the public status page never calls it.
revoke execute on function public.get_or_create_contact_portal_token(bigint) from public, anon;
grant execute on function public.get_or_create_contact_portal_token(bigint) to authenticated, service_role;

-- Pin search_path on the updated_at trigger helpers.
alter function public.update_org_settings_updated_at() set search_path = '';
alter function public.update_user_integrations_updated_at() set search_path = '';
alter function public.update_user_settings_updated_at() set search_path = '';
