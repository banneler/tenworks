-- Polish pass (2026-11-09): the account form has a Social Media field and saves social_media,
-- but the column never existed, so every account save failed. Add it (nullable, additive).
alter table public.accounts add column if not exists social_media text;
notify pgrst, 'reload schema';
