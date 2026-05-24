'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'

const JM_COLS = [
  { key: 'line_no',               label: 'No.',            mono: true  },
  { key: 'sku_jwmold',             label: 'SKU JWMold',     sku: true   },
  { key: 'qty_pcs',                label: 'Qty',            mono: true  },
  { key: 'description',            label: 'Description'                 },
  { key: 'class',                  label: 'Class'                       },
  { key: 'sub_class',              label: 'Sub Class'                   },
  { key: 'metal_type',             label: 'Metal'                       },
  { key: 'weight_total_gr',        label: 'Total Wt (g)',   mono: true  },
  { key: 'weight_gold_actual_gr',  label: 'Gold Wt (g)',    mono: true  },
  { key: 'weight_no_gem_gr',       label: 'No-Gem Wt (g)', mono: true  },
  { key: 'gold_value_usd',         label: 'Gold Value',     mono: true, price: true },
  { key: 'hpusa',                  label: 'HPUSA',          mono: true, price: true },
  { key: 'cif_price',              label: 'CIF',            mono: true, price: true },
  { key: 'tag_price',              label: 'Tag',            mono: true, price: true, admin: true },
  { key: 'fr_price',               label: 'FR',             mono: true, price: true, admin: true },
]

function fmt2(n: any) { return n != null ? `$${Number(n).toFixed(2)}` : '' }
function fmt4(n: any) { return n != null ? Number(n).toFixed(4) : '' }

export default function PrintPage() {
  const { id }     = useParams<{ id: string }>()
  const { canDo }  = useUser()
  const [data, setData] = useState<{ header: any; items: any[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const canSeePrice = canDo('see_prices')
  const visibleCols = JM_COLS.filter(c => !c.admin || canSeePrice)

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data) })
      .finally(() => setLoading(false))
  }, [id])

  // Auto-print once data is loaded
  useEffect(() => {
    if (!loading && data) {
      const t = setTimeout(() => window.print(), 300)
      return () => clearTimeout(t)
    }
  }, [loading, data])

  if (loading) return (
    <div style={{ padding: '2rem', fontFamily: 'Jost, Arial, sans-serif', color: '#666' }}>
      Preparing print view…
    </div>
  )
  if (!data) return null

  const { header, items } = data

  return (
    <div style={{ fontFamily: 'Jost, Arial, sans-serif', fontSize: '9pt', color: '#000', background: '#fff', padding: '10mm' }}>

      {/* Header block */}
      <div style={{ marginBottom: '8pt', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '16pt', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: '4pt' }}>
            HP Jewelry — Invoice
          </div>
          <div style={{ fontSize: '9pt', color: '#444', lineHeight: 1.6 }}>
            <strong>PO:</strong> {header.po_number}
            {header.mr_number && <span style={{ marginLeft: 16 }}><strong>MR:</strong> {header.mr_number}</span>}
            {header.store     && <span style={{ marginLeft: 16 }}><strong>Store:</strong> {header.store}</span>}
          </div>
          <div style={{ fontSize: '8pt', color: '#666' }}>
            <strong>Status:</strong> {header.status.replace('_', ' ').toUpperCase()}
            <span style={{ marginLeft: 16 }}><strong>Rate date:</strong> {header.daily_metal_rates?.rate_date ?? '—'}</span>
            <span style={{ marginLeft: 16 }}><strong>Rule:</strong> {header.pricing_rules?.name ?? '—'}</span>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '8pt', color: '#666' }}>
          <div>Printed: {new Date().toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })}</div>
          <div>Created by: {header.created_by}</div>
          {header.is_locked && <div style={{ marginTop: 4, fontWeight: 600 }}>🔒 LOCKED / INVOICED</div>}
        </div>
      </div>

      <hr style={{ borderTop: '1.5pt solid #1A1814', marginBottom: '6pt' }} />

      {/* JM table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
        <thead>
          <tr>
            {visibleCols.map(c => (
              <th key={c.key} style={{
                padding: '3pt 4pt', textAlign: c.mono && c.key !== 'line_no' ? 'right' : 'left',
                fontFamily: 'Jost, Arial, sans-serif', fontWeight: 600, fontSize: '7.5pt',
                letterSpacing: '0.05em', textTransform: 'uppercase', color: '#444',
                borderBottom: '1pt solid #1A1814', borderTop: '1pt solid #1A1814',
                background: '#F0EBE4',
                whiteSpace: 'nowrap',
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item, idx) => (
            <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAF7' }}>
              {visibleCols.map(c => {
                const val = item[c.key]
                const isSku = c.sku
                return (
                  <td key={c.key} style={{
                    padding: '2.5pt 4pt',
                    borderBottom: '0.5pt solid #DDD8CF',
                    fontFamily: c.mono ? 'JetBrains Mono, Courier New, monospace' : 'Jost, Arial, sans-serif',
                    fontSize: '8pt',
                    textAlign: c.mono && c.key !== 'line_no' ? 'right' : 'left',
                    background: isSku ? '#FEF3C7' : undefined,
                    WebkitPrintColorAdjust: 'exact',
                  } as React.CSSProperties}>
                    {c.price ? fmt2(val) : c.key.includes('_gr') ? fmt4(val) : (val ?? '')}
                  </td>
                )
              })}
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={visibleCols.length} style={{ padding: '8pt 4pt', textAlign: 'center', color: '#999', fontSize: '8pt' }}>
                No items
              </td>
            </tr>
          )}
        </tbody>
        {/* Totals row */}
        {canSeePrice && items.length > 0 && (
          <tfoot>
            <tr style={{ background: '#F0EBE4' }}>
              {visibleCols.map(c => {
                const sumFields = ['gold_value_usd', 'hpusa', 'cif_price', 'tag_price', 'fr_price']
                const isSum = sumFields.includes(c.key)
                const total = isSum ? items.reduce((s, it) => s + (Number(it[c.key]) || 0), 0) : null
                return (
                  <td key={c.key} style={{
                    padding: '3pt 4pt', fontWeight: 600, fontSize: '8pt',
                    borderTop: '1pt solid #1A1814',
                    textAlign: c.mono && c.key !== 'line_no' ? 'right' : 'left',
                    fontFamily: c.mono ? 'JetBrains Mono, Courier New, monospace' : 'inherit',
                  }}>
                    {c.key === 'description' ? 'TOTAL' : isSum ? fmt2(total) : ''}
                  </td>
                )
              })}
            </tr>
          </tfoot>
        )}
      </table>

      {/* Notes */}
      {header.notes && (
        <div style={{ marginTop: '8pt', fontSize: '8pt', color: '#444' }}>
          <strong>Notes:</strong> {header.notes}
        </div>
      )}

      {/* Print button — hidden when printing */}
      <div className="no-print" style={{ marginTop: '16pt', display: 'flex', gap: 8 }}>
        <button onClick={() => window.print()} style={{ padding: '6px 16px', background: '#1A1814', color: '#FAFAF7', border: 'none', fontFamily: 'Jost, sans-serif', fontSize: '12px', cursor: 'pointer' }}>
          Print / Save PDF
        </button>
        <button onClick={() => window.close()} style={{ padding: '6px 16px', background: 'transparent', border: '1px solid #C8C3BB', fontFamily: 'Jost, sans-serif', fontSize: '12px', cursor: 'pointer' }}>
          Close
        </button>
      </div>
    </div>
  )
}
