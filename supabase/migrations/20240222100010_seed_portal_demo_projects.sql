-- Seed: two projects for the same customer so you can test the customer portal.
-- Uses the first existing contact, gives them a fixed portal token, and creates two projects.

DO $$
DECLARE
  cid bigint;
  pid1 bigint;
  pid2 bigint;
  portal_token uuid := 'c0ffee00-0000-4000-8000-000000000001';
BEGIN
  SELECT id INTO cid FROM public.contacts LIMIT 1;
  IF cid IS NULL THEN
    RAISE NOTICE 'Seed skipped: no contacts in DB. Add a contact in the CRM first, then re-run.';
    RETURN;
  END IF;

  UPDATE public.contacts SET status_token = portal_token WHERE id = cid;

  INSERT INTO public.projects (name, status, start_date, end_date, project_value, client_summary)
  VALUES (
    'Demo – Phase 1',
    'In Progress',
    (CURRENT_DATE - 14),
    (CURRENT_DATE + 30),
    50000,
    'Fabrication is underway. Delivery expected next month.'
  )
  RETURNING id INTO pid1;

  INSERT INTO public.projects (name, status, start_date, end_date, project_value, client_summary)
  VALUES (
    'Demo – Phase 2',
    'Pre-Production',
    (CURRENT_DATE + 45),
    (CURRENT_DATE + 90),
    75000,
    'Scheduled to start after Phase 1 completion.'
  )
  RETURNING id INTO pid2;

  INSERT INTO public.project_contacts (project_id, contact_id, role)
  VALUES (pid1, cid, 'Client'), (pid2, cid, 'Client');

  RAISE NOTICE 'Portal demo seeded. Open: status.html?portal=c0ffee00-0000-4000-8000-000000000001';
END $$;
