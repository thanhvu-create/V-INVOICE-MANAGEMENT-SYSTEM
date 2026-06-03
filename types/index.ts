export type InvoiceStatus = 'draft' | 'pending_approval' | 'approved' | 'invoiced'
export type Role = 'admin' | 'manager' | 'user' | 'viewer'
export type MetalType = '18KW' | '18KY' | '14KY' | 'PT950' | 'PT' | '24K' | 'AG' | 'PD'

// ── Invoice ─────────────────────────────────────────────────────────────────

export interface InvoiceHeader {
  id:                  string
  po_number:           string
  mr_number:           string | null
  customer_name:       string | null
  invoice_date:        string
  status:              InvoiceStatus
  is_locked:           boolean
  metal_rate_id:       string | null
  pricing_rule_id:     string | null
  store:               string | null
  notes:               string | null
  created_by:          string        // TEXT display name
  created_by_user_id:  string | null // UUID FK → app_users.id (for ownership checks)
  created_at:          string
  updated_at:          string
  snapshot_data:       Record<string, unknown> | null
  snapshot_at:         string | null
}

export interface InvoiceItem {
  id:                    string
  invoice_id:            string
  line_no:               number
  sku_jwmold:            string
  description:           string | null
  store:                 string | null
  location_store:        string | null
  so_mo_code:            string | null
  vendor_model:          string | null
  qty_pcs:               number
  weight_total_gr:       number
  weight_gold_actual_gr: number
  weight_no_gem_gr:      number | null
  metal_type:            string | null
  class:                 string | null
  sub_class:             string | null
  labor_fee:             number
  casting_fee:           number
  design_fee:            number
  resin_fee:             number
  misc_fee:              number
  gold_value_usd:        number | null
  hpusa:                 number | null
  cif_price:             number | null
  tag_price:             number | null
  fr_price:              number | null
  sell_price:            number | null
  discount_pct:          number | null
  after_discount_price:  number | null
  image_url:             string | null
  notes:                 string | null
  size:                  string | null
  customer_name:         string | null
  ship_date:             string | null
  tracking_no:           string | null
  vinvoice_no:           string | null
  item_gem_details?:     ItemGemDetail[]
}

export interface ItemGemDetail {
  id:                  string
  invoice_item_id:     string
  gem_type:            string | null
  quality:             string | null   // P.chất: VVS1, VS1, SI1, LG, F, VF…
  shape:               string | null
  size_mm:             string | null
  qty_pcs:             number
  weight_ct_before:    number | null
  weight_ct_after:     number
  unit_price_per_ct:   number
  setting_type:        string | null
  setting_fee_per_pcs: number
  sort_order:          number
  weight_gr:           number    // GENERATED ALWAYS = weight_ct_after × 0.2
  total_price:         number    // GENERATED ALWAYS = weight_ct_after × unit_price_per_ct
  total_setting_fee:   number    // GENERATED ALWAYS = qty_pcs × setting_fee_per_pcs
}

// ── Metal Rates ──────────────────────────────────────────────────────────────

export interface MetalRate {
  id:           string
  rate_date:    string
  gold_24k:     number
  gold_18kw:    number
  gold_18ky:    number
  gold_14ky:    number
  platinum:     number
  silver:       number
  palladium:    number
  is_active:    boolean
  created_by:   string
  created_at:   string
}

// ── Pricing Rule ─────────────────────────────────────────────────────────────

export interface PricingRule {
  id:              string
  name:            string
  cif_multiplier:  number
  tag_multiplier:  number
  fr_multiplier:   number
  casting_loss_pct: number
  is_active:       boolean
  created_by:      string
  created_at:      string
}

// ── Product ──────────────────────────────────────────────────────────────────

export interface BomProduct {
  id:          string
  sku_jwmold:  string
  description: string | null
  labor_fee:   number
  casting_fee: number
  design_fee:  number
  resin_fee:   number
  misc_fee:    number
  is_active:   boolean
  created_at:  string
  updated_at:  string
}

// ── User ─────────────────────────────────────────────────────────────────────

export interface AppUser {
  id:         string
  auth_id:    string | null
  email:      string
  full_name:  string
  role:       Role
  is_active:  boolean
  created_at: string
  updated_at: string
}

// ── Audit Log ────────────────────────────────────────────────────────────────

export interface AuditLogEntry {
  id:          string
  invoice_id:  string
  action:      string
  from_status: string | null
  to_status:   string | null
  note:        string | null
  metadata:    Record<string, unknown>
  created_at:  string
  app_users:   Pick<AppUser, 'id' | 'full_name' | 'email' | 'role'>
}

// ── Review / List ────────────────────────────────────────────────────────────

export interface InvoiceListRow {
  id:            string
  po_number:     string
  customer_name: string
  invoice_date:  string
  status:        InvoiceStatus
  is_locked:     boolean
  item_count:    number
  total_hpusa:   number | null
  total_cif:     number | null
  created_at:    string
}

export interface InvoiceFilters {
  search:   string
  status:   string
  dateFrom: string
  dateTo:   string
  rateId:   string
}

// ── Import ───────────────────────────────────────────────────────────────────

export interface ImportRow {
  rowNum:      number
  store:       string
  location:    string
  sku:         string
  soMo:        string
  vendorModel: string
  description: string
  qty:         number
  weightTotal: number
  weightGold:  number
  metalType:   string
  class:       string
  subClass:    string
  notes:       string
}

export interface ValidationError {
  row:     number
  sku:     string
  message: string
}

// ── API responses ─────────────────────────────────────────────────────────────

export interface ApiOk<T = unknown> {
  success: true
  data:    T
}

export interface ApiError {
  success: false
  message: string
}

export type ApiResponse<T = unknown> = ApiOk<T> | ApiError
