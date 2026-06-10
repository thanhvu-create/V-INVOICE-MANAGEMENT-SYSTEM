export type InvoiceStatus   = 'draft' | 'finalized'
export type InvoiceTemplate = 'CH1' | 'CH2' | 'ADM' | 'CH1_AG3' | 'VNSI_AG3' | 'MANUAL'
export type Role     = 'admin' | 'manager' | 'user' | 'viewer'

// ── Invoice ─────────────────────────────────────────────────────────────────

export interface Invoice {
  id:            string
  invoice_code:  string          // V-INV code e.g. "P60501"
  template_type: InvoiceTemplate
  status:        InvoiceStatus
  channel:       string | null   // "CH1-Khách", "ADM", ...
  // NVL Snapshot — frozen after finalized
  nvl_gold_24k:       number | null
  nvl_pt_price:       number | null
  nvl_ag_price:       number | null
  nvl_pd_price:       number | null
  nvl_loss_gold:      number | null
  nvl_loss_pt:        number | null
  nvl_cif_rate:       number | null
  nvl_tag_multiplier: number | null  // Tag price = CIF × this
  nvl_fr_multiplier:  number | null  // FB/FR price = CIF × this
  created_at:    string
  finalized_at:  string | null
  created_by:    string | null   // UUID → app_users.id
}

// Backward-compat alias for code that still uses InvoiceHeader
export type InvoiceHeader = Invoice

export interface InvoiceProduct {
  id:               string
  invoice_id:       string
  seq:              number
  // JM Form — common
  sku:              string | null
  vendor_model:     string | null
  so_mo:            string | null
  description:      string | null
  wt_gr:            number | null
  qt_pcs:           number | null
  store:            string | null
  location:         string | null
  class:            string | null
  sub_class:        string | null
  // AG3-only JM Form fields
  po_number:        string | null  // PO# (AG3 template — replaces SO-MO)
  sku_ag:           string | null  // SKU# AG (AG3 template)
  chi_tiet_tap:     string | null  // Chi tiết/Tập notes (AG3 template)
  // SUMMARY
  loai_vang:        string | null
  kich_thuoc:       string | null
  image_url:        string | null
  t_pham_co_nvl_da: number | null  // T.Phẩm có NVL đá (= wt_gr)
  gia_cong:         number | null  // CH1/CH2 only
  duc:              number | null
  thiet_ke:         number | null
  resin:            number | null
  phi_phu_kien:     number | null
  nini_adm:         string | null  // ghi chú / memo (CH1/CH2/ADM)
  bao_hiem:         number | null
  ngay_gui:         string | null
  tracking_no:      string | null
  hoa_don:          string | null
  // Calculated
  tien_vang:             number | null
  t_pham_tru_nvl_da:     number | null
  t_pham_vang_thuc_te:   number | null
  von_san_xuat:          number | null
  purchase_price:        number | null
  cif_price:             number | null
  tag_price:             number | null  // CIF × nvl_tag_multiplier (AG3)
  fb_price:              number | null  // CIF × nvl_fr_multiplier  (AG3)
  created_at:            string
  updated_at:            string
  invoice_diamonds?:     InvoiceDiamond[]
}

// Backward-compat alias
export type InvoiceItem = InvoiceProduct

export interface InvoiceDiamond {
  id:                string
  product_id:        string
  seq:               number
  ma_xoan:           string | null
  p_chat:            string        // always 'VVS1'
  size_xoan_range:   string | null  // lookup key → nvl_hot
  sl_hot:            number | null
  tl_truoc_xu_ly_ct: number | null  // manually entered
  tl_sau_xu_ly_ct:   number | null  // from tracking (TB viên)
  // Calculated (written by recalcDiamond)
  tl_xoan_gr:        number | null  // = tl_truoc / 5
  don_gia:           number | null  // from nvl_hot.mk_price
  t_gia_xoan:        number | null  // = tl_truoc × don_gia
  don_gia_phi:       number         // fixed $1
  t_phi:             number | null  // = sl_hot × 1
}

// Backward-compat alias
export type ItemGemDetail = InvoiceDiamond

// ── NVL Prices ───────────────────────────────────────────────────────────────

export interface NVLPrice {
  id:              number
  gold_24k:        number
  pt_price:        number
  ag_price:        number
  pd_price:        number
  loss_gold:       number
  loss_pt:         number
  tag_multiplier:  number | null
  fr_multiplier:   number | null
  updated_at:      string
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

// ── Import ───────────────────────────────────────────────────────────────────

export interface ImportRow {
  rowNum:      number
  store:       string
  location:    string
  sku:         string
  soMo:        string
  description: string
  qty:         number
  weightTotal: number
  loaiVang:    string
  class:       string
  subClass:    string
  niniAdm:     string
}

export interface ValidationError {
  row:     number
  sku:     string
  message: string
  warn?:   boolean
}

// ── Invoice list filters ─────────────────────────────────────────────────────

export interface InvoiceFilters {
  search:   string
  status:   string
  dateFrom: string
  dateTo:   string
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
