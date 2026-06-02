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
  { key: 'notes',                  label: 'Notes',          notes: true },
  { key: 'weight_total_gr',        label: 'Total Wt (g)',   mono: true  },
  { key: 'weight_gold_actual_gr',  label: 'Gold Wt (g)',    mono: true  },
  { key: 'weight_no_gem_gr',       label: 'No-Gem Wt (g)', mono: true  },
  { key: 'gold_value_usd',         label: 'Gold Value',     mono: true, price: true, adminOnly: true },
  { key: 'hpusa',                  label: 'HPUSA',          mono: true, price: true, adminOnly: true },
  { key: 'cif_price',              label: 'CIF',            mono: true, price: true, adminOnly: true },
  { key: 'tag_price',              label: 'Tag',            mono: true, price: true, adminOnly: true },
]

function fmt2(n: any) { return n != null ? `$${Number(n).toFixed(2)}` : '' }
function fmt4(n: any) { return n != null ? Number(n).toFixed(4) : '' }

// Convert Google Drive share link → direct embeddable image URL.
// Input:  https://drive.google.com/file/d/FILE_ID/view?usp=sharing
// Output: https://drive.google.com/uc?export=view&id=FILE_ID
function resolveLogoUrl(url: string): string {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (match) return `https://drive.google.com/uc?export=view&id=${match[1]}`
  return url
}

const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL
  ? resolveLogoUrl(process.env.NEXT_PUBLIC_LOGO_URL)
  : null

