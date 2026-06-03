'use client'

import { DriveImage } from '@/components/invoice/DriveImage'

interface Props {
  label:       string
  value:       string
  onChange:    (v: string) => void
  inputStyle?: React.CSSProperties
  labelStyle?: React.CSSProperties
}

export function DriveImageInput({ label, value, onChange, inputStyle, labelStyle }: Props) {
  const defaultLabel: React.CSSProperties = {
    display: 'block', fontSize: 'var(--text-xs)', textTransform: 'uppercase',
    letterSpacing: '0.1em', color: 'var(--text-secondary)', marginBottom: 3, fontWeight: 500,
  }
  const defaultInput: React.CSSProperties = {
    width: '100%', border: '1px solid var(--border-base)', borderRadius: 0,
    background: 'var(--bg-surface)', padding: '6px 8px',
    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--text-primary)',
    outline: 'none',
  }

  return (
    <div>
      <label style={labelStyle ?? defaultLabel}>{label}</label>
      <input
        style={inputStyle ?? defaultInput}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="https://drive.google.com/file/d/... hoặc URL ảnh"
      />
      {value && (
        <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
          <DriveImage url={value} alt="preview" size={56} />
          {value && (
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
              {value.includes('drive.google.com') ? '↑ Google Drive link' : '↑ Direct URL'}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
