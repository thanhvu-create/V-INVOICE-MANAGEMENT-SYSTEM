# Database Reference — V-Invoice
> **Quick-lookup for all tables, columns, relationships, and constraints**
> **Engine:** Supabase PostgreSQL · RLS disabled (API Routes bypass via service role)

---

## 1. TABLE MAP

```
bom_products          ← Master catalog of SKUs (read-only in invoices)
daily_metal_rates     ← Gold/platinum/silver rates per day
pricing_rules         ← CIF/Tag/FR multipliers + casting loss

invoice_headers       ← One row per invoice (metadata + status + snapshot)
  └─ invoice_items    ← One row per SKU line (costs + pricing)
       └─ item_gem_details  ← One row per gem entry (GENERATED cols)

invoice_snapshots     ← JSONB snapshot when status → 'invoiced'
audit_logs            ← Every status transition history
```

---

## 2. `bom_products` — SKU Catalog

```sql
CREATE TABLE bom_products (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku_jwmold    TEXT UNIQUE NOT NULL,
  description   TEXT,
  class         TEXT,
  sub_class     TEXT,
  metal_type    TEXT,
  labor_fee     NUMERIC DEFAULT 0,
  casting_fee   NUMERIC DEFAULT 0,
  design_fee    NUMERIC DEFAULT 0,
  resin_fee     NUMERIC DEFAULT 0,
  misc_fee      NUMERIC DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON bom_products(sku_jwmold);
```

**Lookup:** `SELECT * FROM bom_products WHERE sku_jwmold = ?` — used during import + SKU autocomplete  
**Fees copied** to `invoice_items` at import time; user can override after

---

## 3. `daily_metal_rates` — Metal Prices

```sql
CREATE TABLE daily_metal_rates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_date   DATE UNIQUE NOT NULL,
  gold_24k    NUMERIC,   -- USD/gram
  gold_18kw   NUMERIC,
  gold_18ky   NUMERIC,
  gold_14ky   NUMERIC,
  platinum    NUMERIC,
  silver      NUMERIC,
  palladium   NUMERIC,
  created_at  TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON daily_metal_rates(rate_date DESC);
```

**Delete guard:** Cannot delete if `invoice_headers.metal_rate_id` references this row  
**Lookup formula:**
```typescript
const rateMap = { '18KW': row.gold_18kw, '18KY': row.gold_18ky, '14KY': row.gold_14ky,
  'PT950': row.platinum, 'PT': row.platinum, '24K': row.gold_24k,
  'AG': row.silver, 'PD': row.palladium }
const rate = rateMap[metalType] ?? row.gold_24k ?? 0
```

---

## 4. `pricing_rules` — Multipliers

```sql
CREATE TABLE pricing_rules (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name             TEXT NOT NULL,
  cif_multiplier   NUMERIC NOT NULL DEFAULT 1.0,   -- A: hpusa × A = cif
  tag_multiplier   NUMERIC NOT NULL DEFAULT 1.0,   -- B: cif × B = tag
  fr_multiplier    NUMERIC NOT NULL DEFAULT 1.0,   -- C: cif × C = fr
  casting_loss_pct NUMERIC NOT NULL DEFAULT 5.0,   -- % added to gold cost
  is_active        BOOLEAN DEFAULT false,
  created_at       TIMESTAMPTZ DEFAULT now()
);
```

**Active rule:** Only one `is_active = true` at a time  
**Default on new invoice:** `SELECT * WHERE is_active = true ORDER BY created_at DESC LIMIT 1`

---

## 5. `invoice_headers` — Invoice Master Record

```sql
CREATE TABLE invoice_headers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  po_number        TEXT UNIQUE NOT NULL,
  mr_number        TEXT,
  status           TEXT NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft','pending_approval','approved','invoiced')),
  is_locked        BOOLEAN DEFAULT false,
  metal_rate_id    UUID REFERENCES daily_metal_rates(id),
  pricing_rule_id  UUID REFERENCES pricing_rules(id),
  store            TEXT,
  notes            TEXT,
  created_by       TEXT NOT NULL,
  created_at       TIMESTAMPTZ DEFAULT now(),
  updated_at       TIMESTAMPTZ DEFAULT now(),
  snapshot_at      TIMESTAMPTZ,
  snapshot_data    JSONB       -- populated by PostgreSQL trigger on → 'invoiced'
);
CREATE INDEX ON invoice_headers(status);
CREATE INDEX ON invoice_headers(created_by);
CREATE INDEX ON invoice_headers(created_at DESC);
```

