-- Add reference unit price to pantry items
-- Used by the price seeder tool and pantry reports for spend estimates
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS unit_price NUMERIC(10,2) DEFAULT NULL;
