-- =============================================================
-- V-Invoice — SEED DATA (Dữ liệu mẫu)
-- Run in Supabase SQL Editor AFTER migration.sql
-- =============================================================
-- Thứ tự chạy:
--   1. Pricing Rules
--   2. Daily Metal Rates (5 ngày gần nhất)
--   3. BOM Products (25 SKU)
--   4. App Users (placeholder — xem ghi chú)
--   5. Sample Invoices (có thể bỏ qua)
-- =============================================================


-- =============================================================
-- SECTION 1 — PRICING RULES
-- =============================================================
-- Xóa dữ liệu cũ nếu cần re-seed
TRUNCATE pricing_rules RESTART IDENTITY CASCADE;

-- casting_loss_pct = 0: Hao hụt (loss%) đã được tính sẵn vào daily_metal_rates.
-- Công thức: gold_18kw = spot_24k_per_gram × (18/24) × (1 + 0.06) — do user tính trước khi nhập.
-- recalcItem() KHÔNG nhân thêm (1+casting_loss_pct) nữa.
-- Xem: lib/formulas/pricing.ts + xlsx-realworld-analysis.md §3
INSERT INTO pricing_rules
  (name, cif_multiplier, tag_multiplier, fr_multiplier, casting_loss_pct, is_active)
VALUES
  -- Rule đang active — CIF 10% từ file thực tế (JM FORM F8 = 0.10)
  ('Standard CH1',    1.10, 1.25, 1.08, 0.0, true),
  -- Rules dự phòng
  ('Wholesale',       1.06, 1.15, 1.05, 0.0, false),
  ('US Export',       1.12, 1.28, 1.10, 0.0, false),
  ('VN Market',       1.08, 1.20, 1.06, 0.0, false);


-- =============================================================
-- SECTION 2 — DAILY METAL RATES (Giá kim loại theo ngày)
-- ⚠️  GIÁ LƯU = DERIVED RATE (ĐÃ TÍNH HẠO HỤT) — không phải spot price!
--
-- Công thức (từ file Excel SUMMARY col C7):
--   gold_18kw = spot_24k_per_gram × (18/24) × (1 + loss_gold%)
--   gold_14ky = spot_24k_per_gram × (14/24) × (1 + loss_gold%)
--   platinum  = pt_spot_per_gram × (1 + loss_pt%)
--   gold_24k  = spot_24k_per_gram  (pure 24K — không có hao hụt)
--
-- Giá mẫu: spot 24K ≈ $3,000/oz = 96.45 $/gr, loss_gold = 6%, loss_PT = 17%
-- → gold_18kw = 96.45 × 0.75 × 1.06 = 76.68 $/gr
-- → gold_14ky = 96.45 × 0.5833 × 1.06 = 59.66 $/gr
-- → platinum  = 33.76 × 1.17 = 39.50 $/gr
--
-- Khi admin nhập Metal Rates: copy giá từ SUMMARY col C7/C8/C9/C11 của file Excel
-- =============================================================
TRUNCATE daily_metal_rates RESTART IDENTITY CASCADE;

INSERT INTO daily_metal_rates
  (rate_date, gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium, created_by)
VALUES
  -- Giá derived (đã tính hao hụt): gold_24k=spot, gold_18k=spot×0.75×1.06, pt=pt_spot×1.17
  ('2026-05-25', 96.45, 76.68, 76.68, 59.66, 39.50, 1.09, 37.50, 'seed'),
  ('2026-05-24', 95.80, 76.18, 76.18, 59.27, 39.30, 1.09, 37.30, 'seed'),
  ('2026-05-23', 96.12, 76.43, 76.43, 59.47, 39.41, 1.09, 37.42, 'seed'),
  ('2026-05-22', 94.90, 75.46, 75.46, 58.71, 38.91, 1.07, 36.92, 'seed'),
  ('2026-05-21', 95.50, 75.94, 75.94, 59.08, 39.11, 1.08, 37.12, 'seed'),
  ('2026-05-20', 94.20, 74.91, 74.91, 58.28, 38.72, 1.07, 36.72, 'seed'),
  ('2026-05-19', 93.80, 74.59, 74.59, 58.03, 38.56, 1.06, 36.54, 'seed');

