-- =============================================================
-- MK STORE MARKUP + PRICE LIST TYPES
-- Nguồn: file Excel "10) Bảng giá NVL-10" — bảng BG30-US + VN
-- Run AFTER migration.sql + gem_price_catalog.sql
-- =============================================================

-- ── 1. PRICE LIST TYPES (kênh bán) ──────────────────────────
CREATE TABLE IF NOT EXISTS mk_price_list_type (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_type TEXT NOT NULL UNIQUE,
  region          TEXT,           -- 'US' | 'VN'
  sort_order      INT DEFAULT 0,
  is_active       BOOLEAN NOT NULL DEFAULT true
);

INSERT INTO mk_price_list_type (price_list_type, region, sort_order) VALUES
('1)HPUS -P',    'US', 1),
('2)HPUS FB -P', 'US', 2),
('3)ADM1 -P',    'US', 3),
('4)ADM2 -P',    'US', 4),
('5)HPB -P',     'US', 5),
('B1)HPVN -P',   'VN', 6),
('2)AGVN -P',    'VN', 7)
ON CONFLICT (price_list_type) DO NOTHING;

-- ── 2. STORE MARKUP TIERS ─────────────────────────────────────
-- markups JSONB = { "1)HPUS -P": 2.24, "2)HPUS FB -P": 2.11, ... }
-- Công thức: sell_price = cost_total × markups[price_list_type]
-- cost_total = (gold_value + gem_total + setting_fee + fees) × (1 + cif_rate)
CREATE TABLE IF NOT EXISTS mk_store_markup (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  value_from  NUMERIC(12,2) NOT NULL,
  value_to    NUMERIC(12,2) NOT NULL,
  markups     JSONB NOT NULL DEFAULT '{}',
  notes       TEXT,
  sort_order  INT DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_mk_store_markup_range ON mk_store_markup (value_from, value_to);

-- Seed từ bảng BG30-US + VN (screenshots)
-- Tiers: 1-500, 501-1000, 1001-2000, 2001-3500, 3501-5000, 5001-10000, 10001+
INSERT INTO mk_store_markup (value_from, value_to, markups, sort_order) VALUES
(1,     500,    '{"1)HPUS -P":2.24,"2)HPUS FB -P":2.11,"3)ADM1 -P":1.70,"4)ADM2 -P":1.70,"5)HPB -P":2.19,"B1)HPVN -P":1.96,"2)AGVN -P":1.70}', 1),
(501,   1000,   '{"1)HPUS -P":2.18,"2)HPUS FB -P":2.06,"3)ADM1 -P":1.70,"4)ADM2 -P":1.70,"5)HPB -P":2.19,"B1)HPVN -P":1.96,"2)AGVN -P":1.70}', 2),
(1001,  2000,   '{"1)HPUS -P":1.82,"2)HPUS FB -P":1.72,"3)ADM1 -P":1.60,"4)ADM2 -P":1.60,"5)HPB -P":2.19,"B1)HPVN -P":1.84,"2)AGVN -P":1.60}', 3),
(2001,  3500,   '{"1)HPUS -P":1.76,"2)HPUS FB -P":1.67,"3)ADM1 -P":1.50,"4)ADM2 -P":1.50,"5)HPB -P":2.19,"B1)HPVN -P":1.73,"2)AGVN -P":1.50}', 4),
(3501,  5000,   '{"1)HPUS -P":1.59,"2)HPUS FB -P":1.50,"3)ADM1 -P":1.40,"4)ADM2 -P":1.40,"5)HPB -P":2.19,"B1)HPVN -P":1.61,"2)AGVN -P":1.40}', 5),
(5001,  10000,  '{"1)HPUS -P":1.53,"2)HPUS FB -P":1.44,"3)ADM1 -P":1.35,"4)ADM2 -P":1.35,"5)HPB -P":2.19,"B1)HPVN -P":1.55,"2)AGVN -P":1.35}', 6),
(10001, 999999, '{"1)HPUS -P":1.53,"2)HPUS FB -P":1.44,"3)ADM1 -P":1.35,"4)ADM2 -P":1.35,"5)HPB -P":1.96,"B1)HPVN -P":1.55,"2)AGVN -P":1.35}', 7);
