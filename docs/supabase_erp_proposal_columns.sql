-- Run in Supabase SQL Editor.
-- Adds columns required for ERP/proposal features (idempotent).

-- projects: link to winning proposal when launched from a deal
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS proposal_id uuid REFERENCES public.proposals_tw(id) ON DELETE SET NULL;

-- inventory_items: reorder threshold and unit of measure (Inventory Add/Edit, BOM, low-stock)
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS reorder_point numeric DEFAULT 0;
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS uom text DEFAULT 'ea';

-- task_assignments: optional hours per row (Command Center Staffing Gaps uses this if present)
ALTER TABLE public.task_assignments
  ADD COLUMN IF NOT EXISTS hours numeric;
