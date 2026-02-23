-- Optional hours per week per person for capacity/load (punch list #4)

ALTER TABLE public.shop_talent
  ADD COLUMN IF NOT EXISTS hours_per_week numeric DEFAULT 40;
