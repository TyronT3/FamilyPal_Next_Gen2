-- Add PeriodPal excluded date ranges.
-- Used for pregnancy/postpartum or other ranges that should not influence cycle estimates.

CREATE TABLE IF NOT EXISTS public.period_exclusions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL,
  end_date date NOT NULL,
  reason text DEFAULT 'pregnancy',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT period_exclusions_dates_check CHECK (end_date >= start_date),
  CONSTRAINT period_exclusions_reason_check CHECK (reason IN ('pregnancy', 'postpartum', 'birth_control', 'medical', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_period_exclusions_dates ON public.period_exclusions(start_date, end_date);

ALTER TABLE public.period_exclusions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.period_exclusions FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_exclusions TO authenticated;

DROP POLICY IF EXISTS "authenticated users can manage period_exclusions" ON public.period_exclusions;
CREATE POLICY "authenticated users can manage period_exclusions"
  ON public.period_exclusions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
