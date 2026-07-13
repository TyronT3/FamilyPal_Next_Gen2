-- Add rich PeriodPal import history tables for normalized Clover/My Calendar exports.

ALTER TABLE public.period_cycles ADD COLUMN IF NOT EXISTS import_record_id text UNIQUE;
ALTER TABLE public.period_cycles ADD COLUMN IF NOT EXISTS source_app text;
ALTER TABLE public.period_cycles ADD COLUMN IF NOT EXISTS source_record_id text;
ALTER TABLE public.period_cycles ADD COLUMN IF NOT EXISTS record_status text DEFAULT 'manual';
ALTER TABLE public.period_cycles ADD COLUMN IF NOT EXISTS is_prediction boolean DEFAULT false;
ALTER TABLE public.period_cycles ADD COLUMN IF NOT EXISTS is_confirmed boolean DEFAULT true;
ALTER TABLE public.period_cycles ADD COLUMN IF NOT EXISTS next_cycle_start date;
ALTER TABLE public.period_cycles ADD COLUMN IF NOT EXISTS cycle_length_days integer;

ALTER TABLE public.period_intimacy ADD COLUMN IF NOT EXISTS import_event_id text UNIQUE;
ALTER TABLE public.period_intimacy ADD COLUMN IF NOT EXISTS source_app text;

ALTER TABLE public.period_exclusions ADD COLUMN IF NOT EXISTS import_record_id text UNIQUE;
ALTER TABLE public.period_exclusions ADD COLUMN IF NOT EXISTS source_app text;

CREATE TABLE IF NOT EXISTS public.period_events (
  event_id text PRIMARY KEY,
  source_app text,
  source_record_id text,
  event_date date NOT NULL,
  event_datetime timestamptz,
  category text NOT NULL,
  code text,
  label text,
  severity_code text,
  value_text text,
  value_number numeric,
  unit text,
  is_prediction boolean DEFAULT false,
  raw_value text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.period_notes (
  note_id text PRIMARY KEY,
  source_app text,
  source_record_id text,
  note_date date NOT NULL,
  note_datetime timestamptz,
  note_text text NOT NULL,
  source_created_at timestamptz,
  source_updated_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.period_measurements (
  measurement_id text PRIMARY KEY,
  source_app text,
  source_record_id text,
  measurement_date date NOT NULL,
  measurement_datetime timestamptz,
  measurement_type text NOT NULL,
  value numeric,
  unit text,
  normalized_value numeric,
  normalized_unit text,
  raw_value text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.period_medication_definitions (
  medication_id text PRIMARY KEY,
  source_app text,
  source_record_id text,
  source_pill_id text,
  name text,
  classify_code text,
  pill_type_code text,
  start_datetime timestamptz,
  end_datetime timestamptz,
  notification_enabled_code text,
  configuration_json text,
  extension_json text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.period_medication_logs (
  log_id text PRIMARY KEY,
  source_app text,
  source_record_id text,
  log_date date NOT NULL,
  source_pill_id text,
  name text,
  take_status_code text,
  pill_type_code text,
  raw_value text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_period_cycles_import_record_id ON public.period_cycles(import_record_id);
CREATE INDEX IF NOT EXISTS idx_period_events_date_category ON public.period_events(event_date, category);
CREATE INDEX IF NOT EXISTS idx_period_notes_date ON public.period_notes(note_date);
CREATE INDEX IF NOT EXISTS idx_period_measurements_date_type ON public.period_measurements(measurement_date, measurement_type);
CREATE INDEX IF NOT EXISTS idx_period_medication_logs_date ON public.period_medication_logs(log_date);

ALTER TABLE public.period_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_measurements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_medication_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.period_medication_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.period_events FROM anon;
REVOKE ALL ON public.period_notes FROM anon;
REVOKE ALL ON public.period_measurements FROM anon;
REVOKE ALL ON public.period_medication_definitions FROM anon;
REVOKE ALL ON public.period_medication_logs FROM anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_notes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_medication_definitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.period_medication_logs TO authenticated;

DROP POLICY IF EXISTS "authenticated users can manage period_events" ON public.period_events;
CREATE POLICY "authenticated users can manage period_events"
  ON public.period_events FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated users can manage period_notes" ON public.period_notes;
CREATE POLICY "authenticated users can manage period_notes"
  ON public.period_notes FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated users can manage period_measurements" ON public.period_measurements;
CREATE POLICY "authenticated users can manage period_measurements"
  ON public.period_measurements FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated users can manage period_medication_definitions" ON public.period_medication_definitions;
CREATE POLICY "authenticated users can manage period_medication_definitions"
  ON public.period_medication_definitions FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "authenticated users can manage period_medication_logs" ON public.period_medication_logs;
CREATE POLICY "authenticated users can manage period_medication_logs"
  ON public.period_medication_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
