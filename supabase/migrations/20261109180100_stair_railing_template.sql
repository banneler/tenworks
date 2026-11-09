-- Insert-only seed for a fabrication project template.
-- project_templates and project_template_tasks are the source of templates
-- (shop settings reads and writes those tables). Nothing here updates or
-- deletes an existing template, including Basic 5 Step.
-- A trade named Woods (the shop color key calls id 4 Wood) is left unchanged.
-- Re-running adds only the template and step names that are still missing.
-- Tasks are skipped when shop_trades is empty; run again after a trade exists.

insert into public.project_templates (name, description)
select
  'Stair / Railing Fab',
  'Shop drawings through punch: drawings, approval, material, fabrication, finish, delivery, install, closeout.'
where not exists (
  select 1 from public.project_templates where name = 'Stair / Railing Fab'
);

insert into public.project_template_tasks (template_id, trade_id, name, estimated_hours, sort_order)
select
  tpl.id,
  coalesce(matched.id, fallback.id),
  step.task_name,
  step.hours,
  step.ord
from public.project_templates tpl
cross join (
  values
    (1, 'Shop Drawings', 24::numeric, array['%draw%', '%design%', '%detail%']::text[]),
    (2, 'Client Approval', 4::numeric, array['%approv%', '%project%', '%design%']::text[]),
    (3, 'Order Material', 8::numeric, array['%material%', '%purchas%', '%procure%']::text[]),
    (4, 'Fabrication', 80::numeric, array['%fab%', '%weld%', '%steel%']::text[]),
    (5, 'Finish/Powder Coat', 24::numeric, array['%finish%', '%powder%', '%paint%', '%coat%']::text[]),
    (6, 'Delivery', 8::numeric, array['%deliver%', '%truck%', '%ship%']::text[]),
    (7, 'Install', 40::numeric, array['%install%', '%field%']::text[]),
    (8, 'Punch/Closeout', 8::numeric, array['%punch%', '%close%', '%install%']::text[])
) as step(ord, task_name, hours, needles)
left join lateral (
  select st.id
  from public.shop_trades st
  where exists (
    select 1 from unnest(step.needles) needle
    where st.name ilike needle
  )
  order by st.id
  limit 1
) matched on true
left join lateral (
  select st.id
  from public.shop_trades st
  order by st.id
  limit 1
) fallback on true
where tpl.name = 'Stair / Railing Fab'
  and coalesce(matched.id, fallback.id) is not null
  and not exists (
    select 1
    from public.project_template_tasks existing
    where existing.template_id = tpl.id
      and existing.name = step.task_name
  );