-- ⚠️  GHI CHÚ CHO ADMIN khi nhập giá thực hàng ngày:
-- 1. Tra giá spot 24K từ https://www.kitco.com ($/oz)
-- 2. Chia 31.103 → $/gram (gold_24k)
-- 3. gold_18kw = gold_24k × (18/24) × 1.06
-- 4. gold_14ky = gold_24k × (14/24) × 1.06
-- 5. platinum  = pt_spot_oz / 31.103 × 1.17
-- Hoặc copy thẳng từ SUMMARY col C7/C8/C9/C11 của file Excel CH1.


-- =============================================================
-- SECTION 3 — BOM PRODUCTS (Danh mục SKU)
-- 25 SKU thực tế cho HP Jewelry
-- class: Ring | Pendant | Earrings | Bracelet | Necklace | Set
-- sub_class: Engagement | Band | Fashion | Classic | Traditional | Bridal | Religious
-- =============================================================
TRUNCATE bom_products RESTART IDENTITY CASCADE;

INSERT INTO bom_products
  (sku_jwmold, description, class, sub_class, metal_type,
   labor_fee, casting_fee, design_fee, resin_fee, misc_fee, is_active)
VALUES
  -- ── RINGS — 18K White Gold ──────────────────────────────────
  ('RG-18KW-001', 'Solitaire Engagement Ring 18K White Gold',       'Ring',     'Engagement', '18KW',  15.00, 10.00, 20.00, 2.00, 2.00, true),
  ('RG-18KW-002', 'Pavé Diamond Band Ring 18K White Gold',          'Ring',     'Band',       '18KW',  18.00, 12.00, 15.00, 2.00, 2.00, true),
  ('RG-18KW-003', 'Eternity Ring Pavé Setting 18K White Gold',      'Ring',     'Band',       '18KW',  20.00, 12.00, 18.00, 2.00, 3.00, true),
  ('RG-18KW-004', 'Halo Engagement Ring 18K White Gold',            'Ring',     'Engagement', '18KW',  22.00, 14.00, 25.00, 3.00, 3.00, true),
  ('RG-18KW-005', 'Three-Stone Ring 18K White Gold',                'Ring',     'Engagement', '18KW',  20.00, 13.00, 22.00, 2.00, 3.00, true),

  -- ── RINGS — 18K Yellow Gold ─────────────────────────────────
  ('RG-18KY-001', 'Classic Wedding Band 18K Yellow Gold',           'Ring',     'Band',       '18KY',  12.00,  8.00,  0.00, 1.00, 1.00, true),
  ('RG-18KY-002', 'Twisted Shank Fashion Ring 18K Yellow Gold',     'Ring',     'Fashion',    '18KY',  15.00, 10.00, 12.00, 1.00, 2.00, true),
  ('RG-18KY-003', 'Signet Ring 18K Yellow Gold',                    'Ring',     'Classic',    '18KY',  18.00, 12.00, 10.00, 0.00, 2.00, true),

  -- ── RINGS — 14K Yellow Gold ─────────────────────────────────
  ('RG-14KY-001', 'Three-Stone Ring 14K Yellow Gold',               'Ring',     'Engagement', '14KY',  12.00,  8.00, 15.00, 1.00, 2.00, true),
  ('RG-14KY-002', 'Fashion Stackable Ring 14K Yellow Gold',         'Ring',     'Fashion',    '14KY',   8.00,  5.00,  5.00, 0.00, 1.00, true),

  -- ── RINGS — Platinum ────────────────────────────────────────
  ('RG-PT950-001', 'Platinum Solitaire Engagement Ring PT950',      'Ring',     'Engagement', 'PT950', 25.00, 18.00, 30.00, 0.00, 3.00, true),
  ('RG-PT950-002', 'Platinum Eternity Band PT950',                  'Ring',     'Band',       'PT950', 22.00, 15.00, 20.00, 0.00, 3.00, true),

  -- ── RINGS — 24K (Vietnamese market) ────────────────────────
  ('RG-24K-001',  'Traditional 24K Gold Ring',                      'Ring',     'Traditional','24K',    8.00,  5.00,  0.00, 0.00, 1.00, true),

  -- ── PENDANTS ────────────────────────────────────────────────
  ('PD-18KW-001', 'Diamond Solitaire Pendant 18K White Gold',       'Pendant',  'Classic',    '18KW',  10.00,  7.00, 12.00, 1.00, 1.00, true),
  ('PD-18KW-002', 'Heart Pendant 18K White Gold',                   'Pendant',  'Fashion',    '18KW',   8.00,  5.00,  8.00, 1.00, 1.00, true),
  ('PD-18KY-001', 'Cross Pendant 18K Yellow Gold',                  'Pendant',  'Religious',  '18KY',   8.00,  5.00,  6.00, 0.00, 1.00, true),
  ('PD-18KY-002', 'Buddha Pendant 18K Yellow Gold',                 'Pendant',  'Religious',  '18KY',  12.00,  8.00,  8.00, 0.00, 1.00, true),

  -- ── EARRINGS ────────────────────────────────────────────────
  ('ER-18KW-001', 'Diamond Stud Earrings 18K White Gold (pair)',    'Earrings', 'Classic',    '18KW',  14.00,  9.00, 10.00, 1.00, 2.00, true),
  ('ER-18KW-002', 'Drop Earrings 18K White Gold (pair)',            'Earrings', 'Classic',    '18KW',  16.00, 10.00, 12.00, 1.00, 2.00, true),
  ('ER-18KY-001', 'Hoop Earrings 18K Yellow Gold (pair)',           'Earrings', 'Fashion',    '18KY',  10.00,  7.00,  5.00, 0.00, 1.00, true),

  -- ── BRACELETS ───────────────────────────────────────────────
  ('BR-18KW-001', 'Diamond Tennis Bracelet 18K White Gold',         'Bracelet', 'Classic',    '18KW',  35.00, 20.00, 25.00, 3.00, 5.00, true),
  ('BR-18KY-001', 'Bangle Bracelet 18K Yellow Gold',                'Bracelet', 'Fashion',    '18KY',  15.00, 10.00,  5.00, 0.00, 2.00, true),
  ('BR-24K-001',  'Traditional 24K Gold Bangle',                    'Bracelet', 'Traditional','24K',   10.00,  7.00,  0.00, 0.00, 1.00, true),

  -- ── NECKLACES ───────────────────────────────────────────────
  ('NK-18KW-001', 'Diamond Station Necklace 18K White Gold',        'Necklace', 'Classic',    '18KW',  30.00, 18.00, 20.00, 2.00, 4.00, true),
  ('NK-18KY-001', 'Gold Chain Necklace 18K Yellow Gold',            'Necklace', 'Classic',    '18KY',  20.00, 12.00,  5.00, 0.00, 2.00, true),

  -- ── BRIDAL SET ──────────────────────────────────────────────
  ('ST-18KW-001', 'Bridal Set (Engagement + Band) 18K White Gold',  'Set',      'Bridal',     '18KW',  40.00, 25.00, 45.00, 4.00, 6.00, true);


