-- Status page: show TenWorks PM (not client), add next milestone + payment link

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS payment_url text;

DROP FUNCTION IF EXISTS public.get_project_status(uuid);

-- Contact: only PM / internal roles (exclude Client, Customer, Billing)
-- Next milestone: first incomplete task by start_date
CREATE FUNCTION public.get_project_status(p_token uuid)
RETURNS TABLE (
  project_name text,
  project_status text,
  target_date date,
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
    trim(c.first_name || ' ' || coalesce(c.last_name, ''))::text,
    c.email::text,
    c.phone::text,
    nm.task_name,
    nm.task_end_date,
    p.payment_url
  FROM projects p
  LEFT JOIN LATERAL (
    SELECT c2.first_name, c2.last_name, c2.email, c2.phone
    FROM project_contacts pc
    JOIN contacts c2 ON c2.id = pc.contact_id
    WHERE pc.project_id = p.id
      AND (pc.role ILIKE '%pm%' OR pc.role ILIKE '%project manager%' OR pc.role ILIKE '%manager%' OR pc.role ILIKE '%internal%' OR pc.role ILIKE '%tenworks%')
      AND (pc.role NOT ILIKE '%client%' AND pc.role NOT ILIKE '%customer%' AND (pc.role IS NULL OR pc.role NOT ILIKE '%billing%'))
    ORDER BY CASE WHEN pc.role ILIKE '%pm%' OR pc.role ILIKE '%project manager%' THEN 0 ELSE 1 END
    LIMIT 1
  ) c ON true
  LEFT JOIN LATERAL (
    SELECT pt.name AS task_name, pt.end_date AS task_end_date
    FROM project_tasks pt
    WHERE pt.project_id = p.id AND (pt.status IS NULL OR pt.status IS DISTINCT FROM 'Completed')
    ORDER BY pt.start_date ASC NULLS LAST
    LIMIT 1
  ) nm ON true
  WHERE p.status_token = p_token AND p.status_token IS NOT NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_project_status(uuid) TO anon;
