-- Per-user exported Google Sheet tracking.
-- Replaces the single invoices.gsheet_id: each user gets their OWN Sheet for an invoice,
-- living in their OWN Drive folder, reused (updated in place) on their next export.
-- Different users no longer overwrite each other's gsheet_id (no ping-pong / duplicates /
-- cross-account permission errors).

CREATE TABLE IF NOT EXISTS invoice_user_sheets (
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  gsheet_id  TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, user_id)
);

-- Preserve current behaviour: treat the existing single sheet as the creator's sheet,
-- so invoices already exported keep reusing their file instead of creating a duplicate.
INSERT INTO invoice_user_sheets (invoice_id, user_id, gsheet_id)
SELECT id, created_by_user_id, gsheet_id
FROM invoices
WHERE gsheet_id IS NOT NULL AND created_by_user_id IS NOT NULL
ON CONFLICT (invoice_id, user_id) DO NOTHING;