**Key rules:**
- `is_locked = true` → 403 on ANY write attempt to this invoice
- `snapshot_data` → written by PostgreSQL trigger, never by application code
- `status` transitions validated by `ALLOWED_TRANSITIONS` map (server-side)

---

## 6. `invoice_items` — Line Items

```sql
CREATE TABLE invoice_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id           UUID NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  line_no              INTEGER NOT NULL,
  sku_jwmold           TEXT NOT NULL,
  qty_pcs              INTEGER DEFAULT 1,
  store                TEXT,
  location_store       TEXT,
  so_mo_code           TEXT,
  vendor_model         TEXT,
  description          TEXT,
  class                TEXT,
  sub_class            TEXT,
  notes                TEXT,
  -- Weight fields
  weight_total_gr      NUMERIC,
  weight_gold_actual_gr NUMERIC,
  weight_no_gem_gr     NUMERIC,
  metal_type           TEXT,
  -- Cost fields
  gold_value_usd       NUMERIC DEFAULT 0,
  labor_fee            NUMERIC DEFAULT 0,
  casting_fee          NUMERIC DEFAULT 0,
  design_fee           NUMERIC DEFAULT 0,
  resin_fee            NUMERIC DEFAULT 0,
  misc_fee             NUMERIC DEFAULT 0,
  -- Pricing (computed + stored)
  hpusa                NUMERIC DEFAULT 0,
  cif_price            NUMERIC DEFAULT 0,
  tag_price            NUMERIC DEFAULT 0,
  fr_price             NUMERIC DEFAULT 0,
  created_at           TIMESTAMPTZ DEFAULT now(),
  updated_at           TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON invoice_items(invoice_id);
CREATE INDEX ON invoice_items(invoice_id, line_no);
```

**Recalculate chain** (runs server-side after any field change):
1. `weight_no_gem_gr = weight_total_gr - Σ(gem.weight_gr)` [where `gem.weight_gr` is GENERATED]
2. `gold_value_usd = weight_gold_actual_gr × rate × (1 + casting_loss_pct/100)`
3. `hpusa = gold_value_usd + Σgem.total_price + Σgem.total_setting_fee + fees`
4. `cif_price = hpusa × A`
5. `tag_price = cif_price × B`
6. `fr_price = cif_price × C`

---

## 7. `item_gem_details` — Gem Rows (GENERATED ALWAYS AS)

```sql
CREATE TABLE item_gem_details (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_item_id   UUID NOT NULL REFERENCES invoice_items(id) ON DELETE CASCADE,
  gem_type          TEXT,
  qty_pcs           INTEGER DEFAULT 0,
  weight_ct_before  NUMERIC,
  weight_ct_after   NUMERIC,
  unit_price_per_ct NUMERIC DEFAULT 0,
  setting_fee_per_pcs NUMERIC DEFAULT 0,
  -- GENERATED ALWAYS AS columns — READ ONLY from app code:
  weight_gr         NUMERIC GENERATED ALWAYS AS (weight_ct_after * 0.2) STORED,
  total_price       NUMERIC GENERATED ALWAYS AS (weight_ct_after * unit_price_per_ct) STORED,
  total_setting_fee NUMERIC GENERATED ALWAYS AS (qty_pcs * setting_fee_per_pcs) STORED
);
CREATE INDEX ON item_gem_details(invoice_item_id);
```

**⚠️ CRITICAL — GENERATED columns:**
```typescript
// NEVER compute these in TypeScript:
// weight_gr         = weight_ct_after × 0.2    ← PostgreSQL handles this
// total_price       = weight_ct_after × unit_price_per_ct  ← PostgreSQL handles this
// total_setting_fee = qty_pcs × setting_fee_per_pcs        ← PostgreSQL handles this

// CORRECT — read directly from DB response:
const totalGemValue   = gems.reduce((s, g) => s + (g.total_price ?? 0), 0)
const totalSettingFee = gems.reduce((s, g) => s + (g.total_setting_fee ?? 0), 0)
const totalGemGr      = gems.reduce((s, g) => s + (g.weight_gr ?? 0), 0)
```

---

## 8. `invoice_snapshots` — Frozen Snapshots

```sql
CREATE TABLE invoice_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoice_headers(id),
  snapshot_at  TIMESTAMPTZ DEFAULT now(),
  data         JSONB NOT NULL  -- full header + items + gems + rates + rules
);
```

**Written by:** PostgreSQL trigger only (never by application code)

---

## 9. `audit_logs` — Status History

