# Database Schema — V-Invoice (Supabase PostgreSQL)
> **9 tables + RLS + PostgreSQL triggers + Realtime subscriptions**
> **Cập nhật lần cuối:** 2026-05-29

---

> **[THAM KHẢO] DEV GUIDELINES — Xác nhận schema khớp 100%:**
> - `invoice_headers` ↔ `Invoice_Header` ✅
> - `invoice_items` ↔ `Invoice_Items` ✅
> - `item_gem_details` ↔ `Invoice_Item_Details` ✅
> - PostgreSQL trigger `trg_snapshot_invoice` ↔ "Trigger khi Invoiced → copy to Snapshot_Log + Is_Locked=true" ✅
> - `invoice_snapshots` table ↔ `Invoice_Snapshot_Log` ✅

---

## 1. FULL SQL SCHEMA

```sql
-- ============================================================
-- 0. APP USERS (role management — NOT JWT claims)
-- ============================================================
CREATE TABLE app_users (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id    UUID UNIQUE,                        -- maps to auth.users.id (nullable before first login)
  email      TEXT UNIQUE NOT NULL,
  full_name  TEXT NOT NULL,
  role       TEXT NOT NULL DEFAULT 'user'
             CHECK (role IN ('admin','manager','user','viewer')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON app_users(auth_id);
CREATE INDEX ON app_users(email);

-- NOTE: Roles are stored here, NOT in JWT custom claims.
-- API routes load role via: SELECT role FROM app_users WHERE auth_id = auth.uid()


-- ============================================================
-- 1. BOM PRODUCTS (SKU catalog)
-- ============================================================
CREATE TABLE bom_products (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_jwmold       TEXT UNIQUE NOT NULL,   -- lookup key từ Excel import
  description      TEXT,
  class            TEXT,
  sub_class        TEXT,
  metal_type       TEXT,                   -- '18KW' | '18KY' | '14KY' | 'PT950' | 'PT' | '24K' | 'AG' | 'PD'
  weight_gr        NUMERIC(8,4),           -- standard weight reference
  casting_loss_pct NUMERIC(5,2) DEFAULT 5, -- % casting loss, thường 5%
  labor_fee        NUMERIC(10,2) DEFAULT 0,
  casting_fee      NUMERIC(10,2) DEFAULT 0,
  design_fee       NUMERIC(10,2) DEFAULT 0,
  resin_fee        NUMERIC(10,2) DEFAULT 0,
  misc_fee         NUMERIC(10,2) DEFAULT 0,
  image_url        TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON bom_products(sku_jwmold);
CREATE INDEX ON bom_products(is_active);


-- ============================================================
-- 2. DAILY METAL RATES
-- ============================================================
CREATE TABLE daily_metal_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date   DATE UNIQUE NOT NULL,   -- khóa tra cứu theo ngày
  gold_24k    NUMERIC(12,4),          -- USD/gram
  gold_18kw   NUMERIC(12,4),
  gold_18ky   NUMERIC(12,4),
  gold_14ky   NUMERIC(12,4),
  platinum    NUMERIC(12,4),          -- PT950 + PT
  silver      NUMERIC(12,4),          -- AG
  palladium   NUMERIC(12,4),          -- PD
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_by  TEXT,                   -- username or email
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON daily_metal_rates(rate_date DESC);
CREATE INDEX ON daily_metal_rates(is_active);


-- ============================================================
-- 3. PRICING RULES
-- ============================================================
CREATE TABLE pricing_rules (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  cif_multiplier    NUMERIC(6,4) NOT NULL DEFAULT 1.10,  -- A: hpusa → cif
  tag_multiplier    NUMERIC(6,4) NOT NULL DEFAULT 1.20,  -- B: cif → tag
  fr_multiplier     NUMERIC(6,4) NOT NULL DEFAULT 1.05,  -- C: cif → fr
  casting_loss_pct  NUMERIC(5,2) NOT NULL DEFAULT 5.0,
  is_active         BOOLEAN DEFAULT true,
  created_by        UUID REFERENCES app_users(id),
  created_at        TIMESTAMPTZ DEFAULT now(),
  updated_at        TIMESTAMPTZ DEFAULT now()
);
-- CONSTRAINT: Only 1 row may have is_active = true at any time
-- Enforced via application logic (PATCH pricing_rules sets others to false)


-- ============================================================
-- 4. INVOICE HEADERS
-- ============================================================
CREATE TYPE invoice_status AS ENUM (
  'draft', 'pending_approval', 'approved', 'invoiced'
);

CREATE TABLE invoice_headers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- invoice_no is GENERATED from creation timestamp + id prefix
  invoice_no      TEXT GENERATED ALWAYS AS (
                    'INV-' || TO_CHAR(created_at, 'YYYYMM') || '-' || SUBSTRING(id::TEXT, 1, 6)
                  ) STORED,
  po_number       TEXT NOT NULL,
  mr_number       TEXT,
  customer_name   TEXT,
  invoice_date    DATE DEFAULT CURRENT_DATE,
  status          invoice_status NOT NULL DEFAULT 'draft',
  is_locked       BOOLEAN NOT NULL DEFAULT false,
  metal_rate_id   UUID REFERENCES daily_metal_rates(id),
  pricing_rule_id UUID REFERENCES pricing_rules(id),
  store           TEXT,
  notes           TEXT,
  created_by      UUID NOT NULL REFERENCES app_users(id),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now(),
  snapshot_data   JSONB,              -- set by trigger only (NEVER by app code)
  snapshot_at     TIMESTAMPTZ         -- set by trigger when invoiced
);
CREATE INDEX ON invoice_headers(status);
CREATE INDEX ON invoice_headers(created_by);
CREATE INDEX ON invoice_headers(created_at DESC);
CREATE INDEX ON invoice_headers(invoice_date DESC);
CREATE INDEX ON invoice_headers(metal_rate_id);
CREATE INDEX ON invoice_headers(pricing_rule_id);


-- ============================================================
-- 5. INVOICE ITEMS (line items)
-- ============================================================
CREATE TABLE invoice_items (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id            UUID NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  line_no               INTEGER NOT NULL,
  sku_jwmold            TEXT NOT NULL,               -- denormalized (snapshot-safe)
  bom_product_id        UUID REFERENCES bom_products(id),  -- soft FK for lookups
  qty_pcs               INTEGER DEFAULT 1,
  store                 TEXT DEFAULT 'HP',
  location_store        TEXT DEFAULT 'Safe 1',
  so_mo_code            TEXT,
  vendor_model          TEXT,
  description           TEXT,
  class                 TEXT,
  sub_class             TEXT,
  size                  TEXT,
  customer_name         TEXT,
  notes                 TEXT,                        -- "ba sao" displayed red in JM view
  image_url             TEXT,

  -- Shipping
  ship_date             DATE,
  tracking_no           TEXT,
  vinvoice_no           TEXT,

  -- Weights
  weight_total_gr       NUMERIC(8,4),   -- tổng trọng lượng
  weight_gold_actual_gr NUMERIC(8,4),   -- trọng lượng vàng thực
  weight_no_gem_gr      NUMERIC(8,4),   -- = total - Σgem.weight_gr (tính server-side)

  -- Metal & Pricing
  metal_type            TEXT,           -- '18KW'|'18KY'|'14KY'|'PT950'|'PT'|'24K'|'AG'|'PD'
  gold_value_usd        NUMERIC(10,2),  -- weight_gold_actual × rate × (1 + loss/100)
  labor_fee             NUMERIC(10,2) DEFAULT 0,
  casting_fee           NUMERIC(10,2) DEFAULT 0,
  design_fee            NUMERIC(10,2) DEFAULT 0,
  resin_fee             NUMERIC(10,2) DEFAULT 0,
  misc_fee              NUMERIC(10,2) DEFAULT 0,
  hpusa                 NUMERIC(10,2),  -- tổng vốn sản xuất
  cif_price             NUMERIC(10,2),  -- hpusa × cif_multiplier (A)
  tag_price             NUMERIC(10,2),  -- cif × tag_multiplier (B)
  fr_price              NUMERIC(10,2),  -- cif × fr_multiplier (C)

  -- Sales pricing (visible: manager/admin only)
  sell_price            NUMERIC(10,2),
  discount_pct          NUMERIC(5,2),
  after_discount_price  NUMERIC(10,2),

  created_at            TIMESTAMPTZ DEFAULT now(),
  updated_at            TIMESTAMPTZ DEFAULT now(),

  UNIQUE (invoice_id, line_no)
);
CREATE INDEX ON invoice_items(invoice_id);
CREATE INDEX ON invoice_items(sku_jwmold);


-- ============================================================
-- 6. ITEM GEM DETAILS (stone details per item)
-- ============================================================
CREATE TABLE item_gem_details (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_item_id      UUID NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
  gem_type             TEXT,              -- 'Diamond', 'Ruby', 'Sapphire', 'Emerald', ...
  quality              TEXT,              -- Phẩm chất/Độ sạch: 'VVS1','VS1','SI1','LG','F','VF',...
                                         -- LG = Lab Grown. Bắt buộc theo [THAM KHẢO] §3 col "P.chất"
  shape                TEXT,              -- 'Round', 'Oval', 'Princess', 'Cushion', ...
  size_mm              TEXT,              -- e.g. '1.5mm', '3x4mm'
  qty_pcs              INTEGER DEFAULT 1,
  weight_ct_before     NUMERIC(8,4),      -- carat trước xử lý
  weight_ct_after      NUMERIC(8,4),      -- carat sau xử lý — dùng để tính GENERATED cols
  unit_price_per_ct    NUMERIC(10,2),     -- USD/carat
  setting_type         TEXT,              -- 'Prong', 'Bezel', 'Pave', 'Channel', ...
  setting_fee_per_pcs  NUMERIC(10,2),     -- USD/viên setting
  sort_order           INTEGER DEFAULT 0, -- display order within item

  -- GENERATED ALWAYS AS (STORED) — NEVER compute these in TypeScript:
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

-- Migration cho DB đã tồn tại:
-- ALTER TABLE item_gem_details ADD COLUMN quality TEXT;


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
  action       TEXT NOT NULL,        -- 'status_change' | 'field_update' | 'item_add' | etc.
  from_status  invoice_status,
  to_status    invoice_status,
  changed_by   UUID NOT NULL REFERENCES app_users(id),
  note         TEXT,
  metadata     JSONB,                -- additional context (field names, old/new values)
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

    -- Create snapshot in invoice_snapshots
    INSERT INTO invoice_snapshots (invoice_id, snapshot_data, metal_rates, pricing_rules)
    VALUES (
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
      (SELECT row_to_json(pr)  FROM pricing_rules pr WHERE pr.id = NEW.pricing_rule_id)
    );

    -- Also store snapshot inline on header for quick reads
    NEW.snapshot_data = (SELECT snapshot_data FROM invoice_snapshots WHERE invoice_id = NEW.id);

    -- Lock invoice — ONLY set here, never by application code
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

**CRITICAL RULES:**
- `snapshot_data` and `is_locked = true` are ONLY written by this trigger
- Application code MUST NEVER set `is_locked = true` or write `snapshot_data`
- When reading an invoiced invoice, use `snapshot_data` from `invoice_snapshots` (or the inline `invoice_headers.snapshot_data`)

---

## 3. RPC FUNCTIONS

```sql
-- Used by Invoice List page:
CREATE OR REPLACE FUNCTION get_invoice_list(
  p_search   TEXT DEFAULT NULL,
  p_status   TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to   DATE DEFAULT NULL,
  p_rate_id   UUID DEFAULT NULL,
  p_limit     INT DEFAULT 20,
  p_offset    INT DEFAULT 0
)
RETURNS TABLE (
  id            UUID,
  invoice_no    TEXT,
  po_number     TEXT,
  customer_name TEXT,
  invoice_date  DATE,
  status        invoice_status,
  is_locked     BOOLEAN,
  item_count    BIGINT,
  total_hpusa   NUMERIC,
  total_cif     NUMERIC,
  created_at    TIMESTAMPTZ
) ...;

