# Database Schema — V-Invoice (Supabase PostgreSQL)
> **8 tables + RLS + PostgreSQL triggers + Realtime subscriptions**

---

## 1. FULL SQL SCHEMA

```sql
-- ============================================================
-- 1. BOM PRODUCTS (SKU catalog)
-- ============================================================
CREATE TABLE bom_products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_jwmold       TEXT UNIQUE NOT NULL,   -- lookup key từ Excel import
  description      TEXT,
  class            TEXT,
  sub_class        TEXT,
  metal_type       TEXT,                   -- '18KW' | '18KY' | '14KY' | 'PT950' | 'PT' | 'AG' | 'PD'
  casting_loss_pct NUMERIC(5,2) DEFAULT 5, -- % casting loss, thường 5%
  labor_fee        NUMERIC(10,2) DEFAULT 0,
  casting_fee      NUMERIC(10,2) DEFAULT 0,
  design_fee       NUMERIC(10,2) DEFAULT 0,
  resin_fee        NUMERIC(10,2) DEFAULT 0,
  misc_fee         NUMERIC(10,2) DEFAULT 0,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON bom_products(sku_jwmold);


-- ============================================================
-- 2. DAILY METAL RATES
-- ============================================================
CREATE TABLE daily_metal_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date   DATE UNIQUE NOT NULL,   -- khóa tra cứu theo ngày
  gold_24k    NUMERIC(10,4),          -- USD/gram
  gold_18kw   NUMERIC(10,4),
  gold_18ky   NUMERIC(10,4),
  gold_14ky   NUMERIC(10,4),
  platinum    NUMERIC(10,4),          -- PT950
  silver      NUMERIC(10,4),          -- AG
  palladium   NUMERIC(10,4),          -- PD
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON daily_metal_rates(rate_date DESC);


-- ============================================================
-- 3. PRICING RULES
-- ============================================================
CREATE TABLE pricing_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  cif_multiplier    NUMERIC(6,4) NOT NULL DEFAULT 1.10,  -- A
  tag_multiplier    NUMERIC(6,4) NOT NULL DEFAULT 1.20,  -- B (applied to CIF)
  fr_multiplier     NUMERIC(6,4) NOT NULL DEFAULT 1.05,  -- C (applied to CIF)
  casting_loss_pct  NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  is_active         BOOLEAN DEFAULT true,
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 4. INVOICE HEADERS
-- ============================================================
CREATE TYPE invoice_status AS ENUM (
  'draft', 'pending_approval', 'approved', 'invoiced'
);

CREATE TABLE invoice_headers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number       TEXT NOT NULL,
  mr_number       TEXT,
  status          invoice_status NOT NULL DEFAULT 'draft',
  is_locked       BOOLEAN NOT NULL DEFAULT false,
  metal_rate_id   UUID REFERENCES daily_metal_rates(id),
  pricing_rule_id UUID REFERENCES pricing_rules(id),
  store           TEXT,
  notes           TEXT,
  created_by      UUID NOT NULL,    -- user id
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  snapshot_at     TIMESTAMPTZ       -- set when invoiced
);
CREATE INDEX ON invoice_headers(status);
CREATE INDEX ON invoice_headers(created_by);
CREATE INDEX ON invoice_headers(created_at DESC);


-- ============================================================
-- 5. INVOICE ITEMS (line items)
-- ============================================================
CREATE TABLE invoice_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  line_no               INTEGER NOT NULL,
  sku_jwmold            TEXT NOT NULL REFERENCES bom_products(sku_jwmold),
  qty_pcs               INTEGER DEFAULT 1,
  store                 TEXT DEFAULT 'HP',
  location_store        TEXT DEFAULT 'Safe 1',
  so_mo_code            TEXT,
  vendor_model          TEXT,
  description           TEXT,
  class                 TEXT,
  sub_class             TEXT,
  notes                 TEXT,

  -- Weights
  weight_total_gr       NUMERIC(8,4),   -- tổng trọng lượng
  weight_gold_actual_gr NUMERIC(8,4),   -- trọng lượng vàng thực
  weight_no_gem_gr      NUMERIC(8,4),   -- = total - Σgem.weight_gr (tính server)

  -- Metal & Pricing
  metal_type            TEXT,           -- override từ bom_products nếu cần
  gold_value_usd        NUMERIC(10,2),  -- weight_gold_actual × rate × (1 + loss/100)
  labor_fee             NUMERIC(10,2),
  casting_fee           NUMERIC(10,2),
  design_fee            NUMERIC(10,2),
  resin_fee             NUMERIC(10,2),
  misc_fee              NUMERIC(10,2),
  hpusa                 NUMERIC(10,2),  -- tổng vốn sản xuất
  cif_price             NUMERIC(10,2),  -- hpusa × A
  tag_price             NUMERIC(10,2),  -- cif × B
  fr_price              NUMERIC(10,2),  -- cif × C

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON invoice_items(invoice_id);
CREATE INDEX ON invoice_items(sku_jwmold);


-- ============================================================
-- 6. ITEM GEM DETAILS (stone details per item)
-- ============================================================
CREATE TABLE item_gem_details (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_item_id      UUID NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
  gem_type             TEXT,              -- 'Diamond', 'Ruby', 'Sapphire', ...
  qty_pcs              INTEGER DEFAULT 1,
  weight_ct_before     NUMERIC(8,4),      -- carat trước
  weight_ct_after      NUMERIC(8,4),      -- carat sau (dùng để tính)
  unit_price_per_ct    NUMERIC(10,2),     -- USD/carat
  setting_fee_per_pcs  NUMERIC(10,2),     -- USD/viên setting

  -- GENERATED ALWAYS columns (PostgreSQL computed):
  weight_gr            NUMERIC(8,4)
    GENERATED ALWAYS AS (weight_ct_after * 0.2) STORED,
  total_price          NUMERIC(10,2)
    GENERATED ALWAYS AS (weight_ct_after * unit_price_per_ct) STORED,
  total_setting_fee    NUMERIC(10,2)
    GENERATED ALWAYS AS (qty_pcs * setting_fee_per_pcs) STORED,

  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON item_gem_details(invoice_item_id);


-- ============================================================
-- 7. INVOICE SNAPSHOTS (frozen data khi invoiced)
-- ============================================================
CREATE TABLE invoice_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id    UUID UNIQUE NOT NULL REFERENCES invoice_headers(id),
  snapshot_data JSONB NOT NULL,   -- full header + items + gems
  metal_rates   JSONB,            -- daily_metal_rates row at time of invoicing
  pricing_rules JSONB,            -- pricing_rules row at time of invoicing
  created_at    TIMESTAMPTZ DEFAULT now()
);


-- ============================================================
-- 8. AUDIT LOGS
-- ============================================================
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  from_status  invoice_status,
  to_status    invoice_status NOT NULL,
  changed_by   UUID NOT NULL,   -- user id
  note         TEXT,
  created_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON audit_logs(invoice_id);
CREATE INDEX ON audit_logs(created_at DESC);
```

