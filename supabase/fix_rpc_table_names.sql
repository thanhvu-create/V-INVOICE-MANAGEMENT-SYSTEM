-- =============================================================
-- FIX: get_dashboard_stats() RPC — chạy file này trên Supabase SQL Editor
-- Vấn đề: hàm cũ query invoice_headers / invoice_items (tên sai)
--         → dashboard stats trả về lỗi hoặc rỗng
-- Fix:    dùng đúng tên bảng: invoices / invoice_products
-- =============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(

    -- Số lượng invoice theo từng status
    'by_status', (
      SELECT COALESCE(json_object_agg(status, cnt), '{}'::json)
        FROM (
          SELECT status, COUNT(*) AS cnt
            FROM invoices
           GROUP BY status
        ) s
    ),

    -- Tổng số items (sản phẩm) trên toàn hệ thống
    'total_items', (
      SELECT COUNT(*) FROM invoice_products
    ),

    -- Tổng CIF trong tháng hiện tại (theo giờ HCM)
    'month_cif', (
      SELECT COALESCE(SUM(p.cif_price), 0)
        FROM invoice_products  p
        JOIN invoices          h ON h.id = p.invoice_id
       WHERE DATE_TRUNC('month', h.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
           = DATE_TRUNC('month', NOW()        AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ),

    -- Số invoice tạo trong tháng hiện tại
    'month_invoice_count', (
      SELECT COUNT(*)
        FROM invoices
       WHERE DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
           = DATE_TRUNC('month', NOW()      AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ),

    -- Số invoice theo từng template
    'by_template', (
      SELECT COALESCE(json_object_agg(template_type, cnt), '{}'::json)
        FROM (
          SELECT template_type, COUNT(*) AS cnt
            FROM invoices
           WHERE template_type IS NOT NULL
           GROUP BY template_type
        ) t
    )

  ) INTO result;

  RETURN result;
END;
$$;