-- Count (for pagination):
CREATE OR REPLACE FUNCTION count_invoices(
  p_search    TEXT DEFAULT NULL,
  p_status    TEXT DEFAULT NULL,
  p_date_from DATE DEFAULT NULL,
  p_date_to   DATE DEFAULT NULL,
  p_rate_id   UUID DEFAULT NULL
) RETURNS BIGINT ...;

-- Dashboard stats:
CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS JSON AS $$
  SELECT json_build_object(
    'total_invoices',   COUNT(*),
    'draft_count',      COUNT(*) FILTER (WHERE status = 'draft'),
    'pending_count',    COUNT(*) FILTER (WHERE status = 'pending_approval'),
    'approved_count',   COUNT(*) FILTER (WHERE status = 'approved'),
    'invoiced_count',   COUNT(*) FILTER (WHERE status = 'invoiced'),
    'total_hpusa',      SUM(ii.hpusa),
    'total_cif',        SUM(ii.cif_price)
  )
  FROM invoice_headers ih
  LEFT JOIN invoice_items ii ON ii.invoice_id = ih.id
  ...
$$ LANGUAGE sql SECURITY DEFINER;
```

---

## 4. ROW LEVEL SECURITY (RLS)

```sql
-- Enable RLS
ALTER TABLE invoice_headers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items    ENABLE ROW LEVEL SECURITY;
ALTER TABLE item_gem_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_users        ENABLE ROW LEVEL SECURITY;

