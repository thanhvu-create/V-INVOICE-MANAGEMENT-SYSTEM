-- =============================================================
-- V-Invoice — Full Database Migration
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query)
-- Order matters: tables with FK dependencies come after their parents
-- =============================================================

-- ── Extensions ────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ── 1. bom_products ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bom_products (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_jwmold    TEXT        UNIQUE NOT NULL,
  description   TEXT,
  class         TEXT,
  sub_class     TEXT,
  metal_type    TEXT,
  labor_fee     NUMERIC     DEFAULT 0,
  casting_fee   NUMERIC     DEFAULT 0,
  design_fee    NUMERIC     DEFAULT 0,
  resin_fee     NUMERIC     DEFAULT 0,
  misc_fee      NUMERIC     DEFAULT 0,
  is_active     BOOLEAN     DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_bom_products_sku ON bom_products(sku_jwmold);


-- ── 2. daily_metal_rates ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_metal_rates (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date   DATE        UNIQUE NOT NULL,
  gold_24k    NUMERIC,
  gold_18kw   NUMERIC,
  gold_18ky   NUMERIC,
  gold_14ky   NUMERIC,
  platinum    NUMERIC,
  silver      NUMERIC,
  palladium   NUMERIC,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rates_date ON daily_metal_rates(rate_date DESC);


-- ── 3. pricing_rules ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_rules (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT        NOT NULL,
  description      TEXT,
  cif_multiplier   NUMERIC     NOT NULL DEFAULT 1.0,
  tag_multiplier   NUMERIC     NOT NULL DEFAULT 1.0,
  fr_multiplier    NUMERIC     NOT NULL DEFAULT 1.0,
  casting_loss_pct NUMERIC     NOT NULL DEFAULT 5.0,
  is_active        BOOLEAN     DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
-- Only one active rule enforced by application (two-step update)


-- ── 4. app_users ──────────────────────────────────────────────
-- Mirrors Supabase Auth users with app-level role
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
CREATE TABLE IF NOT EXISTS invoice_headers (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number        TEXT        UNIQUE NOT NULL,
  mr_number        TEXT,
  status           TEXT        NOT NULL DEFAULT 'draft'
                     CHECK (status IN ('draft','pending_approval','approved','invoiced')),
  is_locked        BOOLEAN     DEFAULT false,
  metal_rate_id    UUID        REFERENCES daily_metal_rates(id),
  pricing_rule_id  UUID        REFERENCES pricing_rules(id),
  store            TEXT,
  notes            TEXT,
  created_by       TEXT        NOT NULL,  -- full_name of creator (denormalised for history)
  snapshot_at      TIMESTAMPTZ,
  snapshot_data    JSONB,                 -- written by trigger on → 'invoiced'
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_inv_headers_status     ON invoice_headers(status);
CREATE INDEX IF NOT EXISTS idx_inv_headers_created_at ON invoice_headers(created_at DESC);


-- ── 6. invoice_items ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID        NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  line_no               INTEGER     NOT NULL,
  sku_jwmold            TEXT        NOT NULL,
  qty_pcs               INTEGER     DEFAULT 1,
  store                 TEXT,
  location_store        TEXT,
  so_mo_code            TEXT,
  vendor_model          TEXT,
  description           TEXT,
  class                 TEXT,
  sub_class             TEXT,
  notes                 TEXT,
  -- Weight fields
  weight_total_gr       NUMERIC,
  weight_gold_actual_gr NUMERIC,
  weight_no_gem_gr      NUMERIC,
  metal_type            TEXT,
  -- Fee fields (copied from bom_products at import, overrideable)
  labor_fee             NUMERIC     DEFAULT 0,
  casting_fee           NUMERIC     DEFAULT 0,
  design_fee            NUMERIC     DEFAULT 0,
  resin_fee             NUMERIC     DEFAULT 0,
  misc_fee              NUMERIC     DEFAULT 0,
  -- Computed & stored pricing
  gold_value_usd        NUMERIC     DEFAULT 0,
  hpusa                 NUMERIC     DEFAULT 0,
  cif_price             NUMERIC     DEFAULT 0,
  tag_price             NUMERIC     DEFAULT 0,
  fr_price              NUMERIC     DEFAULT 0,
  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),
  UNIQUE (invoice_id, line_no)
);
CREATE INDEX IF NOT EXISTS idx_inv_items_invoice_id ON invoice_items(invoice_id);


-- ── 7. item_gem_details ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS item_gem_details (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_item_id     UUID        NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
  gem_type            TEXT,
  qty_pcs             INTEGER     DEFAULT 0,
  weight_ct_before    NUMERIC,
  weight_ct_after     NUMERIC,
  unit_price_per_ct   NUMERIC     DEFAULT 0,
  setting_fee_per_pcs NUMERIC     DEFAULT 0,
  -- GENERATED ALWAYS AS — never write from application code
  weight_gr           NUMERIC     GENERATED ALWAYS AS (weight_ct_after * 0.2)              STORED,
  total_price         NUMERIC     GENERATED ALWAYS AS (weight_ct_after * unit_price_per_ct) STORED,
  total_setting_fee   NUMERIC     GENERATED ALWAYS AS (qty_pcs * setting_fee_per_pcs)       STORED,
  created_at          TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_gems_item_id ON item_gem_details(invoice_item_id);


-- ── 8. audit_logs ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id  UUID        NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  user_id     UUID        REFERENCES app_users(id),          -- null = system action
  action      TEXT        NOT NULL,                          -- 'created','approved', etc.
  from_status TEXT,
  to_status   TEXT,
  note        TEXT,
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_invoice_id  ON audit_logs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_audit_created_at  ON audit_logs(created_at DESC);


-- =============================================================
-- TRIGGER — snapshot_invoice_on_invoiced
-- Fires BEFORE UPDATE on invoice_headers when status → 'invoiced'
-- Sets snapshot_data + snapshot_at + is_locked = true
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
-- RPC — get_dashboard_stats()
-- Called by GET /api/dashboard/stats
-- Returns JSON with by_status, total_items, month_cif, month_invoice_count
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
-- SEED DATA — insert after tables exist
-- Comment out if you don't want sample data
-- =============================================================

-- Default pricing rule (activate manually from admin UI after login)
INSERT INTO pricing_rules (name, description, cif_multiplier, tag_multiplier, fr_multiplier, casting_loss_pct, is_active)
VALUES ('Standard 2024', 'Default multipliers', 1.15, 1.30, 1.10, 5.0, true)
ON CONFLICT DO NOTHING;

-- Sample metal rate (update with real rates before use)
INSERT INTO daily_metal_rates (rate_date, gold_24k, gold_18kw, gold_18ky, gold_14ky, platinum, silver, palladium)
VALUES (CURRENT_DATE, 78.50, 60.25, 60.25, 46.85, 31.20, 0.98, 34.10)
ON CONFLICT (rate_date) DO NOTHING;
