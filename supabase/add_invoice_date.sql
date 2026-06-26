-- Add invoice_date column to invoices table
-- Run this on Supabase SQL Editor

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_date DATE DEFAULT CURRENT_DATE;

-- Backfill existing rows from created_at
UPDATE invoices
   SET invoice_date = created_at::date
 WHERE invoice_date IS NULL;

-- Make it NOT NULL after backfill
ALTER TABLE invoices
  ALTER COLUMN invoice_date SET NOT NULL;
