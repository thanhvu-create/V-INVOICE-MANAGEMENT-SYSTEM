'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useUser } from '@/contexts/UserContext'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { WorkflowBar } from '@/components/invoice/WorkflowBar'
import { AuditTimeline } from '@/components/invoice/AuditTimeline'

type InvoiceView = 'jm-form' | 'detail'

const ALLOWED_TRANSITIONS: Record<string, Record<string, string[]>> = {
  user:    { draft: ['pending_approval'] },
  manager: { pending_approval: ['approved', 'draft'] },
  admin:   { draft: ['pending_approval'], pending_approval: ['approved', 'draft'], approved: ['invoiced', 'pending_approval'] },
}

function fmt2(n: number | null | undefined) { return n != null ? `$${n.toFixed(2)}` : '—' }
function fmt4(n: number | null | undefined) { return n != null ? n.toFixed(4) : '—' }

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
  { key: 'tag_price',              label: 'Tag Price',      mono: true, price: true, admin: true },
  { key: 'fr_price',               label: 'FR Price',       mono: true, price: true, admin: true },
]

export default function InvoiceDetailPage() {
  const { id }          = useParams<{ id: string }>()
  const { user, canDo } = useUser()
  const router          = useRouter()

  const [data,    setData]    = useState<{ header: any; items: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [view,    setView]    = useState<InvoiceView>('jm-form')

  const canSeePrice = canDo('see_prices')
  const availTrans  = ALLOWED_TRANSITIONS[user.role]?.[data?.header?.status ?? ''] ?? []

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res  = await fetch(`/api/invoices/${id}`)
      const json = await res.json()
      if (json.success) setData(json.data)
      else router.push('/invoices')
    } finally { setLoading(false) }
  }, [id])

  useEffect(() => { fetchData() }, [fetchData])

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Loading...</div>
  if (!data)   return null

  const { header, items } = data

  return (
    <div>
      {/* Locked banner */}
      {header.is_locked && (
        <div style={{ background: '#1A1814', color: '#FAFAF7', padding: '8px 16px', textAlign: 'center', fontSize: 'var(--text-xs)', letterSpacing: '0.15em', textTransform: 'uppercase', marginBottom: '1rem' }}>
          🔒 Invoiced — This invoice is locked and cannot be modified
        </div>
      )}

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
            <a href="/invoices" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: 'var(--text-sm)' }}>← Invoices</a>
          </div>
          <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400, margin: '0 0 0.5rem' }}>
            {header.po_number}
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <StatusBadge status={header.status} />
            {header.store && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', border: '1px solid var(--border-base)', padding: '2px 8px' }}>{header.store}</span>}
            {header.mr_number && <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>MR: {header.mr_number}</span>}
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Rate: {header.daily_metal_rates?.rate_date ?? '—'}</span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>Rule: {header.pricing_rules?.name ?? '—'}</span>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {!header.is_locked && canDo('import') && (
            <a href={`/import?invoiceId=${id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', border: '1px solid var(--border-base)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
              <i className="fa-solid fa-file-import" style={{ fontSize: 11 }} /> Import
            </a>
          )}
          <a href={`/api/invoices/${id}/export`} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0.45rem 1rem', border: '1px solid var(--border-base)', color: 'var(--text-primary)', textDecoration: 'none', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-body)' }}>
            <i className="fa-solid fa-file-export" style={{ fontSize: 11 }} /> Export
          </a>
        </div>
      </div>

      {/* Workflow bar */}
      {!header.is_locked && availTrans.length > 0 && (
        <div className="workflow-bar-wrap no-print">
          <WorkflowBar invoiceId={id} currentStatus={header.status} availableTransitions={availTrans} onTransitioned={fetchData} />
        </div>
      )}

      {/* View toggle */}
      <div className="view-toggle-bar no-print" style={{ display: 'flex', borderBottom: '1px solid var(--border-base)', marginBottom: '1.5rem' }}>
        {(['jm-form', 'detail'] as const).map(v => (
          <button key={v} onClick={() => setView(v)} style={{
            padding: '10px 24px', border: 'none', background: 'transparent',
            borderBottom: view === v ? '2px solid var(--border-strong)' : '2px solid transparent',
            fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: view === v ? 600 : 400,
            textTransform: 'uppercase', letterSpacing: '0.1em',
            color: view === v ? 'var(--text-primary)' : 'var(--text-secondary)', cursor: 'pointer',
          }}>
            {v === 'jm-form' ? 'JM Form View' : 'Detail View'}
          </button>
        ))}
      </div>

      {/* Items table */}
      {view === 'jm-form' ? (
        <JMFormTable items={items} canSeePrice={canSeePrice} />
      ) : (
        <DetailTable items={items} canSeePrice={canSeePrice} />
      )}

      {/* Audit timeline */}
      <AuditTimeline invoiceId={id} />
    </div>
  )
}

function JMFormTable({ items, canSeePrice }: { items: any[]; canSeePrice: boolean }) {
  const visibleCols = JM_COLS.filter(c => !c.admin || canSeePrice)

  const th: React.CSSProperties = {
    padding: '0.5rem 0.6rem', background: 'var(--bg-surface)',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
    fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
    color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
    whiteSpace: 'nowrap', textAlign: 'left',
  }
  const td: React.CSSProperties = {
    padding: '0.5rem 0.6rem', borderBottom: '1px solid var(--border-light)',
    fontSize: 'var(--text-sm)', verticalAlign: 'middle',
  }

  return (
    <div className="jm-scroll-wrap">
      <table className="jm-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>{visibleCols.map(c => <th key={c.key} style={th}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={item.id} onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
              {visibleCols.map(c => {
                const val = item[c.key]
                return (
                  <td key={c.key} style={{
                    ...td,
                    fontFamily: c.mono ? 'var(--font-mono)' : 'inherit',
                    background: c.sku ? 'var(--sku-highlight-bg)' : undefined,
                    textAlign: typeof val === 'number' && c.key !== 'line_no' ? 'right' : 'left',
                  }}>
                    {c.price ? fmt2(val) : c.key.includes('_gr') ? fmt4(val) : (val ?? '—')}
                  </td>
                )
              })}
            </tr>
          ))}
          {items.length === 0 && (
            <tr><td colSpan={visibleCols.length} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>No items yet. Use Import to add items.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function DetailTable({ items, canSeePrice }: { items: any[]; canSeePrice: boolean }) {
  return (
    <div>
      {items.map(item => (
        <div key={item.id} style={{ marginBottom: '1rem', border: '1px solid var(--border-base)', background: 'var(--bg-surface)' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>#{item.line_no}</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600, background: 'var(--sku-highlight-bg)', padding: '1px 6px' }}>{item.sku_jwmold}</span>
              <span style={{ fontSize: 'var(--text-sm)' }}>{item.description ?? '—'}</span>
            </div>
            {canSeePrice && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>CIF: {fmt2(item.cif_price)}</span>}
          </div>
          <div style={{ padding: '0.75rem 1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '0.5rem' }}>
            {[
              ['Qty', item.qty_pcs],
              ['Metal', item.metal_type],
              ['Total Wt (g)', fmt4(item.weight_total_gr)],
              ['Gold Wt (g)', fmt4(item.weight_gold_actual_gr)],
              ['No-Gem Wt (g)', fmt4(item.weight_no_gem_gr)],
              ...(canSeePrice ? [
                ['Gold Value', fmt2(item.gold_value_usd)],
                ['HPUSA', fmt2(item.hpusa)],
                ['CIF', fmt2(item.cif_price)],
                ['Tag', fmt2(item.tag_price)],
                ['FR', fmt2(item.fr_price)],
              ] : []),
            ].map(([label, val]) => (
              <div key={String(label)}>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)' }}>{val ?? '—'}</div>
              </div>
            ))}
          </div>
          {/* Gems */}
          {item.item_gem_details?.length > 0 && (
            <div style={{ padding: '0.5rem 1rem 0.75rem', borderTop: '1px solid var(--border-light)' }}>
              <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Gems</div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)' }}>
                  <thead>
                    <tr>{['Type','Shape','Size','Qty','Wt(g)','$/ct','Total','Setting','Fee/pc','Total Fee'].map(h => (
                      <th key={h} style={{ padding: '3px 8px', borderBottom: '1px solid var(--border-light)', textAlign: 'left', fontWeight: 600, color: 'var(--text-secondary)' }}>{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {item.item_gem_details.map((g: any) => (
                      <tr key={g.id}>
                        <td style={{ padding: '3px 8px' }}>{g.gem_type ?? '—'}</td>
                        <td style={{ padding: '3px 8px' }}>{g.shape ?? '—'}</td>
                        <td style={{ padding: '3px 8px' }}>{g.size_mm ?? '—'}</td>
                        <td style={{ padding: '3px 8px' }}>{g.qty_pcs}</td>
                        <td style={{ padding: '3px 8px' }}>{fmt4(g.weight_gr)}</td>
                        <td style={{ padding: '3px 8px' }}>{fmt2(g.price_per_carat)}</td>
                        <td style={{ padding: '3px 8px' }}>{fmt2(g.total_price)}</td>
                        <td style={{ padding: '3px 8px' }}>{g.setting_type ?? '—'}</td>
                        <td style={{ padding: '3px 8px' }}>{fmt2(g.setting_fee_per_pcs)}</td>
                        <td style={{ padding: '3px 8px' }}>{fmt2(g.total_setting_fee)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      ))}
      {items.length === 0 && <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>No items yet.</div>}
    </div>
  )
}