---

## 2. POSTGRESQL TRIGGER — SNAPSHOT ON INVOICED

```sql
CREATE OR REPLACE FUNCTION snapshot_invoice_on_invoiced()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'invoiced' AND OLD.status != 'invoiced' THEN

    -- Create snapshot
    INSERT INTO invoice_snapshots (invoice_id, snapshot_data, metal_rates, pricing_rules)
    SELECT
      NEW.id,
      jsonb_build_object(
        'header', row_to_json(NEW),
        'items', (
          SELECT jsonb_agg(
            jsonb_build_object(
              'item', row_to_json(i),
              'gems', (
                SELECT jsonb_agg(row_to_json(g))
                FROM item_gem_details g
                WHERE g.invoice_item_id = i.id
              )
            )
          )
          FROM invoice_items i WHERE i.invoice_id = NEW.id
        )
      ),
      (SELECT row_to_json(dmr) FROM daily_metal_rates dmr WHERE dmr.id = NEW.metal_rate_id),
      (SELECT row_to_json(pr)  FROM pricing_rules pr WHERE pr.id = NEW.pricing_rule_id);

    -- Lock invoice
    NEW.is_locked   = true;
    NEW.snapshot_at = now();

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_snapshot_invoice
BEFORE UPDATE ON invoice_headers
FOR EACH ROW EXECUTE FUNCTION snapshot_invoice_on_invoiced();
```

