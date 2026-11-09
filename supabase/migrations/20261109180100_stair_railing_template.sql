-- Insert-only seed for Stair / Railing Fab.
-- Trades are matched by the exact shop_trades.name. Basic 5 Step is not
-- updated. A trade named Woods is left unchanged.
-- Re-running inserts only the template and step names that are still missing.

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
  trade.id,
  step.task_name,
  step.hours,
  step.ord
from public.project_templates tpl
cross join (
  values
    (1, 'Shop Drawings', 24::numeric, 'CAD / Design'),
    (2, 'Client Approval', 4::numeric, 'Project Management'),
    (3, 'Order Material', 8::numeric, 'Project Management'),
    (4, 'Fabrication', 80::numeric, 'Fabrication / Welding'),
    (5, 'Finish/Powder Coat', 24::numeric, 'Finishing / Powder'),
    (6, 'Delivery', 8::numeric, 'Material Handling'),
    (7, 'Install', 40::numeric, 'Installation'),
    (8, 'Punch/Closeout', 8::numeric, 'Installation')
) as step(ord, task_name, hours, trade_name)
join lateral (
  select st.id
  from public.shop_trades st
  where st.name = step.trade_name
  order by st.id
  limit 1
) trade on true
where tpl.name = 'Stair / Railing Fab'
  and not exists (
    select 1
    from public.project_template_tasks existing
    where existing.template_id = tpl.id
      and existing.name = step.task_name
  );