```sql
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id   UUID NOT NULL REFERENCES invoice_headers(id) ON DELETE CASCADE,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  changed_by   TEXT NOT NULL,
  note         TEXT,
  changed_at   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX ON audit_logs(invoice_id);
CREATE INDEX ON audit_logs(changed_at DESC);
```

**Insert pattern** (after every status change):
```typescript
await db.from('audit_logs').insert({
  invoice_id, from_status: currentStatus, to_status: newStatus,
  changed_by: userId, note: reason || null
})
```

---

## 10. POSTGRESQL TRIGGER — Snapshot on Invoiced

```sql
CREATE OR REPLACE FUNCTION snapshot_invoice_on_invoiced()
RETURNS TRIGGER AS $$
DECLARE
  v_items  JSONB;
  v_gems   JSONB;
  v_rate   JSONB;
  v_rule   JSONB;
BEGIN
  IF NEW.status = 'invoiced' AND OLD.status != 'invoiced' THEN

    SELECT json_agg(i.*) INTO v_items
    FROM invoice_items i WHERE i.invoice_id = NEW.id;

    SELECT json_agg(g.*)  INTO v_gems
    FROM item_gem_details g
    JOIN invoice_items i ON g.invoice_item_id = i.id
    WHERE i.invoice_id = NEW.id;

    SELECT row_to_json(r.*) INTO v_rate
    FROM daily_metal_rates r WHERE r.id = NEW.metal_rate_id;

    SELECT row_to_json(p.*) INTO v_rule
    FROM pricing_rules p WHERE p.id = NEW.pricing_rule_id;

    NEW.snapshot_data := jsonb_build_object(
      'header', row_to_json(NEW.*),
      'items',  v_items,
      'gems',   v_gems,
      'rate',   v_rate,
      'rule',   v_rule,
      'snapshot_at', now()
    );
    NEW.snapshot_at  := now();
    NEW.is_locked    := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_snapshot_invoice
BEFORE UPDATE ON invoice_headers
FOR EACH ROW EXECUTE FUNCTION snapshot_invoice_on_invoiced();
```

---

## 11. STATUS TRANSITIONS (ALLOWED_TRANSITIONS)

```typescript
const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  user: {
    draft: ['pending_approval'],
  },
  manager: {
    pending_approval: ['approved', 'draft'],
  },
  admin: {
    draft:            ['pending_approval'],
    pending_approval: ['approved', 'draft'],
    approved:         ['invoiced', 'pending_approval'],
  },
}

function canTransition(role: string, from: string, to: string): boolean {
  return ALLOWED_TRANSITIONS[role]?.[from]?.includes(to) ?? false
}
```

---

## 12. QUICK QUERY PATTERNS

```typescript
// Load invoice with items and gems:
const { data: header } = await db.from('invoice_headers').select('*').eq('id', invoiceId).single()
const { data: items  } = await db.from('invoice_items').select('*').eq('invoice_id', invoiceId).order('line_no')
const { data: gems   } = await db.from('item_gem_details').select('*')
  .in('invoice_item_id', items.map(i => i.id))

// Guard locked invoice:
if (header.is_locked) return 403

// Check metal rate references before delete:
const { count } = await db.from('invoice_headers')
  .select('*', { count: 'exact', head: true }).eq('metal_rate_id', rateId)
if (count > 0) return 409

// Fetch active pricing rule:
const { data: rule } = await db.from('pricing_rules')
  .select('*').eq('is_active', true).order('created_at', { ascending: false }).limit(1).single()

// Fetch today's or latest metal rate:
const today = new Date().toISOString().slice(0, 10)
const { data: todayRate } = await db.from('daily_metal_rates')
  .select('*').eq('rate_date', today).maybeSingle()
const { data: latestRate } = await db.from('daily_metal_rates')
  .select('*').order('rate_date', { ascending: false }).limit(1).single()
const defaultRate = todayRate ?? latestRate

// Validate SKUs (batch):
const { data: products } = await db.from('bom_products')
  .select('sku_jwmold').in('sku_jwmold', skuList)
const validSkus = new Set(products.map(p => p.sku_jwmold))
```

---

## 13. COLUMN DISPLAY FORMATS

```typescript
const formatUSD    = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(v)
const formatWeight = (v: number) => v.toFixed(4)   // 4 decimal places
const formatRate   = (v: number | null) => v ? `$${v.toFixed(4)}` : '—'
const formatDate   = (d: string) => d.slice(0, 10) // YYYY-MM-DD
```
