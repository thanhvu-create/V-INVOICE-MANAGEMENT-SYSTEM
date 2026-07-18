'use client'

import { Fragment } from 'react'

// Read-only, spreadsheet-style master-detail view of an invoice — mirrors the
// exported sheet's SUMMARY layout so it reads the same. Each item is a block:
// its cells span the item's gem rows (rowSpan), one gem per sub-row.

interface Col {
  key:    string
  label:  string
  mono?:  boolean
  price?: boolean
  bold?:  boolean
  dec?:   number   // fixed decimals for numeric (non-price) cells
  wide?:  boolean
  fee?:   boolean  // fabrication fee column — CH1/CH2 only
  hideCH2?: boolean
}

const MASTER: Col[] = [
  { key: 'seq',              label: 'No.',        mono: true },
  { key: 'sku',              label: 'SKU',        mono: true },
  { key: 'so_mo',            label: 'SO-MO',      mono: true },
  { key: 'description',      label: 'Description', wide: true },
  { key: 'loai_vang',        label: 'Loại vàng' },
  { key: 'qt_pcs',           label: 'Qty',        mono: true },
  { key: 't_pham_co_nvl_da', label: 'T.Phẩm (g)', mono: true, dec: 2 },
  { key: 'tien_vang',        label: 'Tiền vàng',  price: true },
  { key: 'gia_cong',         label: 'Gia công',   price: true, fee: true },
  { key: 'duc',              label: 'Đúc',        price: true, fee: true },
  { key: 'thiet_ke',         label: 'Thiết Kế',   price: true, fee: true },
  { key: 'resin',            label: 'Resin',      price: true, fee: true },
  { key: 'phi_phu_kien',     label: 'Phí PK',     price: true, fee: true },
  { key: 'von_san_xuat',     label: 'Vốn SX',     price: true, bold: true },
  { key: 'cif_price',        label: 'CIF',        price: true, hideCH2: true },
]

const GEM: Col[] = [
  { key: 'ma_xoan',           label: 'Mã Xoàn',      mono: true },
  { key: 'p_chat',            label: 'P.Chất' },
  { key: 'size_xoan_range',   label: 'Size Range' },
  { key: 'sl_hot',            label: 'SL',           mono: true },
  { key: 'tl_truoc_xu_ly_ct', label: 'TL Trước (ct)', mono: true, dec: 3 },
  { key: 'tl_sau_xu_ly_ct',   label: 'TL Sau (ct)',  mono: true, dec: 3 },
  { key: 'tl_xoan_gr',        label: 'TL Xoàn (gr)', mono: true, dec: 4 },
  { key: 'don_gia',           label: 'Đơn giá',      price: true },
  { key: 't_gia_xoan',        label: 'T.Giá Xoàn',   price: true, bold: true },
  { key: 't_phi',             label: 'T.Phí',        price: true },
]

const money = (v: any) => (v != null && v !== '') ? `$${Math.round(Number(v))}` : '—'
const dec   = (v: any, d: number) => (v != null && v !== '') ? Number(v).toFixed(d) : '—'

function cellText(col: Col, row: any): string {
  const v = row?.[col.key]
  if (col.price) return money(v)
  if (col.dec != null) return dec(v, col.dec)
  return v != null && v !== '' ? String(v) : '—'
}

interface Props {
  items:       any[]
  canSeePrice: boolean
  template?:   string
}

