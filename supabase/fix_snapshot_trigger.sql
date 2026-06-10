-- =============================================================
-- FIX: Snapshot trigger — chạy file này trên Supabase SQL Editor
-- Vấn đề: trigger cũ check status = 'invoiced' nhưng app chỉ dùng 'finalized'
--         → trigger không bao giờ chạy → snapshot_data luôn null
-- Fix:    check status = 'finalized' + đúng tên bảng = invoices
-- =============================================================

CREATE OR REPLACE FUNCTION snapshot_invoice_on_finalized()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_items JSONB;
  v_gems  JSONB;
BEGIN
  IF NEW.status = 'finalized' AND (OLD.status IS DISTINCT FROM 'finalized') THEN

    SELECT json_agg(i.*)
      INTO v_items
      FROM invoice_products i
     WHERE i.invoice_id = NEW.id;

    SELECT json_agg(g.*)
      INTO v_gems
      FROM invoice_diamonds g
      JOIN invoice_products i ON g.product_id = i.id
     WHERE i.invoice_id = NEW.id;

    NEW.snapshot_data := jsonb_build_object(
      'header',      row_to_json(NEW.*),
      'items',       COALESCE(v_items, '[]'::jsonb),
      'gems',        COALESCE(v_gems,  '[]'::jsonb),
      'nvl', jsonb_build_object(
        'gold_24k',       NEW.nvl_gold_24k,
        'pt_price',       NEW.nvl_pt_price,
        'ag_price',       NEW.nvl_ag_price,
        'pd_price',       NEW.nvl_pd_price,
        'loss_gold',      NEW.nvl_loss_gold,
        'loss_pt',        NEW.nvl_loss_pt,
        'tag_multiplier', NEW.nvl_tag_multiplier,
        'fr_multiplier',  NEW.nvl_fr_multiplier
      ),
      'snapshot_at', now()
    );
    NEW.snapshot_at  := now();
    NEW.is_locked    := true;
  END IF;
  RETURN NEW;
END;
$$;

-- Xóa trigger cũ (nếu có) rồi tạo lại trên đúng bảng
DROP TRIGGER IF EXISTS trg_snapshot_invoice         ON invoices;
DROP TRIGGER IF EXISTS trg_snapshot_invoice_finalized ON invoices;

CREATE TRIGGER trg_snapshot_invoice_finalized
  BEFORE UPDATE ON invoices
  FOR EACH ROW
  EXECUTE FUNCTION snapshot_invoice_on_finalized();