-- =============================================================
-- SECTION 4 — APP USERS
-- =============================================================
-- ⚠️  LƯU Ý QUAN TRỌNG:
--
--   auth_id trong migration.sql là NOT NULL.
--   Để tạo user seed, cần làm theo 1 trong 2 cách:
--
--   CÁCH 1 (khuyến nghị): Tạo user qua Supabase Auth trước
--   ---------------------------------------------------------
--   1. Vào Supabase Dashboard → Authentication → Users
--   2. Click "Add user" → điền email + password
--   3. Copy UUID từ cột "UID"
--   4. Chạy INSERT bên dưới với UUID thực
--
--   CÁCH 2: Dùng UUID giả (dev only)
--   ---------------------------------------------------------
--   Uncomment block bên dưới, chạy để seed nhanh.
--   Auth login sẽ KHÔNG hoạt động với UUID giả.
--   Cần update auth_id sau khi tạo tài khoản Auth thực.

/*
-- DEV ONLY — placeholder auth_ids (sẽ phá login thực)
INSERT INTO app_users (auth_id, email, full_name, role, is_active)
VALUES
  (gen_random_uuid(), 'admin@hpjewelry.com',   'Admin HP',     'admin',   true),
  (gen_random_uuid(), 'manager@hpjewelry.com', 'Manager HP',   'manager', true),
  (gen_random_uuid(), 'user@hpjewelry.com',    'User HP',      'user',    true),
  (gen_random_uuid(), 'viewer@hpjewelry.com',  'Viewer HP',    'viewer',  true)
ON CONFLICT (email) DO NOTHING;
*/

