-- Wipe ONLY the Ten Works demo pack (project ccrnueyxmnzqlaphqdjn).
-- Does not touch Constellation. Does not delete Wichita Biomed, Centennial,
-- or any other row that lacks the [tw-demo-pack] marker, a DEMO- SKU,
-- a (tw-demo-pack) machine name, or shop_talent.role = 'tw-demo-pack'.
--
-- Re-seed afterwards with supabase/seed/tw_demo_pack.sql
-- (that file wipes first, so you can also just re-run the seed).

BEGIN;

UPDATE public.project_tasks AS t
SET dependency_task_id = NULL
WHERE t.dependency_task_id IN (
    SELECT t2.id
    FROM public.project_tasks AS t2
    JOIN public.projects AS p ON p.id = t2.project_id
    WHERE p.description LIKE '%[tw-demo-pack]%'
);

DELETE FROM public.task_assignments AS a
USING public.project_tasks AS t, public.projects AS p
WHERE a.task_id = t.id
  AND t.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.task_assignments AS a
USING public.shop_talent AS st
WHERE a.talent_id = st.id
  AND st.role = 'tw-demo-pack';

DELETE FROM public.talent_availability AS av
USING public.shop_talent AS st
WHERE av.talent_id = st.id
  AND st.role = 'tw-demo-pack';

UPDATE public.project_tasks
SET assigned_talent_id = NULL
WHERE assigned_talent_id IN (
    SELECT id FROM public.shop_talent WHERE role = 'tw-demo-pack'
);

DELETE FROM public.project_bom AS b
USING public.projects AS p
WHERE b.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_bom
WHERE inventory_item_id IN (
    SELECT id FROM public.inventory_items WHERE sku LIKE 'DEMO-%'
);

DELETE FROM public.project_change_orders AS c
USING public.projects AS p
WHERE c.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_notes AS n
USING public.projects AS p
WHERE n.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_contacts AS c
USING public.projects AS p
WHERE c.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_tasks AS t
USING public.projects AS p
WHERE t.project_id = p.id
  AND p.description LIKE '%[tw-demo-pack]%';

UPDATE public.projects
SET proposal_id = NULL
WHERE description LIKE '%[tw-demo-pack]%';

DELETE FROM public.proposals_tw AS pr
USING public.deals_tw AS d
WHERE pr.deal_id = d.id
  AND d.notes LIKE '%[tw-demo-pack]%';

DELETE FROM public.projects
WHERE description LIKE '%[tw-demo-pack]%';

DELETE FROM public.purchase_orders
WHERE notes LIKE '%[tw-demo-pack]%'
   OR inventory_item_id IN (
        SELECT id FROM public.inventory_items WHERE sku LIKE 'DEMO-%'
   );

DELETE FROM public.inventory_items
WHERE sku LIKE 'DEMO-%';

DELETE FROM public.deals_tw
WHERE notes LIKE '%[tw-demo-pack]%';

DELETE FROM public.contacts
WHERE notes LIKE '%[tw-demo-pack]%';

DELETE FROM public.accounts
WHERE notes LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_template_tasks AS tt
USING public.project_templates AS t
WHERE tt.template_id = t.id
  AND t.description LIKE '%[tw-demo-pack]%';

DELETE FROM public.project_templates
WHERE description LIKE '%[tw-demo-pack]%';

DELETE FROM public.shop_machines
WHERE name LIKE '%(tw-demo-pack)%';

DELETE FROM public.talent_skills AS s
USING public.shop_talent AS st
WHERE s.talent_id = st.id
  AND st.role = 'tw-demo-pack';

DELETE FROM public.shop_talent
WHERE role = 'tw-demo-pack';

COMMIT;
