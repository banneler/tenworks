-- ERP & proposal columns (idempotent)

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS actual_hours numeric;

-- proposal_id: add as plain uuid; add FK to proposals_tw later when that table exists
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS proposal_id uuid;

ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS reorder_point numeric DEFAULT 0;
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS uom text DEFAULT 'ea';

ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS hours numeric;
