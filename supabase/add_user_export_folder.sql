-- Per-user Google Drive export folder.
-- Replaces the single global app_settings key 'export_drive_folder_url'.
-- Each user's Sheet export now goes into THEIR OWN folder (using their own connected
-- Google account), so different users connecting different Google accounts never clash.
-- A user with no folder set exports to the root of their own Drive.

ALTER TABLE app_users
  ADD COLUMN IF NOT EXISTS export_drive_folder_url TEXT;

-- Optional: seed each admin/manager's folder from the old global value so the current
-- setup keeps working after the switch. Safe to run once; comment out if not wanted.
-- UPDATE app_users u
--   SET export_drive_folder_url = s.value
--   FROM app_settings s
--   WHERE s.key = 'export_drive_folder_url'
--     AND s.value IS NOT NULL
--     AND u.role IN ('admin','manager')
--     AND u.export_drive_folder_url IS NULL;