-- API routes use SUPABASE_SERVICE_ROLE_KEY → bypass all RLS
-- Client-side queries use anon key → restricted by policies

-- Basic policies (service role always bypasses):
CREATE POLICY "Authenticated users can read invoices" ON invoice_headers
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Users can read own profile" ON app_users
  FOR SELECT USING (auth.uid() = auth_id);
```

---

## 5. SUPABASE REALTIME

> **Nguồn:** [THAM KHẢO] DEV GUIDELINES — "Khi user chỉnh sửa số lượng đá tấm ở bảng Detail, các hàm tính toán Sub-total → HPUSA → HP for CIF price phải lập tức thay đổi trên màn hình **mà không cần Reload lại trang**."

### 5a. LOCAL STATE UPDATE — Sync đơn giản (Priority 1)

**Cách đạt "lập tức thay đổi" mà không cần Supabase Realtime:**

Sau khi PATCH item hoặc gem:
- API trả về item đã recalculated (bao gồm hpusa, cif_price, tag_price, fr_price)
- Cập nhật CHỈ item đó trong local state — KHÔNG gọi `onRefresh()` (full re-fetch)
- JM Form View và Detail View cùng đọc từ `data.items` state → cả 2 views update ngay

```typescript
// Pattern trong invoices/[id]/page.tsx:
const [data, setData] = useState<{ header: any; items: any[] } | null>(null)