---

## 3. ROW LEVEL SECURITY (RLS)

```sql
-- Enable RLS
ALTER TABLE invoice_headers ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_gem_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses all RLS (used by API routes)
-- API routes dùng SUPABASE_SERVICE_ROLE_KEY → bypass tất cả policies
-- Client-side queries (nếu có) dùng anon key → bị restrict bởi policies

-- Ví dụ policy cơ bản:
CREATE POLICY "Users can read own invoices" ON invoice_headers
  FOR SELECT USING (auth.uid() = created_by);

CREATE POLICY "Service role bypasses" ON invoice_headers
  USING (true)  -- service role always allowed via security definer functions
```

---

## 4. SUPABASE REALTIME

```sql
-- Enable Realtime cho invoice_items và item_gem_details
-- (Thực hiện trong Supabase Dashboard → Database → Replication)

-- Tables cần enable realtime:
-- - invoice_items (Detail View sync)
-- - item_gem_details (Gem changes sync)

-- Channel pattern trong TypeScript:
-- supabase.channel(`invoice:${invoiceId}`)
--   .on('postgres_changes', { event: '*', schema: 'public', table: 'invoice_items', filter: `invoice_id=eq.${invoiceId}` }, handler)
--   .on('postgres_changes', { event: '*', schema: 'public', table: 'item_gem_details' }, handler)
--   .subscribe()
```

---

## 5. KEY RELATIONSHIPS

```
bom_products (sku_jwmold)
    ↑ FK
invoice_items (sku_jwmold)
    ↑ FK (invoice_id)
invoice_headers (id)
    ↑ FK (metal_rate_id)
daily_metal_rates (id)
    ↑ FK (pricing_rule_id)
pricing_rules (id)

invoice_items (id)
    ↑ FK (invoice_item_id)
item_gem_details (id) — GENERATED columns

invoice_headers (id) → trigger → invoice_snapshots
invoice_headers (id) ← audit_logs
```

---

## 6. NUMERIC PRECISION

| Field type | PostgreSQL | Notes |
|------------|-----------|-------|
| USD prices | `NUMERIC(10,2)` | 2 decimal places |
| Weights (gram) | `NUMERIC(8,4)` | 4 decimal places |
| Weights (carat) | `NUMERIC(8,4)` | 4 decimal places |
| Multipliers | `NUMERIC(6,4)` | e.g. 1.1000 |
| Loss % | `NUMERIC(5,2)` | e.g. 5.00 |
| Rates USD/gram | `NUMERIC(10,4)` | 4 decimal places |

---

## 7. INDEXES SUMMARY

```sql
-- Performance critical indexes:
CREATE INDEX ON bom_products(sku_jwmold);                -- import validation
CREATE INDEX ON daily_metal_rates(rate_date DESC);        -- rate lookup
CREATE INDEX ON invoice_headers(status);                  -- filter by status
CREATE INDEX ON invoice_headers(created_by);              -- user filter
CREATE INDEX ON invoice_headers(created_at DESC);         -- pagination
CREATE INDEX ON invoice_items(invoice_id);               -- cascade reads
CREATE INDEX ON invoice_items(sku_jwmold);               -- SKU lookup
CREATE INDEX ON item_gem_details(invoice_item_id);       -- gem reads
CREATE INDEX ON audit_logs(invoice_id);                  -- timeline
CREATE INDEX ON audit_logs(created_at DESC);             -- timeline order
```

---

## 8. SUPABASE CONFIG CHECKLIST

```
[ ] Enable Realtime for: invoice_items, item_gem_details
[ ] Service Role key: SUPABASE_SERVICE_ROLE_KEY (server-only, never public)
[ ] Anon key: NEXT_PUBLIC_SUPABASE_ANON_KEY (client-side)
[ ] Enable RLS on all tables
[ ] Apply trigger: trg_snapshot_invoice
[ ] Seed: at least 1 pricing_rule (is_active = true)
[ ] Seed: daily_metal_rates for today (for testing)
[ ] Seed: at least 1 bom_product (for import testing)
```
