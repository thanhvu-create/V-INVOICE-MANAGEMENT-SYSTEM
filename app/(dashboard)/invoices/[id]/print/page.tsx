'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'

const JM_COLS = [
  { key: 'seq',               label: 'No.',              mono: true  },
  { key: 'sku',               label: 'SKU',              sku:  true  },
  { key: 'qt_pcs',            label: 'Qty',              mono: true  },
  { key: 'description',       label: 'Description'                   },
  { key: 'class',             label: 'Class'                         },
  { key: 'sub_class',         label: 'Sub Class'                     },
  { key: 'loai_vang',         label: 'Loại vàng'                     },
  { key: 'nini_adm',          label: 'Notes',            notes: true },
  { key: 't_pham_co_nvl_da',  label: 'T.Phẩm NVL đá (g)', mono: true },
  { key: 't_pham_tru_nvl_da', label: 'T.Phẩm vàng TT (g)', mono: true },
  { key: 'tien_vang',         label: 'Tiền vàng',        mono: true, price: true, adminOnly: true },
  { key: 'von_san_xuat',      label: 'Vốn SX',           mono: true, price: true, adminOnly: true },
  { key: 'cif_price',         label: 'CIF/SP',           mono: true, price: true, adminOnly: true },
]

function fmt2(n: any) { return n != null ? `$${Number(n).toFixed(2)}` : '' }
function fmt4(n: any) { return n != null ? Number(n).toFixed(4) : '' }

function resolveLogoUrl(url: string): string {
  const match = url.match(/drive\.google\.com\/file\/d\/([^/?]+)/)
  if (match) return `https://drive.google.com/uc?export=view&id=${match[1]}`
  return url
}

const LOGO_URL = process.env.NEXT_PUBLIC_LOGO_URL
  ? resolveLogoUrl(process.env.NEXT_PUBLIC_LOGO_URL)
  : null

