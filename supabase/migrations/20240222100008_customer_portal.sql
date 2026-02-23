-- Customer portal: one link per contact, project picker for multiple projects

-- Contact-level token for "one link per customer" (portal shows all their projects)
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS status_token uuid UNIQUE;

-- List projects this portal (contact) can see
CREATE OR REPLACE FUNCTION public.get_portal_projects(p_portal_token uuid)
RETURNS TABLE (
  project_id bigint,
  project_name text,
  project_status text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.name::text, p.status::text
  FROM projects p
  INNER JOIN project_contacts pc ON pc.project_id = p.id
  INNER JOIN contacts c ON c.id = pc.contact_id AND c.status_token = p_portal_token AND c.status_token IS NOT NULL
  ORDER BY p.name;
$$;

-- Same status payload as get_project_status, but authorized by portal token + project_id
CREATE OR REPLACE FUNCTION public.get_project_status_by_portal(p_portal_token uuid, p_project_id bigint)
RETURNS TABLE (
  project_name text,
  project_status text,
  target_date date,
  start_date date,
  client_summary text,
  contact_name text,
  contact_email text,
  contact_phone text,
  next_milestone_name text,
  next_milestone_date date,
  payment_url text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.name::text,
    p.status::text,
    p.end_date,
    p.start_date,
    p.client_summary,
    trim(pm.first_name || ' ' || coalesce(pm.last_name, ''))::text,
    pm.email::text,
    pm.phone::text,
    nm.task_name,
    nm.task_end_date,
    p.payment_url
  FROM projects p
  INNER JOIN project_contacts pc ON pc.project_id = p.id
  INNER JOIN contacts c ON c.id = pc.contact_id AND c.status_token = p_portal_token AND c.status_token IS NOT NULL
  LEFT JOIN LATERAL (
    SELECT c2.first_name, c2.last_name, c2.email, c2.phone
    FROM project_contacts pc2
    JOIN contacts c2 ON c2.id = pc2.contact_id
    WHERE pc2.project_id = p.id
      AND (pc2.role ILIKE '%pm%' OR pc2.role ILIKE '%project manager%' OR pc2.role ILIKE '%manager%' OR pc2.role ILIKE '%internal%' OR pc2.role ILIKE '%tenworks%')
      AND (pc2.role NOT ILIKE '%client%' AND pc2.role NOT ILIKE '%customer%' AND (pc2.role IS NULL OR pc2.role NOT ILIKE '%billing%'))
    ORDER BY CASE WHEN pc2.role ILIKE '%pm%' OR pc2.role ILIKE '%project manager%' THEN 0 ELSE 1 END
    LIMIT 1
  ) pm ON true
  LEFT JOIN LATERAL (
    SELECT pt.name AS task_name, pt.end_date AS task_end_date
    FROM project_tasks pt
    WHERE pt.project_id = p.id AND (pt.status IS NULL OR pt.status IS DISTINCT FROM 'Completed')
    ORDER BY pt.start_date ASC NULLS LAST
    LIMIT 1
  ) nm ON true
  WHERE p.id = p_project_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_portal_projects(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_project_status_by_portal(uuid, bigint) TO anon;
