-- =============================================================
-- Migration: thêm spot price fields vào daily_metal_rates
-- Nguồn: Excel SUMMARY rows 1-13 — user nhập spot USD/oz
-- Run AFTER migration.sql
-- =============================================================

ALTER TABLE daily_metal_rates
  ADD COLUMN IF NOT EXISTS spot_24k_oz   NUMERIC(12,4),   -- USD/oz từ Kitco (24K spot)
  ADD COLUMN IF NOT EXISTS spot_pt_oz    NUMERIC(12,4),   -- USD/oz Platinum
  ADD COLUMN IF NOT EXISTS spot_ag_oz    NUMERIC(12,4),   -- USD/oz Silver
  ADD COLUMN IF NOT EXISTS spot_pd_oz    NUMERIC(12,4),   -- USD/oz Palladium
  ADD COLUMN IF NOT EXISTS oz_per_gram   NUMERIC(8,4) DEFAULT 31.1035,  -- troy oz → gram (configurable)
  ADD COLUMN IF NOT EXISTS loss_gold_pct NUMERIC(5,2) DEFAULT 6.0,   -- hao hụt vàng (6%)
  ADD COLUMN IF NOT EXISTS loss_pt_pct   NUMERIC(5,2) DEFAULT 17.0,  -- hao hụt Platinum (17%)
  ADD COLUMN IF NOT EXISTS karat_prices  JSONB;           -- { "24K":131.82, "23K":126.33, "18K":104.80, ... }

-- karat_prices JSONB stores ALL computed derived rates:
-- Keys: "24K", "23K", "22K", "18K", "15K", "14K", "10K", "PT", "AG", "PD"
-- Formula (từ Excel SUMMARY):
--   OZ = 31.103
--   24K = spot_24k_oz / OZ                                    (no loss — pure gold reference)
--   23K = spot_24k_oz * (23/24) / OZ                         (no loss)
--   22K = spot_24k_oz * (22/24) / OZ                         (no loss)
--   18K = spot_24k_oz * (18/24) * (1 + loss_gold/100) / OZ  (with loss — alloy karat)
--   15K = spot_24k_oz * (15/24) * (1 + loss_gold/100) / OZ
--   14K = spot_24k_oz * (14/24) * (1 + loss_gold/100) / OZ
--   10K = spot_24k_oz * (10/24) * (1 + loss_gold/100) / OZ
--   PT  = spot_pt_oz  * (1 + loss_pt/100) / OZ
--   AG  = spot_ag_oz  * (1 + loss_gold/100) * (1 + loss_pt/100) / OZ
--   PD  = spot_pd_oz  * (1 + loss_gold/100) * (1 + loss_pt/100) / OZ

CREATE INDEX IF NOT EXISTS idx_daily_metal_rates_date ON daily_metal_rates(rate_date DESC);