export default function PrintPage() {
  const { id }    = useParams<{ id: string }>()
  const { canDo } = useUser()
  const [data, setData]       = useState<{ header: any; items: any[] } | null>(null)
  const [loading, setLoading] = useState(true)

  const canSeePrice  = canDo('see_prices')
  const visibleCols  = JM_COLS.filter(c => !(c as any).adminOnly || canSeePrice)

  useEffect(() => {
    fetch(`/api/invoices/${id}`)
      .then(r => r.json())
      .then(json => { if (json.success) setData(json.data) })
      .finally(() => setLoading(false))
  }, [id])

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

  const totQty    = items.reduce((s, i) => s + (i.qt_pcs             ?? 0), 0)
  const totWt     = items.reduce((s, i) => s + (i.t_pham_co_nvl_da   ?? 0), 0)
  const totNoGem  = items.reduce((s, i) => s + (i.t_pham_tru_nvl_da  ?? 0), 0)
  const totGoldV  = items.reduce((s, i) => s + (i.tien_vang          ?? 0), 0)
  const totVonSX  = items.reduce((s, i) => s + (i.von_san_xuat       ?? 0), 0)
  const totCif    = items.reduce((s, i) => s + (i.cif_price          ?? 0), 0)
  const totGemWt  = items.reduce((s, i) =>
    s + (i.invoice_diamonds ?? []).reduce((gs: number, g: any) => gs + (g.tl_xoan_gr ?? 0), 0), 0
  )

  return (
    <div style={{ fontFamily: 'Jost, Arial, sans-serif', fontSize: '9pt', color: '#000', background: '#fff', padding: '10mm' }}>

      {/* Header */}
      <div style={{ marginBottom: '8pt', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10pt' }}>
          {LOGO_URL && (
            <img src={LOGO_URL} alt="HP Jewelry" style={{ height: '36pt', width: 'auto', objectFit: 'contain' }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
          <div>
            <div style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontSize: '16pt', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              HP Jewelry
            </div>
            <div style={{ fontSize: '8pt', color: '#888', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Invoice</div>
          </div>
        </div>

        <div style={{ textAlign: 'right', fontSize: '8pt', color: '#666', lineHeight: 1.6 }}>
          <div>Printed: {new Date().toLocaleString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })}</div>
          <div>Created by: {header.created_by}</div>
          {header.status === 'finalized' && (
            <div style={{ marginTop: '3pt', fontWeight: 700, color: '#1A1814' }}>🔒 FINALIZED</div>
          )}
        </div>
      </div>

      {/* Invoice meta */}
      <div style={{ fontSize: '9pt', color: '#222', lineHeight: 1.7, marginBottom: '3pt' }}>
        <strong>Invoice:</strong> {header.invoice_code}
        {header.channel       && <span style={{ marginLeft: 16 }}><strong>Channel:</strong> {header.channel}</span>}
        {header.template_type && <span style={{ marginLeft: 16 }}><strong>Template:</strong> {header.template_type}</span>}
      </div>
      <div style={{ fontSize: '8pt', color: '#555', marginBottom: '4pt' }}>
        <strong>Status:</strong> {header.status.toUpperCase()}
        {header.finalized_at && <span style={{ marginLeft: 16 }}><strong>Finalized:</strong> {header.finalized_at.slice(0, 10)}</span>}
      </div>

      <hr style={{ borderTop: '1.5pt solid #1A1814', marginBottom: '6pt' }} />

      {/* JM Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '8pt' }}>
        <thead>
          <tr>
            {visibleCols.map(c => (
              <th key={c.key} style={{
                padding: '3pt 4pt',
                textAlign: (c as any).mono && c.key !== 'seq' ? 'right' : 'left',
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
            const isBaSao = item.nini_adm?.toLowerCase().includes('ba sao')
            return (
              <tr key={item.id} style={{ background: idx % 2 === 0 ? '#fff' : '#FAFAF7' }}>
                {visibleCols.map(c => {
                  const val = item[c.key]

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
                      textAlign: (c as any).mono && c.key !== 'seq' ? 'right' : 'left',
                      background: (c as any).sku ? '#FEF3C7' : undefined,
                      WebkitPrintColorAdjust: 'exact',
                    } as React.CSSProperties}>
                      {(c as any).price ? fmt2(val)
                        : c.key.includes('_da') || c.key.includes('_gr') ? fmt4(val)
                        : (val ?? '')}
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

        {items.length > 0 && (
          <tfoot>
            <tr style={{ background: '#F0EBE4', fontWeight: 700 }}>
              {visibleCols.map(c => {
                const priceSums: Record<string, number> = { tien_vang: totGoldV, von_san_xuat: totVonSX, cif_price: totCif }
                const wtSums:    Record<string, number> = { t_pham_co_nvl_da: totWt, t_pham_tru_nvl_da: totNoGem }
                return (
                  <td key={c.key} style={{
                    padding: '3pt 4pt', fontWeight: 700, fontSize: '8pt',
                    borderTop: '1pt solid #1A1814',
                    textAlign: (c as any).mono && c.key !== 'seq' ? 'right' : 'left',
                    fontFamily: (c as any).mono ? 'JetBrains Mono, Courier New, monospace' : 'inherit',
                  }}>
                    {c.key === 'qt_pcs'         ? totQty
                      : c.key === 'description' ? 'TOTAL'
                      : c.key in priceSums       ? fmt2(priceSums[c.key])
                      : c.key in wtSums          ? fmt4(wtSums[c.key])
                      : ''}
                  </td>
                )
              })}
            </tr>

            {totGemWt > 0 && (
              <tr style={{ background: '#F0EBE4' }}>
                {visibleCols.map((c, i) => (
                  <td key={c.key} style={{
                    padding: '2pt 4pt', fontSize: '7.5pt',
                    fontStyle: 'italic', color: '#666',
                    textAlign: i === visibleCols.length - 1 ? 'right' : 'left',
                    borderBottom: '0.5pt solid #DDD8CF',
                  }}>
                    {c.key === 'description'      ? 'Σ TL Xoàn (gr):' : ''}
                    {c.key === 't_pham_tru_nvl_da' ? fmt4(totGemWt)    : ''}
                  </td>
                ))}
              </tr>
            )}
          </tfoot>
        )}
      </table>

      {/* Signature Block */}
      <div style={{ marginTop: '20pt', borderTop: '1pt solid #C8C3BB', paddingTop: '10pt' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '20pt' }}>
          {([
            { title: 'Prepared by',              subtitle: 'Sales Representative'  },
            { title: 'Approved by',              subtitle: 'Manager / Admin'        },
            { title: 'Customer Acknowledgment',  subtitle: 'Received in good order' },
          ] as const).map(({ title, subtitle }) => (
            <div key={title}>
              <div style={{ fontSize: '7pt', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '24pt' }}>{title}</div>
              <div style={{ borderTop: '0.75pt solid #1A1814', paddingTop: '3pt' }}>
                <div style={{ fontSize: '7pt', color: '#aaa' }}>Signature / Date</div>
                <div style={{ marginTop: '4pt', fontSize: '7pt', color: '#777', fontStyle: 'italic' }}>{subtitle}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

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
        }
      `}</style>
    </div>
  )
}