export function SheetView({ items, canSeePrice, template = 'CH1' }: Props) {
  const showFees    = template === 'CH1' || template === 'CH2'
  const hasGemCols  = template === 'CH1' || template === 'CH2' || template === 'ADM'

  const masterCols = MASTER.filter(c => {
    if (c.price && !canSeePrice)         return false
    if (c.fee && !showFees)              return false
    if (c.hideCH2 && template === 'CH2') return false
    return true
  })
  const gemCols = hasGemCols ? GEM.filter(c => !(c.price && !canSeePrice)) : []
  const allCols = [...masterCols, ...gemCols]

  if (items.length === 0) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', border: '1px dashed var(--border-base)' }}>
        No items yet. Use <strong>Import</strong> or <strong>Add Item</strong> to get started.
      </div>
    )
  }

  // Totals
  const sum = (f: (i: any) => number) => items.reduce((s, i) => s + (f(i) || 0), 0)
  const gemSum = (f: (g: any) => number) =>
    items.reduce((s, i) => s + (i.invoice_diamonds ?? []).reduce((gs: number, g: any) => gs + (f(g) || 0), 0), 0)

  const TOTALS: Record<string, string> = {
    qt_pcs:           String(sum(i => i.qt_pcs)),
    t_pham_co_nvl_da: dec(sum(i => i.t_pham_co_nvl_da ?? i.wt_gr), 2),
    tien_vang:        money(sum(i => i.tien_vang)),
    von_san_xuat:     money(sum(i => i.von_san_xuat)),
    cif_price:        money(sum(i => i.cif_price)),
    sl_hot:           String(gemSum(g => g.sl_hot)),
    t_gia_xoan:       money(gemSum(g => g.t_gia_xoan)),
    t_phi:            money(gemSum(g => g.t_phi)),
  }

  const th: React.CSSProperties = {
    padding: '6px 8px', background: 'var(--bg-base)',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600,
    letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text-secondary)',
    borderBottom: '2px solid var(--border-base)', borderRight: '1px solid var(--border-light)',
    whiteSpace: 'nowrap', textAlign: 'left', position: 'sticky', top: 0, zIndex: 10,
  }
  const tdBase: React.CSSProperties = {
    padding: '4px 8px', borderBottom: '1px solid var(--border-light)',
    borderRight: '1px solid var(--border-light)', fontSize: 'var(--text-sm)',
    verticalAlign: 'middle', whiteSpace: 'nowrap',
  }

  // sticky-left offsets for the first two columns (No, SKU)
  const stickyLeft = (idx: number): React.CSSProperties =>
    idx === 0 ? { position: 'sticky', left: 0,  zIndex: 5 } :
    idx === 1 ? { position: 'sticky', left: 46, zIndex: 5 } : {}

  const GEM_START = masterCols.length
  const descIdx   = masterCols.findIndex(c => c.key === 'description')

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', border: '1px solid var(--border-light)' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 900 }}>
        <thead>
          <tr>
            {allCols.map((c, i) => (
              <th key={c.key} style={{
                ...th,
                ...(i < 2 ? { ...stickyLeft(i), zIndex: 15, width: i === 0 ? 46 : 120 } : {}),
                minWidth: c.wide ? 200 : c.price ? 78 : undefined,
                textAlign: c.price || c.mono ? 'right' : 'left',
                background: i >= GEM_START ? 'rgba(233,29,121,0.06)' : c.price ? 'rgba(30,64,175,0.06)' : 'var(--bg-base)',
                borderLeft: i === GEM_START ? '2px solid var(--border-base)' : undefined,
                color: i >= GEM_START ? '#9d174d' : c.price ? '#1E40AF' : 'var(--text-secondary)',
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {items.map((item, idx) => {
            const gems = hasGemCols
              ? [...(item.invoice_diamonds ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
              : []
            const n = Math.max(gems.length, 1)
            const blockBg = idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-base)'

            return (
              <Fragment key={item.id}>
                {Array.from({ length: n }).map((_, gi) => {
                  const gem = gems[gi]
                  return (
                    <tr key={gi}>
                      {gi === 0 && masterCols.map((col, ci) => (
                        <td key={col.key} rowSpan={n} style={{
                          ...tdBase,
                          ...(ci < 2 ? stickyLeft(ci) : {}),
                          background: blockBg,
                          fontFamily: col.mono ? 'var(--font-mono)' : 'inherit',
                          textAlign: col.price || col.mono ? 'right' : 'left',
                          fontWeight: col.bold ? 700 : col.key === 'sku' ? 700 : 400,
                          color: col.price ? '#1E40AF' : col.key === 'sku' ? '#92400E' : col.key === 'seq' ? 'var(--text-muted)' : 'inherit',
                          maxWidth: col.wide ? 260 : undefined,
                          overflow: col.wide ? 'hidden' : undefined,
                          textOverflow: col.wide ? 'ellipsis' : undefined,
                        }}>
                          {cellText(col, item)}
                        </td>
                      ))}

                      {gemCols.map((col, gci) => (
                        <td key={col.key} style={{
                          ...tdBase,
                          background: blockBg,
                          borderLeft: gci === 0 ? '2px solid var(--border-base)' : undefined,
                          fontFamily: col.mono ? 'var(--font-mono)' : 'inherit',
                          textAlign: col.price || col.mono ? 'right' : 'left',
                          fontWeight: col.bold ? 700 : 400,
                          color: col.price && col.bold ? '#1E40AF' : col.price ? 'var(--text-secondary)' : 'inherit',
                        }}>
                          {gem ? cellText(col, gem) : ''}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </Fragment>
            )
          })}
        </tbody>

        <tfoot>
          <tr style={{ background: '#e91d79', color: '#FAFAF7', fontWeight: 600 }}>
            {allCols.map((col, i) => {
              const t = TOTALS[col.key]
              if (i === descIdx) {
                return <td key={col.key} style={{ ...tdBase, borderColor: 'rgba(255,255,255,0.25)', fontSize: 'var(--text-xs)', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>TOTAL ({items.length} items)</td>
              }
              return (
                <td key={col.key} style={{
                  ...tdBase, borderColor: 'rgba(255,255,255,0.25)',
                  fontFamily: 'var(--font-mono)', textAlign: col.price || col.mono ? 'right' : 'left',
                  fontWeight: (col.key === 'von_san_xuat' || col.key === 'cif_price') ? 800 : 600,
                  borderLeft: i === GEM_START ? '2px solid rgba(255,255,255,0.35)' : undefined,
                }}>
                  {t ?? ''}
                </td>
              )
            })}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