export default function PrintPage() {
  const { id }     = useParams<{ id: string }>()
  const { canDo }  = useUser()
  const [data, setData] = useState<{ header: any; items: any[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const canSeePrice = canDo('see_prices')
  const visibleCols = JM_COLS.filter(c => !c.adminOnly || canSeePrice)

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

  // Totals
  const totQty   = items.reduce((s, i) => s + (i.qty_pcs ?? 0), 0)
  const totWt    = items.reduce((s, i) => s + (i.weight_total_gr ?? 0), 0)
  const totGold  = items.reduce((s, i) => s + (i.weight_gold_actual_gr ?? 0), 0)
  const totNoGem = items.reduce((s, i) => s + (i.weight_no_gem_gr ?? 0), 0)
  const totGoldV = items.reduce((s, i) => s + (i.gold_value_usd ?? 0), 0)
  const totHpusa = items.reduce((s, i) => s + (i.hpusa ?? 0), 0)
  const totCif   = items.reduce((s, i) => s + (i.cif_price ?? 0), 0)
  const totTag   = items.reduce((s, i) => s + (i.tag_price ?? 0), 0)
  // Total_Stone_Weight from actual gem data (GENERATED col)
  const totGemWt = items.reduce((s, i) =>
    s + (i.item_gem_details ?? []).reduce((gs: number, g: any) => gs + (g.weight_gr ?? 0), 0), 0
  )

  return (
    <div style={{ fontFamily: 'Jost, Arial, sans-serif', fontSize: '9pt', color: '#000', background: '#fff', padding: '10mm' }}>

      {/* ── Header ─────────────────────────────────────── */}
      <div style={{ marginBottom: '8pt', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10pt' }}>
          {/* Logo — from NEXT_PUBLIC_LOGO_URL env var (Google Drive or any URL) */}
          {LOGO_URL && (
            <img
              src={LOGO_URL}
              alt="HP Jewelry"
              style={{ height: '36pt', width: 'auto', objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          )}
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '16pt', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              HP Jewelry
            </div>
            <div style={{ fontSize: '8pt', color: '#888', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
              Invoice
            </div>
          </div>
        </div>

        <div style={{ textAlign: 'right', fontSize: '8pt', color: '#666', lineHeight: 1.6 }}>
          <div>Printed: {new Date().toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })}</div>
          <div>Created by: {header.created_by_name ?? header.created_by}</div>
          {header.is_locked && <div style={{ marginTop: '3pt', fontWeight: 700, color: '#1A1814' }}>🔒 LOCKED / INVOICED</div>}
        </div>
      </div>

      {/* Invoice meta */}
      <div style={{ fontSize: '9pt', color: '#222', lineHeight: 1.7, marginBottom: '3pt' }}>
        <strong>PO:</strong> {header.po_number}
        {header.mr_number && <span style={{ marginLeft: 16 }}><strong>MR:</strong> {header.mr_number}</span>}
        {header.store     && <span style={{ marginLeft: 16 }}><strong>Store:</strong> {header.store}</span>}
        {header.customer_name && <span style={{ marginLeft: 16 }}><strong>Customer:</strong> {header.customer_name}</span>}
      </div>
      <div style={{ fontSize: '8pt', color: '#555', marginBottom: '4pt' }}>
        <strong>Status:</strong> {header.status.replace(/_/g, ' ').toUpperCase()}
        <span style={{ marginLeft: 16 }}><strong>Rate date:</strong> {header.daily_metal_rates?.rate_date ?? '—'}</span>
        <span style={{ marginLeft: 16 }}><strong>Rule:</strong> {header.pricing_rules?.name ?? '—'}</span>
      </div>

      <hr style={{ borderTop: '1.5pt solid #1A1814', marginBottom: '6pt' }} />

      {/* ── JM Table ───────────────────────────────────── */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
        <thead>
          <tr>
            {visibleCols.map(c => (
              <th key={c.key} style={{
                padding: '3pt 4pt',
                textAlign: (c as any).mono && c.key !== 'line_no' ? 'right' : 'left',
                fontFamily: 'Jost, Arial, sans-serif', fontWeight: 600, fontSize: '7.5pt',
                letterSpacing: '0.05em', textTransform: 'uppercase', color: '#444',
                borderBottom: '1pt solid #1A1814', borderTop: '1pt solid #1A1814',
                background: '#F0EBE4', whiteSpace: 'nowrap',
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {items.map((item, idx) => {
            const isBaSao = item.notes?.toLowerCase().includes('ba sao')
            return (
              <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAF7' }}>
                {visibleCols.map(c => {
                  const val   = item[c.key]
                  const isSku = (c as any).sku

                  // Notes cell — Ba Sao red
                  if ((c as any).notes) {
                    return (
                      <td key={c.key} style={{
                        padding: '2.5pt 4pt', borderBottom: '0.5pt solid #DDD8CF',
                        fontFamily: 'Jost, Arial, sans-serif', fontSize: '8pt',
                        color: isBaSao ? '#DC2626' : '#444',
                        fontWeight: isBaSao ? 700 : 400,
                        WebkitPrintColorAdjust: 'exact',
                        // @ts-ignore
                        printColorAdjust: 'exact',
                      } as React.CSSProperties}>
                        {val || '—'}
                      </td>
                    )
                  }

                  return (
                    <td key={c.key} style={{
                      padding: '2.5pt 4pt',
                      borderBottom: '0.5pt solid #DDD8CF',
                      fontFamily: (c as any).mono ? 'JetBrains Mono, Courier New, monospace' : 'Jost, Arial, sans-serif',
                      fontSize: '8pt',
                      textAlign: (c as any).mono && c.key !== 'line_no' ? 'right' : 'left',
                      background: isSku ? '#FEF3C7' : undefined,
                      WebkitPrintColorAdjust: 'exact',
                    } as React.CSSProperties}>
                      {(c as any).price ? fmt2(val) : c.key.includes('_gr') ? fmt4(val) : (val ?? '')}
                    </td>
                  )
                })}
              </tr>
            )
          })}
          {items.length === 0 && (
            <tr>
              <td colSpan={visibleCols.length} style={{ padding: '8pt 4pt', textAlign: 'center', color: '#999', fontSize: '8pt' }}>
                No items
              </td>
            </tr>
          )}
        </tbody>

        {/* ── Totals tfoot ─────────────────────────── */}
        {items.length > 0 && (
          <tfoot>
            <tr style={{ background: '#F0EBE4', fontWeight: 700 }}>
              {visibleCols.map(c => {
                const sumPriceFields  = ['gold_value_usd', 'hpusa', 'cif_price', 'tag_price']
                const sumWeightFields = ['weight_total_gr', 'weight_gold_actual_gr', 'weight_no_gem_gr']
                const isPriceSum  = sumPriceFields.includes(c.key)
                const isWeightSum = sumWeightFields.includes(c.key)
                const weightTotals: Record<string, number> = {
                  weight_total_gr: totWt, weight_gold_actual_gr: totGold, weight_no_gem_gr: totNoGem,
                }
                const priceTotals: Record<string, number> = {
                  gold_value_usd: totGoldV, hpusa: totHpusa, cif_price: totCif, tag_price: totTag,
                }
                return (
                  <td key={c.key} style={{
                    padding: '3pt 4pt', fontWeight: 700, fontSize: '8pt',
                    borderTop: '1pt solid #1A1814',
                    textAlign: (c as any).mono && c.key !== 'line_no' ? 'right' : 'left',
                    fontFamily: (c as any).mono ? 'JetBrains Mono, Courier New, monospace' : 'inherit',
                  }}>
                    {c.key === 'qty_pcs'    ? totQty
                      : c.key === 'description' ? 'TOTAL'
                      : isPriceSum          ? fmt2(priceTotals[c.key])
                      : isWeightSum         ? fmt4(weightTotals[c.key])
                      : ''}
                  </td>
                )
              })}
            </tr>

            {/* Total Stone Weight row — only when gems exist */}
            {totGemWt > 0 && (
              <tr style={{ background: '#F0EBE4' }}>
                {visibleCols.map((c, i) => (
                  <td key={c.key} style={{
                    padding: '2pt 4pt', fontSize: '7.5pt',
                    fontStyle: 'italic', color: '#666',
                    textAlign: i === visibleCols.length - 1 ? 'right' : 'left',
                    borderBottom: '0.5pt solid #DDD8CF',
                  }}>
                    {c.key === 'description' ? 'Σ Stone Weight (g):' : ''}
                    {c.key === 'weight_no_gem_gr' ? fmt4(totGemWt) : ''}
                  </td>
                ))}
              </tr>
            )}
          </tfoot>
        )}
      </table>

      {/* ── Notes section ──────────────────────────────── */}
      {header.notes && (
        <div style={{ marginTop: '8pt', fontSize: '8pt', color: '#444', fontStyle: 'italic' }}>
          <strong style={{ fontStyle: 'normal' }}>Notes:</strong> {header.notes}
        </div>
      )}

      {/* ── Signature Block ─────────────────────────────── */}
      <div style={{ marginTop: '20pt', borderTop: '1pt solid #C8C3BB', paddingTop: '10pt' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20pt' }}>
          {([
            { title: 'Prepared by',              subtitle: 'Sales Representative' },
            { title: 'Approved by',              subtitle: 'Manager / Admin'       },
            { title: 'Customer Acknowledgment',  subtitle: 'Received in good order'},
          ] as const).map(({ title, subtitle }) => (
            <div key={title}>
              <div style={{ fontSize: '7pt', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '24pt' }}>
                {title}
              </div>
              <div style={{ borderTop: '0.75pt solid #1A1814', paddingTop: '3pt' }}>
                <div style={{ fontSize: '7pt', color: '#aaa' }}>Signature / Date</div>
                <div style={{ marginTop: '4pt', fontSize: '7pt', color: '#777', fontStyle: 'italic' }}>{subtitle}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Screen-only controls ────────────────────────── */}
      <div className="no-print" style={{ marginTop: '16pt', display: 'flex', gap: 8 }}>
        <button onClick={() => window.print()} style={{ padding: '6px 16px', background: '#1A1814', color: '#FAFAF7', border: 'none', fontFamily: 'Jost, sans-serif', fontSize: '12px', cursor: 'pointer' }}>
          Print / Save PDF
        </button>
        <button onClick={() => window.close()} style={{ padding: '6px 16px', background: 'transparent', border: '1px solid #C8C3BB', fontFamily: 'Jost, sans-serif', fontSize: '12px', cursor: 'pointer' }}>
          Close
        </button>
      </div>

      <style>{`
        @page { size: A4 landscape; margin: 15mm 10mm; }
        @media print {
          .no-print { display: none !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          thead { display: table-header-group; }
          tfoot { display: table-footer-group; }
          tr    { page-break-inside: avoid; }
          .signature-block { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}
