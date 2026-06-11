-- App-wide key-value settings store
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Allow authenticated users to read; only service-role (API) to write
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "settings_read"  ON app_settings FOR SELECT USING (true);
CREATE POLICY "settings_write" ON app_settings FOR ALL    USING (true);
