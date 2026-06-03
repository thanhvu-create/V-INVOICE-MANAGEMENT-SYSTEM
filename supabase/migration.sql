-- =============================================================
-- V-Invoice — Full Database Migration
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query)
-- Order matters: tables with FK dependencies come after their parents
-- =============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ── 1. bom_products ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bom_products (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_jwmold       TEXT        UNIQUE NOT NULL,
  description      TEXT,
  class            TEXT,
  sub_class        TEXT,
  metal_type       TEXT,
  weight_gr        NUMERIC(8,4),           -- standard weight reference
  casting_loss_pct NUMERIC(5,2) DEFAULT 5, -- % hao hụt đúc per product
  labor_fee        NUMERIC(10,2) DEFAULT 0,
  casting_fee      NUMERIC(10,2) DEFAULT 0,
  design_fee       NUMERIC(10,2) DEFAULT 0,
  resin_fee        NUMERIC(10,2) DEFAULT 0,
  misc_fee         NUMERIC(10,2) DEFAULT 0,
  image_url        TEXT,
  is_active        BOOLEAN     NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bom_products_sku    ON bom_products(sku_jwmold);
CREATE INDEX IF NOT EXISTS idx_bom_products_active ON bom_products(is_active);


-- ── 2. daily_metal_rates ──────────────────────────────────────
-- NOTE: Rates stored here are DERIVED rates (casting loss already baked in).
-- See xlsx-realworld-analysis.md §0 — user enters 18K derived rate (~104.80),
-- not spot price (~98.87). pricing_rules.casting_loss_pct should be 0 when
-- using derived rates, or > 0 when using raw spot prices.
CREATE TABLE IF NOT EXISTS daily_metal_rates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date   DATE        UNIQUE NOT NULL,
  gold_24k    NUMERIC(12,4),    -- USD/gram
  gold_18kw   NUMERIC(12,4),
  gold_18ky   NUMERIC(12,4),
  gold_14ky   NUMERIC(12,4),
  platinum    NUMERIC(12,4),    -- PT950 + PT
  silver      NUMERIC(12,4),    -- AG
  palladium   NUMERIC(12,4),    -- PD
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  created_by  TEXT,             -- username or email of who entered the rate
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rates_date   ON daily_metal_rates(rate_date DESC);
CREATE INDEX IF NOT EXISTS idx_rates_active ON daily_metal_rates(is_active);


-- ── 3. pricing_rules ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_rules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  description      TEXT,
  cif_multiplier   NUMERIC(6,4) NOT NULL DEFAULT 1.10,  -- A: hpusa → cif
  tag_multiplier   NUMERIC(6,4) NOT NULL DEFAULT 1.20,  -- B: cif → tag
  fr_multiplier    NUMERIC(6,4) NOT NULL DEFAULT 1.05,  -- C: cif → fr
  casting_loss_pct NUMERIC(5,2) NOT NULL DEFAULT 0.0,   -- 0 when rates are derived
  is_active        BOOLEAN     DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
-- CONSTRAINT: Only one row may have is_active = true — enforced by application


-- ── 4. app_users ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS app_users (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id    UUID        UNIQUE NOT NULL,   -- references auth.users.id
  email      TEXT        UNIQUE NOT NULL,
  full_name  TEXT        NOT NULL DEFAULT '',
  role       TEXT        NOT NULL DEFAULT 'viewer'
               CHECK (role IN ('admin', 'manager', 'user', 'viewer')),
  is_active  BOOLEAN     DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_app_users_auth_id ON app_users(auth_id);
CREATE INDEX IF NOT EXISTS idx_app_users_email   ON app_users(email);


-- ── 5. invoice_headers ────────────────────────────────────────
-- NOTE: invoice_no is set by trigger trg_set_invoice_no on INSERT.
-- Cannot use GENERATED ALWAYS AS because TO_CHAR(timestamptz,...) is STABLE not IMMUTABLE.
CREATE TABLE IF NOT EXISTS invoice_headers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_no       TEXT,       -- set by trg_set_invoice_no trigger on INSERT
  po_number        TEXT        UNIQUE NOT NULL,
  mr_number        TEXT,
  customer_name    TEXT,
  invoice_date     DATE        DEFAULT CURRENT_DATE,
  status           TEXT        NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','pending_approval','approved','invoiced')),
  is_locked        BOOLEAN     DEFAULT false,
  metal_rate_id    UUID        REFERENCES daily_metal_rates(id),
  pricing_rule_id  UUID        REFERENCES pricing_rules(id),
  store            TEXT,
  notes            TEXT,
  -- created_by_user_id: UUID FK for ownership checks (editGuard, audit)
  created_by_user_id UUID      REFERENCES app_users(id),
  -- created_by: denormalized display name — kept for historical display
  created_by       TEXT        NOT NULL DEFAULT '',
  snapshot_at      TIMESTAMPTZ,
  snapshot_data    JSONB,                 -- written ONLY by trigger on → 'invoiced'
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_headers_status     ON invoice_headers(status);
CREATE INDEX IF NOT EXISTS idx_inv_headers_created_by ON invoice_headers(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_inv_headers_created_at ON invoice_headers(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_inv_headers_date       ON invoice_headers(invoice_date DESC);
CREATE INDEX IF NOT EXISTS idx_inv_headers_rate_id    ON invoice_headers(metal_rate_id);
CREATE INDEX IF NOT EXISTS idx_inv_headers_rule_id    ON invoice_headers(pricing_rule_id);


-- ── 6. invoice_items ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID        NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  line_no               INTEGER     NOT NULL,
  sku_jwmold            TEXT        NOT NULL,
  bom_product_id        UUID        REFERENCES bom_products(id),  -- soft FK
  qty_pcs               INTEGER     DEFAULT 1,
  store                 TEXT,
  location_store        TEXT,
  so_mo_code            TEXT,
  vendor_model          TEXT,
  description           TEXT,
  class                 TEXT,
  sub_class             TEXT,
  size                  TEXT,
  customer_name         TEXT,
  notes                 TEXT,
  image_url             TEXT,           -- denormalized from bom_products at time of add/import

  -- Shipping / logistics
  ship_date             DATE,
  tracking_no           TEXT,
  vinvoice_no           TEXT,

  -- Weights
  weight_total_gr       NUMERIC(8,4),
  weight_gold_actual_gr NUMERIC(8,4),
  weight_no_gem_gr      NUMERIC(8,4),   -- computed server-side = total - Σgem.weight_gr

  -- Metal & Pricing (all computed server-side via recalcItem)
  metal_type            TEXT,
  gold_value_usd        NUMERIC(10,2)  DEFAULT 0,
  labor_fee             NUMERIC(10,2)  DEFAULT 0,
  casting_fee           NUMERIC(10,2)  DEFAULT 0,
  design_fee            NUMERIC(10,2)  DEFAULT 0,
  resin_fee             NUMERIC(10,2)  DEFAULT 0,
  misc_fee              NUMERIC(10,2)  DEFAULT 0,
  hpusa                 NUMERIC(10,2)  DEFAULT 0,
  cif_price             NUMERIC(10,2)  DEFAULT 0,
  tag_price             NUMERIC(10,2)  DEFAULT 0,
  fr_price              NUMERIC(10,2)  DEFAULT 0,

  -- Sales pricing (visible: manager/admin only)
  sell_price            NUMERIC(10,2),
  discount_pct          NUMERIC(5,2),
  after_discount_price  NUMERIC(10,2),

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE (invoice_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_inv_items_invoice_id ON invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_inv_items_sku        ON invoice_items(sku_jwmold);


-- ── 7. item_gem_details ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_gem_details (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_item_id     UUID        NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
  gem_type            TEXT,              -- 'RD', 'PR', 'BG', 'MQ', 'OV', 'PS', 'RDL', 'XC', 'PL'
  quality             TEXT,              -- P.chất: 'VVS1', 'VS1', 'SI1', 'LG', 'F', 'VF'...
  shape               TEXT,              -- 'Round', 'Oval', 'Princess', 'Cushion'...
  size_mm             TEXT,              -- '1.5mm', '3x4mm'...
  qty_pcs             INTEGER     DEFAULT 0,
  weight_ct_before    NUMERIC(8,4),      -- carat before processing
  weight_ct_after     NUMERIC(8,4),      -- carat after — used by GENERATED columns
  unit_price_per_ct   NUMERIC(10,2)  DEFAULT 0,
  setting_type        TEXT,              -- 'Prong', 'Bezel', 'Pave', 'Channel'...
  setting_fee_per_pcs NUMERIC(10,2)  DEFAULT 0,
  sort_order          INTEGER     DEFAULT 0,

  -- GENERATED ALWAYS AS (STORED) — NEVER compute or write these from application code
  weight_gr           NUMERIC(8,4)
    GENERATED ALWAYS AS (weight_ct_after * 0.2)               STORED,
  total_price         NUMERIC(10,2)
    GENERATED ALWAYS AS (weight_ct_after * unit_price_per_ct) STORED,
  total_setting_fee   NUMERIC(10,2)
    GENERATED ALWAYS AS (qty_pcs * setting_fee_per_pcs)       STORED,

  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gems_item_id ON item_gem_details(invoice_item_id);


-- ── 8. gem_price_catalog ──────────────────────────────────────
-- Gem price lookup table (from "10) Bảng giá NVL-10" sheet in real Excel)
-- GemModal: user selects gem_code → auto-fill unit_price_per_ct = mk_price
-- price_unit: 'per_ct' (carat-based) | 'per_pcs' (piece-based, for XC/PL types)
CREATE TABLE IF NOT EXISTS gem_price_catalog (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  gem_code    TEXT        NOT NULL UNIQUE,   -- 'RD B1', 'BG3', 'MQ4'...
  gem_type    TEXT        NOT NULL,          -- 'RD', 'PR', 'BG', 'MQ', 'OV', 'PS', 'RDL', 'XC', 'PL'
  size_range  TEXT,                          -- '0.7-2.0mm', '0.03-0.05ct'...
  cost_price  NUMERIC(10,2),                 -- internal cost ($/ct or $/pcs)
  mk_price    NUMERIC(10,2),                 -- MK PRICE used for T.GIÁ XOÀN
  price_unit  TEXT        NOT NULL DEFAULT 'per_ct',
  is_active   BOOLEAN     NOT NULL DEFAULT true,
  notes       TEXT,
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gem_catalog_code ON gem_price_catalog(gem_code);
CREATE INDEX IF NOT EXISTS idx_gem_catalog_type ON gem_price_catalog(gem_type);


-- ── 9. audit_logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID        NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES app_users(id),   -- null = system action
  action      TEXT        NOT NULL,
  from_status TEXT,
  to_status   TEXT,
  note        TEXT,
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_invoice_id ON audit_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);


-- =============================================================
-- TRIGGER — snapshot_invoice_on_invoiced
-- Fires BEFORE UPDATE on invoice_headers when status → 'invoiced'
-- Sets snapshot_data + snapshot_at + is_locked = true
-- APPLICATION CODE MUST NEVER set is_locked or write snapshot_data directly
-- =============================================================

CREATE OR REPLACE FUNCTION snapshot_invoice_on_invoiced()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_items JSONB;
  v_gems  JSONB;
  v_rate  JSONB;
  v_rule  JSONB;
BEGIN
  IF NEW.status = 'invoiced' AND (OLD.status IS DISTINCT FROM 'invoiced') THEN

    SELECT json_agg(i.*)
      INTO v_items
      FROM invoice_items i
     WHERE i.invoice_id = NEW.id;

    SELECT json_agg(g.*)
      INTO v_gems
      FROM item_gem_details g
      JOIN invoice_items    i ON g.invoice_item_id = i.id
     WHERE i.invoice_id = NEW.id;

    SELECT row_to_json(r.*)
      INTO v_rate
      FROM daily_metal_rates r
     WHERE r.id = NEW.metal_rate_id;

    SELECT row_to_json(p.*)
      INTO v_rule
      FROM pricing_rules p
     WHERE p.id = NEW.pricing_rule_id;

    NEW.snapshot_data := jsonb_build_object(
      'header',      row_to_json(NEW.*),
      'items',       COALESCE(v_items, '[]'::jsonb),
      'gems',        COALESCE(v_gems,  '[]'::jsonb),
      'rate',        v_rate,
      'rule',        v_rule,
      'snapshot_at', now()
    );
    NEW.snapshot_at := now();
    NEW.is_locked   := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_invoice ON invoice_headers;
CREATE TRIGGER trg_snapshot_invoice
  BEFORE UPDATE ON invoice_headers
  FOR EACH ROW
  EXECUTE FUNCTION snapshot_invoice_on_invoiced();


-- =============================================================
-- TRIGGER — set_invoice_no
-- Sets invoice_no on INSERT (cannot use GENERATED ALWAYS AS because
-- TO_CHAR(timestamptz,...) is STABLE not IMMUTABLE in PostgreSQL)
-- =============================================================

CREATE OR REPLACE FUNCTION set_invoice_no()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.invoice_no := 'INV-' || TO_CHAR(NEW.created_at, 'YYYYMM') || '-' || SUBSTRING(NEW.id::TEXT, 1, 6);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_invoice_no ON invoice_headers;
CREATE TRIGGER trg_set_invoice_no
  BEFORE INSERT ON invoice_headers
  FOR EACH ROW
  EXECUTE FUNCTION set_invoice_no();


-- =============================================================
-- RPC — get_dashboard_stats()
-- =============================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'by_status', (
      SELECT COALESCE(json_object_agg(status, cnt), '{}'::json)
        FROM (
          SELECT status, COUNT(*) AS cnt
            FROM invoice_headers
           GROUP BY status
        ) s
    ),
    'total_items', (
      SELECT COUNT(*) FROM invoice_items
    ),
    'month_cif', (
      SELECT COALESCE(SUM(i.cif_price), 0)
        FROM invoice_items    i
        JOIN invoice_headers  h ON h.id = i.invoice_id
       WHERE DATE_TRUNC('month', h.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
           = DATE_TRUNC('month', NOW()        AT TIME ZONE 'Asia/Ho_Chi_Minh')
    ),
    'month_invoice_count', (
      SELECT COUNT(*)
        FROM invoice_headers
       WHERE DATE_TRUNC('month', created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')
           = DATE_TRUNC('month', NOW()      AT TIME ZONE 'Asia/Ho_Chi_Minh')
    )
  ) INTO result;

  RETURN result;
END;
$$;


-- =============================================================
-- SEED DATA
-- =============================================================

INSERT INTO pricing_rules (name, description, cif_multiplier, tag_multiplier, fr_multiplier, casting_loss_pct, is_active)
VALUES ('Standard', 'Standard multipliers — use with derived metal rates', 1.10, 1.20, 1.05, 0.0, true)
ON CONFLICT DO NOTHING;

INSERT INTO daily_metal_rates (rate_date, gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium, created_by)
VALUES (CURRENT_DATE, 131.82, 104.80, 104.80, 81.51, 75.23, 2.39, 67.71, 'seed')
ON CONFLICT (rate_date) DO NOTHING;


-- =============================================================
-- UPGRADE — ALTER TABLE for existing databases
-- Run ONLY if you have already deployed a previous version of migration.sql
-- All statements use IF NOT EXISTS / are idempotent — safe to re-run
-- =============================================================

-- bom_products
ALTER TABLE bom_products ADD COLUMN IF NOT EXISTS weight_gr        NUMERIC(8,4);
ALTER TABLE bom_products ADD COLUMN IF NOT EXISTS casting_loss_pct NUMERIC(5,2) DEFAULT 5;
ALTER TABLE bom_products ADD COLUMN IF NOT EXISTS image_url        TEXT;

-- daily_metal_rates
ALTER TABLE daily_metal_rates ADD COLUMN IF NOT EXISTS is_active  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE daily_metal_rates ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE daily_metal_rates ADD COLUMN IF NOT EXISTS created_by TEXT;

-- invoice_headers
ALTER TABLE invoice_headers ADD COLUMN IF NOT EXISTS invoice_date       DATE DEFAULT CURRENT_DATE;
ALTER TABLE invoice_headers ADD COLUMN IF NOT EXISTS customer_name      TEXT;
ALTER TABLE invoice_headers ADD COLUMN IF NOT EXISTS updated_at         TIMESTAMPTZ DEFAULT now();
-- created_by_user_id: new UUID FK for ownership checks (editGuard)
-- existing created_by TEXT is kept as display name
ALTER TABLE invoice_headers ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES app_users(id);
-- invoice_no: plain TEXT column + trigger (GENERATED is not possible with timestamptz)
ALTER TABLE invoice_headers ADD COLUMN IF NOT EXISTS invoice_no TEXT;
-- Backfill existing rows
UPDATE invoice_headers
SET invoice_no = 'INV-' || TO_CHAR(created_at, 'YYYYMM') || '-' || SUBSTRING(id::TEXT, 1, 6)
WHERE invoice_no IS NULL;

-- invoice_items
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS bom_product_id       UUID REFERENCES bom_products(id);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS size                  TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS customer_name         TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS image_url             TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS ship_date             DATE;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS tracking_no           TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS vinvoice_no           TEXT;
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS sell_price            NUMERIC(10,2);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS discount_pct          NUMERIC(5,2);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS after_discount_price  NUMERIC(10,2);
ALTER TABLE invoice_items ADD COLUMN IF NOT EXISTS updated_at            TIMESTAMPTZ DEFAULT now();

-- item_gem_details
ALTER TABLE item_gem_details ADD COLUMN IF NOT EXISTS quality             TEXT;
ALTER TABLE item_gem_details ADD COLUMN IF NOT EXISTS shape               TEXT;
ALTER TABLE item_gem_details ADD COLUMN IF NOT EXISTS size_mm             TEXT;
ALTER TABLE item_gem_details ADD COLUMN IF NOT EXISTS setting_type        TEXT;
ALTER TABLE item_gem_details ADD COLUMN IF NOT EXISTS sort_order          INTEGER DEFAULT 0;
ALTER TABLE item_gem_details ADD COLUMN IF NOT EXISTS updated_at          TIMESTAMPTZ DEFAULT now();
ALTER TABLE item_gem_details ADD COLUMN IF NOT EXISTS gem_code            TEXT;
ALTER TABLE item_gem_details ADD COLUMN IF NOT EXISTS price_unit          TEXT DEFAULT 'per_ct';

-- gem_price_catalog (new — CREATE TABLE IF NOT EXISTS above handles fresh deploys)
-- No ALTER needed for existing DBs that never had this table
