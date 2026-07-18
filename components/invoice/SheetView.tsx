'use client'

// "Sheet View" tab: opens the REAL Google Sheet (the actual export-sheets output —
// JM FORM / SUMMARY / NVL / CÔNG THỨC, with images and full formatting). Each invoice
// reuses one file, so re-opening refreshes that same file instead of creating new ones.

interface Props {
  onOpenSheet: () => void
  opening?:    boolean
}

export function SheetView({ onOpenSheet, opening }: Props) {
  return (
    <div style={{
      padding: '2.5rem 2rem', textAlign: 'center',
      border: '1px solid var(--border-base)', background: 'var(--bg-surface)',
    }}>
      <i className="fa-brands fa-google-drive" style={{ fontSize: 34, color: '#34A853', marginBottom: '1rem', display: 'block' }} />

      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, margin: '0 0 0.5rem' }}>
        Xem sheet thật — 4 tab đầy đủ
      </h3>

      <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto 0.5rem', lineHeight: 1.6 }}>
        Mở đúng Google Sheet của invoice: <strong>JM FORM · SUMMARY · NVL · CÔNG THỨC</strong>,
        có ảnh và định dạng đầy đủ — y hệt file thật.
      </p>
      <p style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', maxWidth: 520, margin: '0 auto 1.5rem', lineHeight: 1.6 }}>
        <i className="fa-solid fa-circle-info" style={{ marginRight: 5 }} />
        Mỗi invoice dùng chung <strong>1 file</strong>: lần sau mở lại sẽ cập nhật đúng file đó (xoá bản cũ),
        không tạo file mới — Drive không bị rác.
      </p>

      <button
        onClick={onOpenSheet}
        disabled={opening}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '0.6rem 1.5rem', border: '1px solid var(--border-strong)',
          background: 'var(--text-primary)', color: 'var(--text-inverse)',
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', fontWeight: 600,
          cursor: opening ? 'not-allowed' : 'pointer', opacity: opening ? 0.6 : 1, borderRadius: 0,
        }}
      >
        <i className={`fa-solid ${opening ? 'fa-circle-notch fa-spin' : 'fa-up-right-from-square'}`} style={{ fontSize: 12 }} />
        {opening ? 'Đang mở sheet…' : 'Mở Google Sheet'}
      </button>
    </div>
  )
}