// Sau khi PATCH item → update local state thay vì onRefresh():
function updateItemInState(itemId: string, updatedFields: Record<string, any>) {
  setData(prev => {
    if (!prev) return prev
    return {
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId
          ? { ...item, ...updatedFields }
          : item
      ),
    }
  })
}

// Sau khi PATCH gem → cần re-fetch item đó (vì computed cols thay đổi):
async function refreshItem(itemId: string) {
  const res  = await fetch(`/api/invoices/${invoiceId}/items/${itemId}`)
  const json = await res.json()
  if (json.success) updateItemInState(itemId, json.data)
}
```

**Flow khi edit gem:**
```
User edits gem → PATCH /gems/[gemId]
  → Server recalculates: weight_gr, total_price, total_setting_fee, weight_no_gem_gr, hpusa, cif_price
  → API returns updated item + gems
  → updateItemInState(itemId, { hpusa, cif_price, weight_no_gem_gr, item_gem_details: [...] })
  → JM Form: CIF cell re-renders → user sees new CIF instantly
  → Detail View: HPUSA breakdown re-renders → user sees new HPUSA instantly
  ✓ "lập tức thay đổi mà không cần Reload"
```

### 5b. SUPABASE REALTIME — Multi-user collaboration (Priority 2)

Khi cần sync giữa nhiều user đang xem cùng 1 invoice:

```sql
-- Enable trong Supabase Dashboard → Database → Replication → Tables:
-- invoice_items      ← line item changes
-- item_gem_details   ← gem changes
```

```typescript
// hooks/useInvoiceRealtime.ts
import { createClient } from '@/lib/supabase/client'

