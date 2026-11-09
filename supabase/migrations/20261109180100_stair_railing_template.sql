-- Insert-only seed for a fabrication project template.
-- Applied version (2026-11-09): trade mapping uses exact live shop_trades names
-- instead of fuzzy matching with a "first trade" fallback. If a named trade is
-- missing, trade_id is left null (column is nullable). Nothing existing is
-- updated or deleted, including Basic 5 Step.

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
  st.id,
  step.task_name,
  step.hours,
  step.ord
from public.project_templates tpl
cross join (
  values
    (1, 'Shop Drawings',      24::numeric, 'CAD / Design'),
    (2, 'Client Approval',     4::numeric, 'Project Management'),
    (3, 'Order Material',      8::numeric, 'Project Management'),
    (4, 'Fabrication',        80::numeric, 'Fabrication / Welding'),
    (5, 'Finish/Powder Coat', 24::numeric, 'Finishing / Powder'),
    (6, 'Delivery',            8::numeric, 'Material Handling'),
    (7, 'Install',            40::numeric, 'Installation'),
    (8, 'Punch/Closeout',      8::numeric, 'Installation')
) as step(ord, task_name, hours, trade_name)
left join lateral (
  select s.id from public.shop_trades s where s.name = step.trade_name order by s.id limit 1
) st on true
where tpl.name = 'Stair / Railing Fab'
  and not exists (
    select 1
    from public.project_template_tasks existing
    where existing.template_id = tpl.id
      and existing.name = step.task_name
  );
