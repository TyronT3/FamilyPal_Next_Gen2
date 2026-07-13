-- Add PeriodPal cycle and intimacy tracking.
-- Predictions are calculated in the frontend from these logged records.

CREATE TABLE IF NOT EXISTS public.period_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_date date NOT NULL,
  end_date date DEFAULT NULL,
  flow text DEFAULT 'medium',
  symptoms text[] DEFAULT '{}',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT period_cycles_flow_check CHECK (flow IN ('spotting', 'light', 'medium', 'heavy')),
  CONSTRAINT period_cycles_dates_check CHECK (end_date IS NULL OR end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS public.period_intimacy (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  logged_date date NOT NULL,
  protection text DEFAULT 'none',
  emergency_contraception boolean DEFAULT false,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT period_intimacy_protection_check CHECK (protection IN ('none', 'condom', 'withdrawal', 'pill', 'iud', 'implant', 'injection', 'other'))
);

CREATE INDEX IF NOT EXISTS idx_period_cycles_start_date ON public.period_cycles(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_period_intimacy_logged_date ON public.period_intimacy(logged_date DESC);

ALTER TABLE public.period_cycles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_intimacy DISABLE ROW LEVEL SECURITY;
