-- =============================================================
-- GEM PRICE CATALOG — Bảng giá NVL đá (từ sheet "10) Bảng giá NVL-10")
-- Run AFTER migration.sql
-- =============================================================
-- Nguồn: file Excel thực tế "Copy of 0a) [Mẫu CH1] _ 1.....VNS0....._ IN-V(01.7.25)0p- CH1.xlsx"
-- Sheet: "10) Bảng giá NVL-10"
-- Giá dùng: MK PRICE (col E) — giá bán ra, dùng để tính T.GIÁ XOÀN
-- T.GIÁ XOÀN = weight_ct_before × mk_price (theo công thức Excel T18 = P18 × S18)
-- =============================================================

CREATE TABLE IF NOT EXISTS gem_price_catalog (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gem_code    TEXT NOT NULL UNIQUE,   -- "RD B1", "BG3", "MQ4"...
  gem_type    TEXT NOT NULL,          -- "RD", "PR", "BG", "MQ", "OV", "PS", "RDL", "XC", "PL"
  size_range  TEXT,                   -- "0.7-2.0mm", "0.03-0.05ct"...
  cost_price  NUMERIC(10,2),          -- COST PRICE ($/ct hoặc $/pcs) — internal reference
  mk_price    NUMERIC(10,2),          -- MK PRICE ($/ct hoặc $/pcs) — dùng để tính T.GIÁ XOÀN
  price_unit  TEXT NOT NULL DEFAULT 'per_ct',  -- 'per_ct' | 'per_pcs'
  is_active   BOOLEAN NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_gem_price_catalog_code ON gem_price_catalog(gem_code);
CREATE INDEX IF NOT EXISTS idx_gem_price_catalog_type ON gem_price_catalog(gem_type);

-- =============================================================
-- SEED — Dữ liệu từ NVL-10 sheet (MK PRICE column)
-- =============================================================
INSERT INTO gem_price_catalog (gem_code, gem_type, size_range, cost_price, mk_price, price_unit)
VALUES

-- ── RD — Round Diamond (Xoàn tròn) ─────────────────────────────
-- Giá $/ct (price_unit = 'per_ct')
('RD B1', 'RD', '0.7-2.0mm',  548.33, 630.58, 'per_ct'),
('RD B2', 'RD', '2.1-2.4mm',  600.00, 690.00, 'per_ct'),
('RD B3', 'RD', '2.5-2.6mm',  620.00, 713.00, 'per_ct'),
('RD B4', 'RD', '2.7-2.8mm',  730.00, 839.50, 'per_ct'),
('RD B5', 'RD', '2.9-3.2mm',  830.00, 954.50, 'per_ct'),
('RD B6', 'RD', '3.3-3.4mm',  880.00, 1012.00, 'per_ct'),
('RD B7', 'RD', '3.5-3.6mm',  1100.00, 1265.00, 'per_ct'),
('RD B8', 'RD', '3.7-3.9mm',  1150.00, 1322.50, 'per_ct'),
('RD B9', 'RD', '4.0-4.4mm',  1553.00, 1785.95, 'per_ct'),
('RD B10', 'RD', '4.5-4.9mm', 0.00,    0.00,    'per_ct'),

-- ── PR — Princess Cut ───────────────────────────────────────────
('PR1', 'PR', '1.0x1.0-1.8x1.8mm', 500.00, 650.00,  'per_ct'),
('PR2', 'PR', '1.9x1.9-2.3x2.3mm', 440.00, 572.00,  'per_ct'),
('PR3', 'PR', '2.4x2.4-2.8x2.8mm', 650.00, 845.00,  'per_ct'),
('PR4', 'PR', '2.9x2.9-3.4x3.4mm', 825.00, 1072.50, 'per_ct'),
('PR5', 'PR', '3.5x3.5-3.7x3.7mm', 980.00, 1274.00, 'per_ct'),

-- ── BG — Baguette ───────────────────────────────────────────────
('BG0', 'BG', '0.005-0.025ct', 680.00,  884.00,  'per_ct'),
('BG1', 'BG', '0.03-0.05ct',   550.00,  715.00,  'per_ct'),
('BG2', 'BG', '0.06-0.07ct',   650.00,  845.00,  'per_ct'),
('BG3', 'BG', '0.08-0.09ct',   850.00,  1105.00, 'per_ct'),
('BG4', 'BG', '0.10-0.16ct',   1150.00, 1495.00, 'per_ct'),
('BG5', 'BG', '0.17-0.20ct',   1350.00, 1755.00, 'per_ct'),
('BG6', 'BG', '0.21-0.25ct',   1550.00, 2015.00, 'per_ct'),
('BG7', 'BG', '0.26-0.28ct',   1750.00, 2275.00, 'per_ct'),
('BG8', 'BG', '0.29-0.35ct',   1850.00, 2405.00, 'per_ct'),

-- ── MQ — Marquise ───────────────────────────────────────────────
('MQ1', 'MQ', '0.005-0.10ct',  800.00,  1040.00, 'per_ct'),
('MQ2', 'MQ', '0.11-0.12ct',   900.00,  1170.00, 'per_ct'),
('MQ3', 'MQ', '0.13-0.17ct',   1150.00, 1495.00, 'per_ct'),
('MQ4', 'MQ', '0.18-0.24ct',   1200.00, 1560.00, 'per_ct'),
('MQ5', 'MQ', '0.25-0.29ct',   1300.00, 1690.00, 'per_ct'),
('MQ6', 'MQ', '0.30-0.36ct',   1500.00, 1950.00, 'per_ct'),
('MQ7', 'MQ', '0.37-0.39ct',   1650.00, 2145.00, 'per_ct'),

-- ── OV — Oval ───────────────────────────────────────────────────
('OV1', 'OV', '0.005-0.095ct', 650.00,  845.00,  'per_ct'),
('OV2', 'OV', '0.10-0.14ct',   775.00,  1007.50, 'per_ct'),
('OV3', 'OV', '0.15-0.25ct',   900.00,  1170.00, 'per_ct'),
('OV4', 'OV', '0.30-0.35ct',   1300.00, 1690.00, 'per_ct'),
('OV5', 'OV', '0.40-0.45ct',   1450.00, 1885.00, 'per_ct'),
('OV6', 'OV', '0.50-0.55ct',   1550.00, 2015.00, 'per_ct'),

-- ── PS — Pear Shape ─────────────────────────────────────────────
('PS1', 'PS', '0.005-0.12ct',  750.00,  975.00,  'per_ct'),
('PS2', 'PS', '0.12-0.17ct',   970.00,  1261.00, 'per_ct'),
('PS3', 'PS', '0.18-0.25ct',   1100.00, 1430.00, 'per_ct'),
('PS4', 'PS', '0.26-0.29ct',   1350.00, 1755.00, 'per_ct'),
('PS5', 'PS', '0.30-0.34ct',   1400.00, 1820.00, 'per_ct'),
('PS6', 'PS', '0.35-0.38ct',   1450.00, 1885.00, 'per_ct'),
('PS7', 'PS', '0.39-0.40ct',   1650.00, 2145.00, 'per_ct'),
('PS8', 'PS', '0.41-0.45ct',   1750.00, 2275.00, 'per_ct'),

-- ── RDL — Round Diamond Lab-grown (Hột tổng hợp) ────────────────
-- Giá thấp hơn natural diamond
('RDL1', 'RDL', '0.6-0.9mm',  null, 299.00,  'per_ct'),
('RDL2', 'RDL', '1.0-1.1mm',  null, 218.40,  'per_ct'),
('RDL3', 'RDL', '1.2-1.4mm',  null, 198.90,  'per_ct'),
('RDL4', 'RDL', '1.5-1.6mm',  null, 94.90,   'per_ct'),
('RDL5', 'RDL', '1.7-2.0mm',  null, 107.90,  'per_ct'),
('RDL6', 'RDL', '2.1-2.3mm',  null, 52.00,   'per_ct'),
('RDL7', 'RDL', '2.4-2.7mm',  null, 59.80,   'per_ct'),
('RDL8', 'RDL', '2.8-3.0mm',  null, 79.30,   'per_ct'),
('RDL9', 'RDL', '2.9-3.4mm',  null, 117.00,  'per_ct'),
('RDL10','RDL', '3.5-3.6mm',  null, 136.50,  'per_ct'),
('RDL11','RDL', '3.7-4.0mm',  null, 195.00,  'per_ct'),

-- ── XC — Đá viên lớn (tính theo số viên, không theo carat) ──────
-- price_unit = 'per_pcs' — T.GIÁ = qty_pcs × mk_price
('XC1', 'XC', '9.5mm',   null, 15.00,   'per_pcs'),
('XC2', 'XC', '11mm',    null, 22.50,   'per_pcs'),
('XC3', 'XC', '13mm',    null, 22.50,   'per_pcs'),
('XC4', 'XC', '15mm',    null, 27.00,   'per_pcs'),
('XC5', 'XC', '16mm',    null, 27.00,   'per_pcs'),
('XC6', 'XC', '20mm',    null, 30.00,   'per_pcs'),
('XC7', 'XC', '26mm',    null, 30.00,   'per_pcs'),

-- ── PL — Pearl/Plate (tính theo số viên) ────────────────────────
('PL1',  'PL', '3.0mm',  null, 172.50,  'per_pcs'),
('PL2',  'PL', '6.0mm',  null, 249.65,  'per_pcs'),
('PL3',  'PL', '7.0mm',  null, 260.92,  'per_pcs'),
('PL4',  'PL', '8.0mm',  null, 265.76,  'per_pcs'),
('PL5',  'PL', '9.0mm',  null, 297.97,  'per_pcs'),
('PL6',  'PL', '10mm',   null, 0.00,    'per_pcs'),
('PL7',  'PL', '11mm',   null, 0.00,    'per_pcs'),
('PL8',  'PL', '12mm',   null, 0.00,    'per_pcs'),
('PL9',  'PL', '13mm',   null, 0.00,    'per_pcs'),
('PL10', 'PL', '14mm',   null, 0.00,    'per_pcs'),
('PL11', 'PL', '15mm',   null, 0.00,    'per_pcs');

-- =============================================================
-- API ENDPOINT gợi ý: GET /api/gem-catalog?type=RD&q=B1
-- → trả về { gem_code, mk_price, price_unit }
-- GemModal: user chọn gem_code → auto-fill unit_price_per_ct = mk_price
-- Nếu price_unit = 'per_pcs': tính T.GIÁ = qty_pcs × mk_price
--                              (weight_ct_before = 0, không dùng)
-- =============================================================
