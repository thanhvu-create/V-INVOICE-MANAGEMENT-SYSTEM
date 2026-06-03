'use client'

import { useState, useEffect } from 'react'
import { useUser } from '@/contexts/UserContext'
import { useRouter } from 'next/navigation'
import { apiCall } from '@/lib/api'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

const thStyle: React.CSSProperties = {
  padding: '8px 10px', background: 'var(--bg-base)', fontSize: 'var(--text-xs)',
  fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase',
  color: 'var(--text-secondary)', borderBottom: '2px solid var(--border-base)',
  textAlign: 'right', whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '7px 10px', borderBottom: '1px solid var(--border-light)',
  fontSize: 'var(--text-sm)', verticalAlign: 'middle', fontFamily: 'var(--font-mono)', textAlign: 'right',
}
const inputStyle: React.CSSProperties = {
  width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
  background: 'var(--bg-surface)', padding: '4px 6px',
  fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)', outline: 'none', textAlign: 'right',
}

export default function StoreMarkupPage() {
  const { canDo } = useUser()
  const router    = useRouter()
  const [tiers, setTiers]         = useState<any[]>([])
  const [channels, setChannels]   = useState<any[]>([])
  const [loading, setLoading]     = useState(true)
  const [editRow, setEditRow]     = useState<string | null>(null)
  const [editVals, setEditVals]   = useState<Record<string, string>>({})
  const [saving, setSaving]       = useState(false)
  const [tab, setTab]             = useState<'US' | 'VN' | 'all'>('all')
  const [confirmDel, setConfirmDel] = useState<any | null>(null)
  const [deleting, setDeleting]   = useState(false)

  useEffect(() => {
    if (!canDo('manage_products')) { router.push('/dashboard'); return }
    load()
  }, [])

  async function load() {
    setLoading(true)
    const res  = await fetch('/api/admin/store-markup')
    const json = await res.json()
    if (json.success) { setTiers(json.data.tiers); setChannels(json.data.channels) }
    setLoading(false)
  }

  const visibleChannels = channels.filter(c => tab === 'all' ? true : c.region === tab)

  function startEdit(tier: any) {
    const vals: Record<string, string> = {
      value_from: String(tier.value_from),
      value_to:   String(tier.value_to),
    }
    channels.forEach(c => { vals[c.price_list_type] = String(tier.markups?.[c.price_list_type] ?? '') })
    setEditVals(vals)
    setEditRow(tier.id)
  }

  async function saveEdit(tier: any) {
    setSaving(true)
    const markups: Record<string, number> = {}
    channels.forEach(c => {
      const v = parseFloat(editVals[c.price_list_type] ?? '')
      if (!isNaN(v) && v > 0) markups[c.price_list_type] = v
    })
    const data = await apiCall<any>(
      () => fetch('/api/admin/store-markup', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: tier.id, value_from: parseFloat(editVals.value_from), value_to: parseFloat(editVals.value_to), markups }),
      }),
      { successMsg: 'Tier saved.' }
    )
    setSaving(false)
    if (data !== null) { setEditRow(null); load() }
  }

  async function addTier() {
    const data = await apiCall<any>(
      () => fetch('/api/admin/store-markup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value_from: 0, value_to: 0, markups: {}, sort_order: tiers.length }),
      }),
      { successMsg: 'Tier added.' }
    )
    if (data !== null) load()
  }

  async function handleDelete() {
    if (!confirmDel) return
    setDeleting(true)
    await apiCall(
      () => fetch(`/api/admin/store-markup?id=${confirmDel.id}`, { method: 'DELETE' }),
      { successMsg: 'Tier deleted.' }
    )
    setDeleting(false)
    setConfirmDel(null)
    load()
  }

  return (
    <div style={{ padding: '1.5rem 2rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-2xl)', fontWeight: 400 }}>Store Markup Tiers</div>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginTop: 4 }}>
            BG30 — Tier multiplier by value range × channel. <code style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)' }}>sell_price = cost_total × markup</code>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-warning)', marginTop: 4 }}>
            <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 4 }} />
            Formula: Cost = V × loss 6% + X × 1.15 (round) or 1.3 (other cuts) × CIF 15%
          </div>
        </div>
        <button onClick={addTier} style={{ background: 'var(--text-primary)', color: 'var(--text-inverse)', border: 'none', padding: '8px 20px', fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', borderRadius: 0 }}>
          <i className="fa-solid fa-plus" style={{ marginRight: 6 }} />Add Tier
        </button>
      </div>

      {/* Channel filter */}
      <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
        {(['all', 'US', 'VN'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '4px 16px', border: '1px solid var(--border-base)', borderRadius: 0, background: tab === t ? 'var(--text-primary)' : 'transparent', color: tab === t ? 'var(--text-inverse)' : 'var(--text-primary)', fontSize: 'var(--text-xs)', fontWeight: 600, cursor: 'pointer' }}>
            {t === 'all' ? 'All Channels' : t === 'US' ? '🇺🇸 US' : '🇻🇳 VN'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          <i className="fa-solid fa-circle-notch fa-spin" style={{ marginRight: 8 }} />Loading...
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: 'left' }}>From ($)</th>
                <th style={{ ...thStyle, textAlign: 'left' }}>To ($)</th>
                {visibleChannels.map(c => (
                  <th key={c.id} style={{ ...thStyle, color: c.region === 'VN' ? 'var(--color-success)' : 'var(--color-info)' }}>
                    {c.price_list_type}
                    <span style={{ display: 'block', fontSize: 9, fontWeight: 400, color: 'var(--text-muted)' }}>{c.region}</span>
                  </th>
                ))}
                <th style={thStyle} />
              </tr>
            </thead>
            <tbody>
              {tiers.length === 0 ? (
                <tr><td colSpan={visibleChannels.length + 3} style={{ ...tdStyle, textAlign: 'center', color: 'var(--text-muted)', padding: '2rem' }}>
                  No data. Run <code>nvl_store_markup.sql</code> on Supabase first.
                </td></tr>
              ) : tiers.map(tier => {
                const isEditing = editRow === tier.id
                return (
                  <tr key={tier.id}
                    onMouseEnter={e => { if (!isEditing) e.currentTarget.style.background = 'var(--bg-hover)' }}
                    onMouseLeave={e => { if (!isEditing) e.currentTarget.style.background = '' }}
                    style={{ background: isEditing ? 'var(--bg-surface)' : '' }}>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      {isEditing
                        ? <input type="number" style={{ ...inputStyle, width: 90, textAlign: 'left' }} value={editVals.value_from} onChange={e => setEditVals(v => ({ ...v, value_from: e.target.value }))} />
                        : <span style={{ fontWeight: 600 }}>${Number(tier.value_from).toLocaleString()}</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'left' }}>
                      {isEditing
                        ? <input type="number" style={{ ...inputStyle, width: 90, textAlign: 'left' }} value={editVals.value_to} onChange={e => setEditVals(v => ({ ...v, value_to: e.target.value }))} />
                        : <span>${Number(tier.value_to).toLocaleString()}</span>}
                    </td>
                    {visibleChannels.map(c => {
                      const val = tier.markups?.[c.price_list_type]
                      return (
                        <td key={c.id} style={tdStyle}>
                          {isEditing
                            ? <input type="number" step="0.01" style={{ ...inputStyle, width: 72 }} value={editVals[c.price_list_type] ?? ''} onChange={e => setEditVals(v => ({ ...v, [c.price_list_type]: e.target.value }))} />
                            : val ? <span style={{ fontWeight: val >= 2 ? 700 : 400 }}>{Number(val).toFixed(2)}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      )
                    })}
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', textAlign: 'center' }}>
                      {isEditing ? (
                        <>
                          <button onClick={() => saveEdit(tier)} disabled={saving}
                            style={{ background: 'var(--color-success)', color: '#fff', border: 'none', padding: '3px 10px', cursor: 'pointer', borderRadius: 0, fontSize: 12, marginRight: 4 }}>
                            {saving ? '…' : '✓ Save'}
                          </button>
                          <button onClick={() => setEditRow(null)}
                            style={{ background: 'transparent', border: '1px solid var(--border-base)', padding: '3px 8px', cursor: 'pointer', borderRadius: 0, fontSize: 12 }}>
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(tier)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', marginRight: 6 }} title="Edit"><i className="fa-solid fa-pen" /></button>
                          <button onClick={() => setConfirmDel(tier)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--color-danger)' }} title="Delete"><i className="fa-solid fa-trash" /></button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Channel list */}
      <div style={{ marginTop: '2rem', borderTop: '1px solid var(--border-light)', paddingTop: '1.5rem' }}>
        <div style={{ fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>
          Price List Channels
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {channels.map(c => (
            <div key={c.id} style={{ border: '1px solid var(--border-base)', padding: '4px 12px', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', background: c.region === 'VN' ? '#F0FDF4' : '#EFF6FF', color: c.region === 'VN' ? 'var(--color-success)' : 'var(--color-info)' }}>
              {c.price_list_type} <span style={{ color: 'var(--text-muted)' }}>({c.region})</span>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDel}
        title="Delete Tier"
        message={`Delete tier $${Number(confirmDel?.value_from).toLocaleString()} – $${Number(confirmDel?.value_to).toLocaleString()}? This cannot be undone.`}
        okText={deleting ? 'Deleting…' : 'Delete'}
        danger
        onOk={handleDelete}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}
