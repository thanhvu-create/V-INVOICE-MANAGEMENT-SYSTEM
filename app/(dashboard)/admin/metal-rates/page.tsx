'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { computeKaratPrices, OZ_PER_GRAM } from '@/lib/gold-fetch'

const KARATS = ['24K','23K','22K','18K','15K','14K','10K','PT','AG','PD'] as const

const th: React.CSSProperties = {
  padding: '7px 10px', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
  background: 'var(--bg-base)', whiteSpace: 'nowrap', textAlign: 'right',
}
const td: React.CSSProperties = {
  padding: '7px 10px', borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)', fontFamily: 'var(--font-mono)', textAlign: 'right', verticalAlign: 'middle',
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
  background: 'var(--bg-surface)', padding: '6px 8px',
  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
  outline: 'none', textAlign: 'right',
}
const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
  letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 4, fontWeight: 500,
}

const EMPTY_SPOT = {
  rate_date: '', spot_24k_oz: '', spot_pt_oz: '', spot_ag_oz: '', spot_pd_oz: '',
  oz_per_gram: '31.1035', loss_gold_pct: '6', loss_pt_pct: '17',
}

export default function MetalRatesPage() {
  const [rates,     setRates]     = useState<any[]>([])
  const [loading,   setLoading]   = useState(true)
  const [fetching,  setFetching]  = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [modal,     setModal]     = useState(false)
  const [editId,    setEditId]    = useState<string | null>(null)
  const [form,      setForm]      = useState(EMPTY_SPOT)
  const [confirmDel, setConfirmDel] = useState<any | null>(null)
  const [deleting,  setDeleting]  = useState(false)
  const [page,      setPage]      = useState(1)
  const PER_PAGE = 10

  const load = useCallback(async () => {
    setLoading(true)
    const res  = await fetch('/api/metal-rates')
    const json = await res.json()
    if (json.success) setRates(json.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  // Computed karat rates preview (client-side, no save)
  const preview = (() => {
    const g  = parseFloat(form.spot_24k_oz)
    const p  = parseFloat(form.spot_pt_oz)
    const a  = parseFloat(form.spot_ag_oz)
    const d  = parseFloat(form.spot_pd_oz)
    const oz = parseFloat(form.oz_per_gram) || 31.1035
    const lg = parseFloat(form.loss_gold_pct) || 6
    const lp = parseFloat(form.loss_pt_pct)   || 17
    if (!g) return null
    return computeKaratPrices(g, p || 0, a || 0, d || 0, lg, lp, oz)
  })()

  async function fetchMarket() {
    setFetching(true)
    try {
      const res  = await fetch('/api/metal-rates/fetch-market')
      const json = await res.json()
      if (!json.success) { toast(json.message || 'Failed to fetch market prices.', 'error'); return }
      const d = json.data
      setForm(v => ({
        ...v,
        rate_date:    d.date,
        spot_24k_oz:  String(d.spot_24k_oz),
        spot_pt_oz:   String(d.spot_pt_oz),
        spot_ag_oz:   String(d.spot_ag_oz),
        spot_pd_oz:   String(d.spot_pd_oz),
      }))
      toast(`Fetched from ${d.source} — review and save.`, 'success')
    } finally { setFetching(false) }
  }

  function openAdd() {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
    setForm({ ...EMPTY_SPOT, rate_date: today })
    setEditId(null)
    setModal(true)
  }

  function openEdit(r: any) {
    setForm({
      rate_date:     r.rate_date     ?? '',
      spot_24k_oz:   r.spot_24k_oz  != null ? String(r.spot_24k_oz)  : '',
      spot_pt_oz:    r.spot_pt_oz   != null ? String(r.spot_pt_oz)   : '',
      spot_ag_oz:    r.spot_ag_oz   != null ? String(r.spot_ag_oz)   : '',
      spot_pd_oz:    r.spot_pd_oz   != null ? String(r.spot_pd_oz)   : '',
      oz_per_gram:   r.oz_per_gram  != null ? String(r.oz_per_gram)  : '31.1035',
      loss_gold_pct: r.loss_gold_pct != null ? String(r.loss_gold_pct) : '6',
      loss_pt_pct:   r.loss_pt_pct  != null ? String(r.loss_pt_pct)  : '17',
    })
    setEditId(r.id)
    setModal(true)
  }

  async function handleSave() {
    if (!form.rate_date || !form.spot_24k_oz) {
      toast('Date and 24K spot price are required.', 'warn'); return
    }
    setSaving(true)
    const g  = parseFloat(form.spot_24k_oz)
    const p  = parseFloat(form.spot_pt_oz)  || 0
    const a  = parseFloat(form.spot_ag_oz)  || 0
    const d  = parseFloat(form.spot_pd_oz)  || 0
    const oz = parseFloat(form.oz_per_gram) || 31.1035
    const lg = parseFloat(form.loss_gold_pct) || 6
    const lp = parseFloat(form.loss_pt_pct)   || 17
    const kp = computeKaratPrices(g, p, a, d, lg, lp, oz)

    const body = {
      rate_date:     form.rate_date,
      spot_24k_oz:   g, spot_pt_oz: p, spot_ag_oz: a, spot_pd_oz: d,
      oz_per_gram:   oz, loss_gold_pct: lg, loss_pt_pct: lp,
      karat_prices:  kp,
      // Keep old columns for backward compat with existing invoices
      gold_24k:  kp['24K'], gold_18kw: kp['18K'], gold_18ky: kp['18K'],
      gold_14ky: kp['14K'], platinum:  kp['PT'],  silver:    kp['AG'], palladium: kp['PD'],
    }

    const res = await fetch(editId ? `/api/metal-rates/${editId}` : '/api/metal-rates', {
      method: editId ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editId ? body : body),
    })
    const json = await res.json()
    setSaving(false)
    if (!json.success) { toast(json.message || 'Save failed.', 'error'); return }
    toast(editId ? 'Rate updated.' : 'Rate added.', 'success')
    setModal(false)
    load()
  }

  async function handleDelete() {
    if (!confirmDel) return
    setDeleting(true)
    const res  = await fetch(`/api/metal-rates/${confirmDel.id}`, { method: 'DELETE' })
    const json = await res.json()
    setDeleting(false)
    setConfirmDel(null)
    if (!json.success) { toast(json.message || 'Delete failed.', 'error'); return }
    toast('Rate deleted.', 'success')
    load()
  }

  const f = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(v => ({ ...v, [k]: e.target.value }))

  const paginated = rates.slice((page - 1) * PER_PAGE, page * PER_PAGE)

  return (
    <div style={{ padding: '1.5rem 2rem', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400 }}>Gold Prices</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>
            Daily spot prices (USD/oz) → computed karat rates (USD/gram). Source: Kitco / Yahoo Finance.
          </div>
        </div>
        <button onClick={openAdd} style={{ background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', padding: '8px 20px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0 }}>
          <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />Add Rate
        </button>
      </div>

      {/* Rate history table */}
      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Loading...
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Date</th>
                <th style={th}>24K oz</th>
                <th style={th}>PT oz</th>
                <th style={th}>AG oz</th>
                {KARATS.map(k => <th key={k} style={{ ...th, color: ['PT','AG','PD'].includes(k) ? 'var(--color-success)' : 'var(--color-info)' }}>{k}<span style={{ display: 'block', fontSize: 9, fontWeight: 400, color: 'var(--text-muted)' }}>$/g</span></th>)}
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {paginated.length === 0 ? (
                <tr><td colSpan={14} style={{ ...td, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                  No rates yet. Click Add Rate or use Fetch Market Prices.
                </td></tr>
              ) : paginated.map(r => {
                const kp: any = r.karat_prices ?? {}
                return (
                  <tr key={r.id}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = '')}>
                    <td style={{ ...td, textAlign: 'left', fontFamily: 'var(--font-body)', fontWeight: 600 }}>{r.rate_date}</td>
                    <td style={td}>{r.spot_24k_oz ? `$${Number(r.spot_24k_oz).toLocaleString()}` : '—'}</td>
                    <td style={td}>{r.spot_pt_oz  ? `$${Number(r.spot_pt_oz).toLocaleString()}`  : '—'}</td>
                    <td style={td}>{r.spot_ag_oz  ? `$${Number(r.spot_ag_oz).toFixed(2)}`  : '—'}</td>
                    {KARATS.map(k => (
                      <td key={k} style={td}>{kp[k] ? `$${Number(kp[k]).toFixed(4)}` : r.gold_24k && k === '24K' ? `$${Number(r.gold_24k).toFixed(4)}` : '—'}</td>
                    ))}
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <button onClick={() => openEdit(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 6 }} title="Edit"><i className="fa-solid fa-pen" /></button>
                      <button onClick={() => setConfirmDel(r)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }} title="Delete"><i className="fa-solid fa-trash" /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {rates.length > PER_PAGE && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
          {Array.from({ length: Math.ceil(rates.length / PER_PAGE) }, (_, i) => (
            <button key={i} onClick={() => setPage(i + 1)}
              style={{ padding: '4px 10px', margin: '0 2px', border: '1px solid var(--border-base)', background: page === i+1 ? 'var(--text-primary)' : 'transparent', color: page === i+1 ? 'var(--text-inverse)' : 'var(--text-primary)', cursor: 'pointer', borderRadius: 0, fontSize: 'var(--text-xs)' }}>
              {i + 1}
            </button>
          ))}
        </div>
      )}

      {/* Add / Edit Modal */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(26,24,20,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', overflowY: 'auto' }}>
          <div style={{ background: 'var(--bg-surface)', width: 680, border: '1px solid var(--border-base)', margin: '2rem auto' }}>

            {/* Modal header */}
            <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-light)', background: 'var(--bg-base)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)' }}>{editId ? 'Edit Rate' : 'Add Rate'}</span>
              <button onClick={fetchMarket} disabled={fetching}
                style={{ padding: '6px 16px', background: 'var(--color-info)', color: '#fff', border: 'none', cursor: fetching ? 'not-allowed' : 'pointer', borderRadius: 0, fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.08em', opacity: fetching ? 0.7 : 1 }}>
                {fetching
                  ? <><i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 6 }} />Fetching…</>
                  : <><i className="fa-brands fa-bitcoin" style={{ marginRight: 6 }} />Fetch Market Prices</>}
              </button>
            </div>

            <div style={{ padding: '1.25rem 1.5rem' }}>
              {/* Date */}
              <div style={{ marginBottom: '1rem' }}>
                <label style={labelStyle}>Date *</label>
                <input type="date" style={{ ...inputStyle, textAlign: 'left', maxWidth: 180 }} value={form.rate_date} onChange={f('rate_date')} />
              </div>

              {/* Spot prices */}
              <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', padding: '1rem', marginBottom: '1rem' }}>
                <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                  Spot Prices (USD/oz) — from <a href="https://www.kitco.com" target="_blank" rel="noreferrer" style={{ color: 'var(--color-info)' }}>kitco.com</a>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
                  <div><label style={labelStyle}>24K Gold *</label><input type="number" step="0.01" style={inputStyle} value={form.spot_24k_oz} onChange={f('spot_24k_oz')} placeholder="4100" /></div>
                  <div><label style={labelStyle}>Platinum</label><input type="number" step="0.01" style={inputStyle} value={form.spot_pt_oz} onChange={f('spot_pt_oz')} placeholder="2000" /></div>
                  <div><label style={labelStyle}>Silver</label><input type="number" step="0.01" style={inputStyle} value={form.spot_ag_oz} onChange={f('spot_ag_oz')} placeholder="60" /></div>
                  <div><label style={labelStyle}>Palladium</label><input type="number" step="0.01" style={inputStyle} value={form.spot_pd_oz} onChange={f('spot_pd_oz')} placeholder="1800" /></div>
                </div>
              </div>

              {/* Config: Oz/gram + Loss% */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <label style={labelStyle}>Oz per Gram</label>
                  <input type="number" step="0.0001" min="30" max="33" style={{ ...inputStyle, maxWidth: 130 }} value={form.oz_per_gram} onChange={f('oz_per_gram')} />
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>1 troy oz = 31.1035 g</div>
                </div>
                <div>
                  <label style={labelStyle}>Loss % Gold</label>
                  <input type="number" step="0.1" min="0" max="30" style={{ ...inputStyle, maxWidth: 120 }} value={form.loss_gold_pct} onChange={f('loss_gold_pct')} />
                </div>
                <div>
                  <label style={labelStyle}>Loss % Platinum</label>
                  <input type="number" step="0.1" min="0" max="30" style={{ ...inputStyle, maxWidth: 120 }} value={form.loss_pt_pct} onChange={f('loss_pt_pct')} />
                </div>
              </div>

              {/* Computed rates preview */}
              {preview && (
                <div style={{ background: 'var(--bg-base)', border: '1px solid var(--border-light)', padding: '1rem' }}>
                  <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
                    <i className="fa-solid fa-calculator" style={{ marginRight: 6 }} />Computed Rates (USD/gram) — will be saved
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem' }}>
                    {KARATS.map(k => (
                      <div key={k} style={{ background: 'var(--bg-surface)', padding: '6px 10px', border: '1px solid var(--border-light)' }}>
                        <div style={{ fontSize: 'var(--text-xs)', color: ['PT','AG','PD'].includes(k) ? 'var(--color-success)' : 'var(--color-info)', fontWeight: 700, letterSpacing: '0.06em' }}>{k}</div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                          ${preview[k as keyof typeof preview].toFixed(4)}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>
                    Oz/gram: {form.oz_per_gram} · Loss Gold: {form.loss_gold_pct}% · Loss PT: {form.loss_pt_pct}%
                  </div>
                </div>
              )}
            </div>

            {/* Modal footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-light)', background: 'var(--bg-base)', display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button onClick={() => setModal(false)} style={{ padding: '7px 18px', border: '1px solid var(--border-base)', background: 'transparent', cursor: 'pointer', borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.rate_date || !form.spot_24k_oz}
                style={{ padding: '7px 22px', background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.7 : 1, borderRadius: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600 }}>
                {saving ? 'Saving…' : 'Save Rate'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        title="Delete Rate"
        message={`Delete rate for ${confirmDel?.rate_date}? Invoices using this rate will lose their rate reference.`}
        okText={deleting ? 'Deleting…' : 'Delete'}
        danger
        onOk={handleDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
