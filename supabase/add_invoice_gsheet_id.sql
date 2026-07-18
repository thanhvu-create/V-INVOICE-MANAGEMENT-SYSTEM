-- Reuse one Google Sheet per invoice: remember the last exported sheet's file id
-- so re-exporting updates/replaces it instead of piling up new files in Drive.
-- Run on Supabase SQL Editor, project ref xgpkztkrlymfvlbabigl.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS gsheet_id TEXT;