export function useInvoiceRealtime(
  invoiceId: string,
  onItemChange: (itemId: string) => void,
) {
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`invoice:${invoiceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'invoice_items',
        filter: `invoice_id=eq.${invoiceId}`,
      }, (payload) => {
        // Khi item thay đổi (bởi user khác):
        const itemId = payload.new?.id ?? payload.old?.id
        if (itemId) onItemChange(itemId)
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'item_gem_details',
      }, (payload) => {
        // Khi gem thay đổi → refresh item cha:
        const itemId = payload.new?.invoice_item_id ?? payload.old?.invoice_item_id
        if (itemId) onItemChange(itemId)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [invoiceId])
}

// Dùng trong invoices/[id]/page.tsx (chỉ khi status = 'draft'):
useInvoiceRealtime(id, (itemId) => refreshItem(itemId))
```

### 5c. THỨ TỰ TRIỂN KHAI

```
Phase 1 (bắt buộc):
  → updateItemInState() trong page.tsx
  → JMFormView + DetailView dùng updateItemInState callback thay vì onRefresh()
  → Đáp ứng "lập tức thay đổi" yêu cầu

Phase 2 (nice-to-have):
  → useInvoiceRealtime hook
  → Enable Realtime trên Supabase Dashboard
  → Chỉ cần khi nhiều user cùng edit invoice
```

---

## 6. KEY RELATIONSHIPS

```
app_users (id)
    ↑ FK (created_by)
invoice_headers (id)
    ↑ FK (metal_rate_id)    daily_metal_rates (id)
    ↑ FK (pricing_rule_id)  pricing_rules (id)
    │
    ↓ FK (invoice_id)
invoice_items (id)
    ↑ FK (bom_product_id)   bom_products (id)
    │
    ↓ FK (invoice_item_id)
item_gem_details (id) — GENERATED: weight_gr, total_price, total_setting_fee

invoice_headers (id) → trigger trg_snapshot_invoice → invoice_snapshots + is_locked
audit_logs.invoice_id → invoice_headers.id
audit_logs.changed_by → app_users.id
```

---

## 7. NUMERIC PRECISION

| Field type | PostgreSQL | Notes |
|------------|-----------|-------|
| USD prices | `NUMERIC(10,2)` | 2 decimal places |
| Weights (gram) | `NUMERIC(8,4)` | 4 decimal places |
| Weights (carat) | `NUMERIC(8,4)` | 4 decimal places |
| Multipliers | `NUMERIC(6,4)` | e.g. 1.1000 |
| Loss % | `NUMERIC(5,2)` | e.g. 5.00 |
| Rates USD/gram | `NUMERIC(12,4)` | 4 decimal places |
| Discount % | `NUMERIC(5,2)` | e.g. 10.00 |

---

## 8. INDEXES SUMMARY

```sql
-- Performance critical indexes:
CREATE INDEX ON app_users(auth_id);                          -- session lookup
CREATE INDEX ON app_users(email);                            -- login lookup
CREATE INDEX ON bom_products(sku_jwmold);                   -- import validation
CREATE INDEX ON bom_products(is_active);                    -- catalog filter
CREATE INDEX ON daily_metal_rates(rate_date DESC);           -- rate lookup
CREATE INDEX ON daily_metal_rates(is_active);               -- active rate filter
CREATE INDEX ON invoice_headers(status);                     -- status filter
CREATE INDEX ON invoice_headers(created_by);                 -- user filter
CREATE INDEX ON invoice_headers(created_at DESC);            -- pagination
CREATE INDEX ON invoice_headers(invoice_date DESC);          -- date filter
CREATE INDEX ON invoice_headers(metal_rate_id);              -- rate ref
CREATE INDEX ON invoice_headers(pricing_rule_id);            -- rule ref
CREATE INDEX ON invoice_items(invoice_id);                  -- cascade reads
CREATE INDEX ON invoice_items(sku_jwmold);                  -- SKU lookup
CREATE INDEX ON item_gem_details(invoice_item_id);          -- gem reads
CREATE INDEX ON audit_logs(invoice_id);                     -- timeline
CREATE INDEX ON audit_logs(created_at DESC);                -- timeline order
```

---

## 9. SUPABASE CONFIG CHECKLIST

```
[ ] Create app_users table + seed at least 1 admin user
[ ] Enable Realtime for: invoice_items, item_gem_details
[ ] Service Role key: SUPABASE_SERVICE_ROLE_KEY (server-only, never public)
[ ] Anon key: NEXT_PUBLIC_SUPABASE_ANON_KEY (client-side)
[ ] Enable RLS on all tables
[ ] Apply trigger: trg_snapshot_invoice
[ ] Create RPC functions: get_invoice_list, count_invoices, get_dashboard_stats
[ ] Seed: at least 1 pricing_rule (is_active = true)
[ ] Seed: daily_metal_rates for today (for testing)
[ ] Seed: at least 1 bom_product with is_active = true (for import testing)
[ ] Verify GENERATED columns: invoice_headers.invoice_no, item_gem_details.weight_gr/total_price/total_setting_fee
```
