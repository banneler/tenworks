-- PM can get or create a contact's portal token (one customer link for all their projects)

CREATE OR REPLACE FUNCTION public.get_or_create_contact_portal_token(p_contact_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token uuid;
BEGIN
  UPDATE contacts SET status_token = gen_random_uuid() WHERE id = p_contact_id AND status_token IS NULL;
  SELECT status_token INTO v_token FROM contacts WHERE id = p_contact_id;
  RETURN v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_contact_portal_token(uuid) TO authenticated;
