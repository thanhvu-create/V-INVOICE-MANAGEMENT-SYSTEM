-- Auto-generate invoice_code: "VNS0{seq}: IN-V(D.M.YY){itemCount}p- {template}"
-- Run on Supabase SQL Editor, project ref xgpkztkrlymfvlbabigl.
-- Depends on add_invoice_seq_no.sql (seq_no column) having been run first.
--
-- Two guards keep this safe:
--   seq_no IS NOT NULL      -> only invoices created after the feature; legacy hand-typed codes untouched
--   NOT invoice_code_manual -> once a user edits the code by hand, the triggers stop touching it

-- 1. Manual-override flag
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_code_manual BOOLEAN NOT NULL DEFAULT false;

-- 2. The single source of truth for the name.
--    FMDD/FMMM strip leading zeros (30.4.26, not 30.04.26).
CREATE OR REPLACE FUNCTION build_invoice_name(
  p_seq      INTEGER,
  p_created  TIMESTAMPTZ,
  p_template TEXT,
  p_items    INTEGER
) RETURNS TEXT
LANGUAGE sql IMMUTABLE AS $$
  SELECT 'VNS0' || COALESCE(p_seq::text, '')
      || ': IN-V('
      || to_char(p_created AT TIME ZONE 'Asia/Ho_Chi_Minh', 'FMDD.FMMM.YY')
      || ')' || COALESCE(p_items, 0) || 'p- '
      || COALESCE(p_template, '')
$$;

-- 3. Set the code on insert, and refresh it whenever the invoice row changes
--    (template edit, or invoice_code_manual flipped back to false = revert to auto).
CREATE OR REPLACE FUNCTION trg_invoices_auto_code() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.seq_no IS NOT NULL AND NOT NEW.invoice_code_manual THEN
    NEW.invoice_code := build_invoice_name(
      NEW.seq_no,
      NEW.created_at,
      NEW.template_type::text,
      (SELECT count(*)::int FROM invoice_products WHERE invoice_id = NEW.id)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_invoices_auto_code ON invoices;
CREATE TRIGGER trg_invoices_auto_code
  BEFORE INSERT OR UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION trg_invoices_auto_code();

-- 4. Item count lives in another table, so re-run the builder when it changes.
--    Covers every writer (UI, bulk import) since it fires on the table itself.
CREATE OR REPLACE FUNCTION trg_products_resync_code() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid := COALESCE(NEW.invoice_id, OLD.invoice_id);
BEGIN
  UPDATE invoices
     SET invoice_code = build_invoice_name(
           seq_no, created_at, template_type::text,
           (SELECT count(*)::int FROM invoice_products WHERE invoice_id = v_id)
         )
   WHERE id = v_id
     AND seq_no IS NOT NULL
     AND NOT invoice_code_manual;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_products_resync_code ON invoice_products;
CREATE TRIGGER trg_products_resync_code
  AFTER INSERT OR DELETE ON invoice_products
  FOR EACH ROW EXECUTE FUNCTION trg_products_resync_code();