-- PRODUCTION: Sau khi tạo user qua Supabase Auth UI, chạy lệnh này
-- Thay <UUID_TỪ_AUTH> bằng UUID thực từ Authentication → Users
/*
INSERT INTO app_users (auth_id, email, full_name, role, is_active)
VALUES
  ('<UUID_ADMIN>',   'admin@hpjewelry.com',   'Admin HP',   'admin',   true),
  ('<UUID_MANAGER>', 'manager@hpjewelry.com', 'Manager HP', 'manager', true),
  ('<UUID_USER>',    'user@hpjewelry.com',    'User HP',    'user',    true),
  ('<UUID_VIEWER>',  'viewer@hpjewelry.com',  'Viewer HP',  'viewer',  true)
ON CONFLICT (email) DO UPDATE SET
  auth_id   = EXCLUDED.auth_id,
  full_name = EXCLUDED.full_name,
  role      = EXCLUDED.role;
*/


-- =============================================================
-- SECTION 5 — SAMPLE INVOICES (Hoá đơn mẫu)
-- =============================================================
-- Chỉ chạy được SAU KHI có app_users (Section 4)
-- Bỏ comment toàn bộ block này khi đã có users

/*
DO $$
DECLARE
  v_rate_id   UUID;
  v_rule_id   UUID;
  v_inv1_id   UUID;
  v_inv2_id   UUID;
  v_inv3_id   UUID;
BEGIN
  -- Lấy rate và rule mới nhất
  SELECT id INTO v_rate_id FROM daily_metal_rates ORDER BY rate_date DESC LIMIT 1;
  SELECT id INTO v_rule_id FROM pricing_rules WHERE is_active = true LIMIT 1;

  -- ── Invoice 1: DRAFT ─────────────────────────────────────────
  INSERT INTO invoice_headers
    (po_number, mr_number, status, metal_rate_id, pricing_rule_id, store, created_by)
  VALUES
    ('PO-2026-001', 'MR-001', 'draft', v_rate_id, v_rule_id, 'US ONL', 'user@hpjewelry.com')
  RETURNING id INTO v_inv1_id;

  INSERT INTO invoice_items
    (invoice_id, line_no, sku_jwmold, description, class, sub_class, qty_pcs,
     store, location_store, so_mo_code, metal_type,
     weight_total_gr, weight_gold_actual_gr, weight_no_gem_gr,
     labor_fee, casting_fee, design_fee, resin_fee, misc_fee,
     gold_value_usd, hpusa, cif_price, tag_price, fr_price)
  VALUES
    (v_inv1_id, 1, 'RG-18KW-001', 'Solitaire Engagement Ring 18K White Gold',
     'Ring', 'Engagement', 2,
     'US ONL', 'Safe 1', 'SO-0001', '18KW',
     4.2000, 3.8000, 3.8000,
     15.00, 10.00, 20.00, 2.00, 2.00,
     272.89, 321.89, 354.08, 442.60, 382.40),

    (v_inv1_id, 2, 'RG-18KW-002', 'Pavé Diamond Band Ring 18K White Gold',
     'Ring', 'Band', 1,
     'US ONL', 'Safe 1', 'SO-0001', '18KW',
     3.1000, 2.8000, 2.8000,
     18.00, 12.00, 15.00, 2.00, 2.00,
     201.35, 250.35, 275.39, 344.23, 297.42),

    (v_inv1_id, 3, 'PD-18KW-001', 'Diamond Solitaire Pendant 18K White Gold',
     'Pendant', 'Classic', 3,
     'US ONL', 'Display', 'SO-0002', '18KW',
     2.5000, 2.2000, 2.2000,
     10.00, 7.00, 12.00, 1.00, 1.00,
     158.15, 189.15, 208.07, 260.08, 224.71);

  -- ── Invoice 2: PENDING APPROVAL ──────────────────────────────
  INSERT INTO invoice_headers
    (po_number, mr_number, status, metal_rate_id, pricing_rule_id, store, created_by)
  VALUES
    ('PO-2026-002', 'MR-002', 'pending_approval', v_rate_id, v_rule_id, 'VN SR', 'user@hpjewelry.com')
  RETURNING id INTO v_inv2_id;

  INSERT INTO invoice_items
    (invoice_id, line_no, sku_jwmold, description, class, sub_class, qty_pcs,
     store, location_store, so_mo_code, metal_type,
     weight_total_gr, weight_gold_actual_gr, weight_no_gem_gr,
     labor_fee, casting_fee, design_fee, resin_fee, misc_fee,
     gold_value_usd, hpusa, cif_price, tag_price, fr_price)
  VALUES
    (v_inv2_id, 1, 'RG-PT950-001', 'Platinum Solitaire Engagement Ring PT950',
     'Ring', 'Engagement', 1,
     'VN SR', 'Vault A', 'MO-0010', 'PT950',
     5.8000, 5.5000, 5.5000,
     25.00, 18.00, 30.00, 0.00, 3.00,
     185.68, 261.68, 287.85, 359.81, 310.87),

    (v_inv2_id, 2, 'ER-18KW-001', 'Diamond Stud Earrings 18K White Gold (pair)',
     'Earrings', 'Classic', 4,
     'VN SR', 'Display B', 'SO-0011', '18KW',
     2.8000, 2.5000, 2.5000,
     14.00, 9.00, 10.00, 1.00, 2.00,
     179.69, 215.69, 237.26, 296.57, 256.24),

    (v_inv2_id, 3, 'BR-18KW-001', 'Diamond Tennis Bracelet 18K White Gold',
     'Bracelet', 'Classic', 1,
     'VN SR', 'Vault A', 'SO-0012', '18KW',
     18.5000, 17.0000, 17.0000,
     35.00, 20.00, 25.00, 3.00, 5.00,
     1221.61, 1309.61, 1440.57, 1800.71, 1555.82),

    (v_inv2_id, 4, 'PD-18KY-002', 'Buddha Pendant 18K Yellow Gold',
     'Pendant', 'Religious', 5,
     'VN SR', 'Display C', 'SO-0013', '18KY',
     3.2000, 3.0000, 3.0000,
     12.00, 8.00, 8.00, 0.00, 1.00,
     217.02, 246.02, 270.62, 338.28, 292.27),

    (v_inv2_id, 5, 'RG-24K-001', 'Traditional 24K Gold Ring',
     'Ring', 'Traditional', 10,
     'VN SR', 'Safe B', 'SO-0014', '24K',
     2.0000, 2.0000, 2.0000,
     8.00, 5.00, 0.00, 0.00, 1.00,
     192.90, 206.90, 227.59, 284.49, 245.80);

  -- ── Invoice 3: APPROVED ───────────────────────────────────────
  INSERT INTO invoice_headers
    (po_number, mr_number, status, metal_rate_id, pricing_rule_id, store, notes, created_by)
  VALUES
    ('PO-2026-003', 'MR-003', 'approved', v_rate_id, v_rule_id, 'HP WH', 'Rush order — priority shipping', 'manager@hpjewelry.com')
  RETURNING id INTO v_inv3_id;

  INSERT INTO invoice_items
    (invoice_id, line_no, sku_jwmold, description, class, sub_class, qty_pcs,
     store, location_store, so_mo_code, vendor_model, metal_type,
     weight_total_gr, weight_gold_actual_gr, weight_no_gem_gr,
     labor_fee, casting_fee, design_fee, resin_fee, misc_fee,
     gold_value_usd, hpusa, cif_price, tag_price, fr_price)
  VALUES
    (v_inv3_id, 1, 'ST-18KW-001', 'Bridal Set (Engagement + Band) 18K White Gold',
     'Set', 'Bridal', 1,
     'HP WH', 'Vault C', 'SO-0020', 'VS-BRD-001', '18KW',
     8.5000, 7.8000, 7.8000,
     40.00, 25.00, 45.00, 4.00, 6.00,
     560.48, 680.48, 748.53, 935.66, 808.41),

    (v_inv3_id, 2, 'NK-18KW-001', 'Diamond Station Necklace 18K White Gold',
     'Necklace', 'Classic', 2,
     'HP WH', 'Vault C', 'SO-0020', 'VS-NK-001', '18KW',
     12.0000, 11.0000, 11.0000,
     30.00, 18.00, 20.00, 2.00, 4.00,
     790.27, 864.27, 950.70, 1188.37, 1026.75),

    (v_inv3_id, 3, 'RG-18KY-003', 'Signet Ring 18K Yellow Gold',
     'Ring', 'Classic', 5,
     'HP WH', 'Safe D', 'SO-0021', NULL, '18KY',
     6.0000, 5.5000, 5.5000,
     18.00, 12.00, 10.00, 0.00, 2.00,
     397.87, 439.87, 483.86, 604.82, 522.57),

    (v_inv3_id, 4, 'RG-PT950-002', 'Platinum Eternity Band PT950',
     'Ring', 'Band', 3,
     'HP WH', 'Vault C', 'SO-0022', NULL, 'PT950',
     4.5000, 4.3000, 4.3000,
     22.00, 15.00, 20.00, 0.00, 3.00,
     145.17, 205.17, 225.69, 282.11, 243.74),

    (v_inv3_id, 5, 'ER-18KY-001', 'Hoop Earrings 18K Yellow Gold (pair)',
     'Earrings', 'Fashion', 8,
     'HP WH', 'Display E', 'SO-0023', NULL, '18KY',
     3.8000, 3.5000, 3.5000,
     10.00, 7.00, 5.00, 0.00, 1.00,
     252.58, 275.58, 303.14, 378.92, 327.39),

    (v_inv3_id, 6, 'BR-24K-001', 'Traditional 24K Gold Bangle',
     'Bracelet', 'Traditional', 6,
     'HP WH', 'Safe D', 'SO-0024', NULL, '24K',
     25.0000, 25.0000, 25.0000,
     10.00, 7.00, 0.00, 0.00, 1.00,
     2411.25, 2429.25, 2672.18, 3340.22, 2885.95),

    (v_inv3_id, 7, 'PD-18KW-002', 'Heart Pendant 18K White Gold',
     'Pendant', 'Fashion', 4,
     'HP WH', 'Display F', 'SO-0025', NULL, '18KW',
     1.8000, 1.6000, 1.6000,
     8.00, 5.00, 8.00, 1.00, 1.00,
     115.01, 138.01, 151.81, 189.76, 163.96);

END;
$$;
*/


-- =============================================================
-- VERIFY — Kiểm tra sau khi seed
-- =============================================================

SELECT 'pricing_rules' AS tbl, COUNT(*) AS rows FROM pricing_rules
UNION ALL
SELECT 'daily_metal_rates',   COUNT(*) FROM daily_metal_rates
UNION ALL
SELECT 'bom_products',        COUNT(*) FROM bom_products
UNION ALL
SELECT 'app_users',           COUNT(*) FROM app_users;

-- Xem active pricing rule
SELECT name, cif_multiplier, tag_multiplier, fr_multiplier, casting_loss_pct
FROM pricing_rules WHERE is_active = true;

-- Xem rate mới nhất
SELECT rate_date, gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium
FROM daily_metal_rates ORDER BY rate_date DESC LIMIT 3;

-- Xem BOM products theo class
SELECT class, COUNT(*) AS sku_count, COUNT(*) FILTER (WHERE is_active) AS active
FROM bom_products GROUP BY class ORDER BY class;
