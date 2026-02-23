-- purchase_orders for reorder and receiving (punch list #2)

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_item_id bigint NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  qty_ordered numeric NOT NULL CHECK (qty_ordered > 0),
  qty_received numeric NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'ordered', 'received', 'cancelled')),
  expected_date date,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_orders_inventory_item_id_idx ON public.purchase_orders(inventory_item_id);
CREATE INDEX IF NOT EXISTS purchase_orders_status_idx ON public.purchase_orders(status);
CREATE INDEX IF NOT EXISTS purchase_orders_created_at_idx ON public.purchase_orders(created_at DESC);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for authenticated" ON public.purchase_orders;
CREATE POLICY "Allow all for authenticated"
  ON public.purchase_orders FOR ALL
  USING (true)
  WITH CHECK (true);
