-- Client-facing status page (punch list #7): tokenized URL per project

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS status_token uuid UNIQUE DEFAULT gen_random_uuid();

-- Backfill existing rows so they get a token when first shared
UPDATE public.projects
SET status_token = gen_random_uuid()
WHERE status_token IS NULL;

-- RPC: return only client-safe fields + one contact (no costs, no full schedule)
CREATE OR REPLACE FUNCTION public.get_project_status(p_token uuid)
RETURNS TABLE (
  project_name text,
  project_status text,
  target_date date,
  contact_name text,
  contact_email text,
  contact_phone text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.name::text,
    p.status::text,
    p.end_date,
    trim(c.first_name || ' ' || coalesce(c.last_name, ''))::text,
    c.email::text,
    c.phone::text
  FROM projects p
  LEFT JOIN LATERAL (
    SELECT c2.first_name, c2.last_name, c2.email, c2.phone
    FROM project_contacts pc
    JOIN contacts c2 ON c2.id = pc.contact_id
    WHERE pc.project_id = p.id
    ORDER BY CASE WHEN pc.role ILIKE '%pm%' OR pc.role ILIKE '%manager%' THEN 0 ELSE 1 END
    LIMIT 1
  ) c ON true
  WHERE p.status_token = p_token AND p.status_token IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_status(uuid) TO anon;
