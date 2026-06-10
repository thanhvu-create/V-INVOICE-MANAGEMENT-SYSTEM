-- ============================================================
-- fix_v2_logic.sql — cho schema MỚI (sau migrate_reset.sql)
-- ============================================================
-- migrate_reset.sql đã tạo đúng schema với các bảng:
--   nvl_prices, nvl_hot, invoices, invoice_products, invoice_diamonds
-- File này chỉ seed dữ liệu mặc định nếu chưa có.
-- AN TOÀN để chạy nhiều lần.
-- ============================================================

-- Seed giá NVL mặc định nếu bảng trống (cập nhật lại theo giá thực tế)
INSERT INTO nvl_prices (gold_24k, pt_price, ag_price, pd_price, loss_gold, loss_pt)
SELECT 5400, 2500, 110, 2000, 0.06, 0.17
WHERE NOT EXISTS (SELECT 1 FROM nvl_prices LIMIT 1);

-- Seed một số giá xoàn mẫu vào nvl_hot (cập nhật lại theo bảng giá thực tế)
INSERT INTO nvl_hot (stone_type, grade, size_range, mk_price)
VALUES
  ('RD',    'RD B1', 'RD1 0.7 - 2.0',       12.00),
  ('RD',    'RD B2', 'RD2 2.1 - 2.4',       18.00),
  ('RD',    'RD B3', 'RD3 2.5 - 2.6',       25.00),
  ('RD',    'RD B4', 'RD4 2.7 - 2.8',       35.00),
  ('RD',    'RD B5', 'RD5 2.9 - 3.2',       50.00),
  ('RD',    'RD B6', 'RD6 3.3 - 3.4',       70.00),
  ('RD',    'RD B7', 'RD7 3.5 - 3.6',       90.00),
  ('RD',    'RD B8', 'RD8 3.7 - 3.9',      120.00),
  ('RD',    'RD B9', 'RD9 4.0 - 4.4',      160.00),
  ('PR',    'PR1',   '1.0x1.0 - 1.8x 1.8',  15.00),
  ('PR',    'PR2',   '1.9x1.9 - 2.3x 2.3',  22.00),
  ('PR',    'PR3',   '2.4x 2.4 -2.8x 2.8',  32.00),
  ('PR',    'PR4',   '2.9x 2.9 - 3.4x 3.4', 48.00),
  ('PR',    'PR5',   '3.5x 3.5 - 3.7x 3.7', 65.00)
ON CONFLICT (size_range) DO NOTHING;

-- Xác nhận
SELECT 'nvl_prices rows: ' || COUNT(*) FROM nvl_prices;
SELECT 'nvl_hot rows: ' || COUNT(*) FROM nvl_hot;
