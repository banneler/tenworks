-- Default hourly rate for a trade. Shop Settings already edits this field,
-- and proposal labor lines copy it when a trade is chosen.
-- Existing trade rows keep a null rate until someone sets one. No backfill.

alter table public.shop_trades
  add column if not exists default_hourly_rate numeric;
