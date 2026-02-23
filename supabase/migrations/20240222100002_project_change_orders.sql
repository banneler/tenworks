-- Change orders per project (punch list #5)

CREATE TABLE IF NOT EXISTS public.project_change_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id bigint NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  description text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved')),
  approved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_change_orders_project_id_idx ON public.project_change_orders(project_id);

ALTER TABLE public.project_change_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for project_change_orders"
  ON public.project_change_orders FOR ALL
  USING (true)
  WITH CHECK (true);
