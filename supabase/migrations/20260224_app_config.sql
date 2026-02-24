-- App config key-value store for cross-device settings (e.g. home dashboard config)
CREATE TABLE IF NOT EXISTS app_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at on row changes
CREATE OR REPLACE TRIGGER app_config_updated_at
  BEFORE UPDATE ON app_config
  FOR EACH ROW EXECUTE FUNCTION moddatetime(updated_at);

-- Allow authenticated reads
ALTER TABLE app_config ENABLE ROW LEVEL SECURITY;

-- Public read access (home page is unauthenticated)
CREATE POLICY "Allow public read" ON app_config FOR SELECT USING (true);

-- Teacher can manage config (write access)
CREATE POLICY "Teacher can manage config" ON app_config FOR ALL USING (true) WITH CHECK (true);
