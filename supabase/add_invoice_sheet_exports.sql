-- Exported Google Sheet tracking keyed by (invoice, folder).
-- Sheet identity = (invoice_id, folder_key):
--   * folder_key = a Drive folder id → users exporting the SAME invoice into the SAME folder
--     share ONE sheet (the existing file is reused / updated in place).
--   * folder_key = 'root:<user_id>' → no folder configured; each user's own Drive root is
--     namespaced per user, so two users without a folder get separate sheets.
-- Replaces the single invoices.gsheet_id and the earlier per-user invoice_user_sheets table.

CREATE TABLE IF NOT EXISTS invoice_sheet_exports (
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  folder_key TEXT NOT NULL,
  gsheet_id  TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (invoice_id, folder_key)
);

-- Preserve existing exports: seed each invoice's current sheet under the creator's folder_key
-- (their configured folder id if any, else their root) so re-exporting reuses it, no duplicate.
INSERT INTO invoice_sheet_exports (invoice_id, folder_key, gsheet_id)
SELECT i.id,
       COALESCE(substring(u.export_drive_folder_url from '/folders/([A-Za-z0-9_-]+)'),
                'root:' || i.created_by::text),
       i.gsheet_id
FROM invoices i
JOIN app_users u ON u.id = i.created_by
WHERE i.gsheet_id IS NOT NULL
ON CONFLICT (invoice_id, folder_key) DO NOTHING;

-- The earlier per-user table (if it was applied) is now unused.
DROP TABLE IF EXISTS invoice_user_sheets;
