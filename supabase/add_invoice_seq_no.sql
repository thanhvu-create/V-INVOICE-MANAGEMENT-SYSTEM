-- Add auto-increment seq_no to invoices table
-- Used to build export filename: VNS0{seq_no}: IN-V(D.M.YY){itemCount}p- {template}
-- Run this on Supabase (CLI: npx supabase db query --linked, or SQL Editor)

-- Dedicated sequence, starts at 1
CREATE SEQUENCE IF NOT EXISTS invoice_seq_no START 1;

-- Nullable column: only NEW invoices get a number (no backfill for old rows)
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS seq_no INTEGER;

-- New inserts auto-assign next value; existing rows stay NULL
ALTER TABLE invoices
  ALTER COLUMN seq_no SET DEFAULT nextval('invoice_seq_no');
