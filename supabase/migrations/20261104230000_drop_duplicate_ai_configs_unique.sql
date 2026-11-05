-- Duplicate of ai_configs_function_id_key (same UNIQUE(function_id)). Restore with:
--   ALTER TABLE public.ai_configs ADD CONSTRAINT unique_function_id UNIQUE (function_id);
ALTER TABLE public.ai_configs DROP CONSTRAINT IF EXISTS unique_function_id;
