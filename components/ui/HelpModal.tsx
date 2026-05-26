'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useUser } from '@/contexts/UserContext'
import type { Role } from '@/types'

/* ── Tab definition ──────────────────────────────────────────── */
const TABS = [
  { id: 'overview', label: 'Tổng quan',     icon: 'fa-circle-info' },
  { id: 'admin',    label: 'Admin',          icon: 'fa-crown' },
  { id: 'manager',  label: 'Manager',        icon: 'fa-briefcase' },
  { id: 'user',     label: 'User',           icon: 'fa-user' },
  { id: 'viewer',   label: 'Viewer',         icon: 'fa-eye' },
  { id: 'flow',     label: 'Luồng duyệt',   icon: 'fa-arrows-spin' },
  { id: 'faq',      label: 'FAQ',            icon: 'fa-circle-question' },
] as const

type TabId = typeof TABS[number]['id']

const DEFAULT_TAB: Record<Role, TabId> = {
  admin:   'admin',
  manager: 'manager',
  user:    'user',
  viewer:  'viewer',
}

/* ── Shared inner styles ─────────────────────────────────────── */
const h2: React.CSSProperties = {
  fontFamily: 'var(--font-heading)',
  fontSize:   'var(--text-2xl)',
  fontWeight: 400,
  color:      'var(--text-primary)',
  marginBottom: '0.25rem',
}
const h3: React.CSSProperties = {
  fontFamily:   'var(--font-body)',
  fontSize:     'var(--text-xs)',
  fontWeight:   700,
  letterSpacing:'0.12em',
  textTransform:'uppercase',
  color:        'var(--text-muted)',
  margin:       '1.75rem 0 0.6rem',
}
const p: React.CSSProperties = {
  fontSize:   'var(--text-sm)',
  color:      'var(--text-secondary)',
  lineHeight: 1.7,
  margin:     '0 0 0.6rem',
}
const hr: React.CSSProperties = {
  border:     'none',
  borderTop:  '1px solid var(--border-light)',
  margin:     '1.25rem 0',
}
const noteBox = (color: string): React.CSSProperties => ({
  borderLeft:  `3px solid ${color}`,
  background:  'var(--bg-base)',
  padding:     '0.6rem 0.9rem',
  margin:      '0.75rem 0',
  fontSize:    'var(--text-sm)',
  color:       'var(--text-secondary)',
  lineHeight:  1.6,
})
const stepList: React.CSSProperties = {
  paddingLeft: '1.4rem',
  margin:      '0.4rem 0 0.9rem',
  fontSize:    'var(--text-sm)',
  color:       'var(--text-secondary)',
  lineHeight:  2,
}
const badge = (bg: string, color: string): React.CSSProperties => ({
  display:       'inline-block',
  padding:       '1px 8px',
  background:    bg,
  color:         color,
  fontSize:      '10px',
  fontWeight:    700,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  fontFamily:    'var(--font-body)',
  marginRight:   4,
  verticalAlign: 'middle',
})

/* ── Per-tab content ─────────────────────────────────────────── */
function TabOverview() {
  return (
    <>
      <h2 style={h2}>V-Invoice</h2>
      <p style={{ ...p, color: 'var(--text-muted)', marginBottom: '1.25rem' }}>
        Hệ thống quản lý invoice trang sức HP Jewelry
      </p>
      <div style={hr} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
        {[
          { icon: 'fa-file-import',  title: 'Tạo Invoice',         desc: 'Import từ Excel JM hoặc nhập tay' },
          { icon: 'fa-check-double', title: 'Duyệt Invoice',        desc: 'Draft → Pending → Approved → Invoiced' },
          { icon: 'fa-calculator',   title: 'Tính giá tự động',    desc: 'Gold value → HPUSA → CIF → Tag → FR' },
          { icon: 'fa-file-export',  title: 'Export & In ấn',       desc: 'Xuất Excel, in A4 theo phân quyền' },
        ].map(card => (
          <div key={card.title} style={{
            border:     '1px solid var(--border-light)',
            background: 'var(--bg-base)',
            padding:    '0.85rem 1rem',
            display:    'flex',
            gap:        '0.75rem',
            alignItems: 'flex-start',
          }}>
            <i className={`fa-solid ${card.icon}`} style={{ color: 'var(--text-muted)', marginTop: 2, fontSize: 15, minWidth: 18 }} />
            <div>
              <div style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>{card.title}</div>
              <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{card.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <p style={h3}>Phân quyền — Ai làm được gì?</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', marginBottom: '1rem' }}>
        <thead>
          <tr style={{ background: 'var(--bg-base)' }}>
            {['Vai trò', 'Tạo invoice', 'Duyệt', 'Khóa (Invoiced)', 'Quản trị hệ thống'].map(col => (
              <th key={col} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-base)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            { role: '🔑 Admin',   bg: '#fde8e8', vals: ['✓','✓','✓','✓'] },
            { role: '👔 Manager', bg: '#fef9c3', vals: ['✓','✓','✗','✗'] },
            { role: '👤 User',    bg: '#dcfce7', vals: ['✓ (của mình)','✗','✗','✗'] },
            { role: '👁️ Viewer',  bg: 'transparent', vals: ['✗','✗','✗','✗'] },
          ].map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-base)' }}>
              <td style={{ padding: '0.5rem 0.75rem', fontWeight: 600, borderBottom: '1px solid var(--border-light)' }}>{row.role}</td>
              {row.vals.map((v, j) => (
                <td key={j} style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', color: v === '✗' ? 'var(--text-muted)' : 'var(--color-success)' }}>{v}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div style={noteBox('var(--color-info)')}>
        <i className="fa-solid fa-circle-info" style={{ marginRight: 6, color: 'var(--color-info)' }} />
        Chọn tab tương ứng với vai trò của bạn để xem hướng dẫn chi tiết.
      </div>
    </>
  )
}

function TabAdmin() {
  return (
    <>
      <h2 style={h2}>Admin — Quản trị viên</h2>
      <p style={{ ...p, color: 'var(--text-muted)' }}>Toàn quyền hệ thống. Bao gồm mọi quyền của Manager và User.</p>
      <div style={hr} />

      <p style={h3}>⚙️ Cấu hình ban đầu (làm 1 lần)</p>

      <p style={{ ...p, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Bước 1 — Tạo tài khoản team</p>
      <ol style={stepList}>
        <li>Vào menu → <strong>Users</strong> → Bấm <strong>Add User</strong></li>
        <li>Nhập: Họ tên · Email · Mật khẩu · Chọn vai trò</li>
        <li>Bấm <strong>Save</strong> → Gửi thông tin đăng nhập cho nhân viên</li>
      </ol>

      <p style={{ ...p, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Bước 2 — Cấu hình Pricing Rule</p>
      <ol style={stepList}>
        <li>Vào menu → <strong>Pricing Rules</strong> → Bấm <strong>Add Rule</strong></li>
        <li>Đặt tên (VD: "Standard 2026") và nhập hệ số nhân:
          <ul style={{ paddingLeft: '1.2rem', marginTop: 4 }}>
            <li><strong>CIF Multiplier</strong>: HPUSA × hệ số → giá CIF (VD: 1.10)</li>
            <li><strong>Tag Multiplier</strong>: CIF × hệ số → giá Tag (VD: 1.25)</li>
            <li><strong>FR Multiplier</strong>: CIF × hệ số → giá FR (VD: 1.08)</li>
            <li><strong>Casting Loss %</strong>: % hao hụt đúc (VD: 5%)</li>
          </ul>
        </li>
        <li>Bật <strong>Active</strong> → Bấm <strong>Save</strong></li>
      </ol>
      <div style={noteBox('var(--color-warning)')}>
        <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6, color: 'var(--color-warning)' }} />
        Chỉ 1 Pricing Rule được Active tại một thời điểm.
      </div>

      <p style={{ ...p, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Bước 3 — Nhập danh mục sản phẩm (SKU)</p>
      <ol style={stepList}>
        <li>Vào menu → <strong>Products</strong> → Bấm <strong>Add Product</strong></li>
        <li>Nhập: mã SKU, mô tả, loại kim loại, các phí mặc định (labor/casting/design/resin/misc)</li>
        <li>Bấm <strong>Save</strong></li>
      </ol>
      <div style={noteBox('var(--color-warning)')}>
        <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6, color: 'var(--color-warning)' }} />
        SKU phải được nhập trước khi import Excel. Nếu SKU không tồn tại → Import sẽ báo lỗi.
      </div>

      <div style={hr} />
      <p style={h3}>☀️ Công việc hàng ngày</p>

      <p style={{ ...p, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 }}>Cập nhật giá vàng mỗi sáng</p>
      <ol style={stepList}>
        <li>Vào menu → <strong>Metal Rates</strong> → Bấm <strong>Add Rate</strong></li>
        <li>Nhập ngày hôm nay và các mức giá USD/gram:<br />
          24K · 18K White · 18K Yellow · 14K Yellow · Platinum · Silver · Palladium</li>
        <li>Bấm <strong>Save</strong></li>
      </ol>
      <div style={noteBox('var(--color-info)')}>
        <i className="fa-solid fa-circle-info" style={{ marginRight: 6, color: 'var(--color-info)' }} />
        Lấy giá từ SJC hoặc Kitco. Mỗi ngày nhập 1 dòng. Invoice "ghi nhớ" giá tại ngày tạo — thay đổi giá sau không ảnh hưởng invoice cũ.
      </div>

      <p style={{ ...p, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, marginTop: '1rem' }}>Khóa invoice (Mark as Invoiced)</p>
      <ol style={stepList}>
        <li>Mở invoice đang ở trạng thái <span style={badge('var(--color-success)', '#fff')}>Approved</span></li>
        <li>Trong thanh trạng thái → Bấm <strong>Mark as Invoiced</strong></li>
        <li>Đọc cảnh báo → Xác nhận</li>
      </ol>
      <div style={noteBox('var(--color-danger)')}>
        <i className="fa-solid fa-lock" style={{ marginRight: 6, color: 'var(--color-danger)' }} />
        <strong>Không thể hoàn tác.</strong> Sau khi Invoiced, hệ thống tự lưu toàn bộ dữ liệu và khóa — không ai sửa được nữa.
      </div>
    </>
  )
}

function TabManager() {
  return (
    <>
      <h2 style={h2}>Manager — Quản lý</h2>
      <p style={{ ...p, color: 'var(--text-muted)' }}>Tạo invoice, kiểm tra, và duyệt invoice từ nhân viên.</p>
      <div style={hr} />

      <p style={h3}>📊 Xem invoice chờ duyệt</p>
      <ol style={stepList}>
        <li>Vào <strong>Dashboard</strong> → Bấm vào ô <strong>"Pending Approval: N"</strong></li>
        <li>Hoặc: Vào <strong>Invoices</strong> → Lọc <strong>Status = Pending Approval</strong></li>
      </ol>

      <p style={h3}>✅ Duyệt invoice</p>
      <ol style={stepList}>
        <li>Mở invoice cần duyệt</li>
        <li>Kiểm tra tab <strong>JM Form View</strong> — xem toàn bộ dữ liệu 15 cột</li>
        <li>Lưu ý: Dòng có chữ <span style={{ color: '#DC2626', fontWeight: 700 }}>"ba sao"</span> trong cột Notes sẽ hiển thị đỏ → Kiểm tra kỹ</li>
        <li>Bấm trong thanh trạng thái:
          <ul style={{ paddingLeft: '1.2rem', marginTop: 4 }}>
            <li><strong>Approve</strong> → Invoice chuyển sang <span style={badge('var(--color-success)', '#fff')}>Approved</span></li>
            <li><strong>Return to Draft</strong> → Viết lý do → Nhân viên sửa lại</li>
          </ul>
        </li>
      </ol>

      <p style={h3}>✏️ Tạo và chỉnh sửa invoice</p>
      <p style={p}>Manager có thể tạo và chỉnh sửa <strong>tất cả invoice</strong> (không chỉ invoice của mình). Xem tab <strong>User</strong> để biết cách tạo và nhập liệu.</p>

      <div style={noteBox('var(--color-info)')}>
        <i className="fa-solid fa-circle-info" style={{ marginRight: 6, color: 'var(--color-info)' }} />
        Manager <strong>không thể</strong> Mark as Invoiced. Chỉ Admin mới khóa được invoice.
      </div>
    </>
  )
}

function TabUser() {
  return (
    <>
      <h2 style={h2}>User — Nhân viên</h2>
      <p style={{ ...p, color: 'var(--text-muted)' }}>Tạo, chỉnh sửa và nộp invoice để duyệt.</p>
      <div style={hr} />

      <p style={h3}>📂 Cách 1 — Import từ Excel (phổ biến nhất)</p>
      <ol style={stepList}>
        <li>Vào menu → <strong>Import</strong></li>
        <li>Chọn invoice cần import vào (hoặc tạo invoice mới trước)</li>
        <li><strong>Kéo thả</strong> hoặc <strong>Browse</strong> file Excel (.xlsx, .xls)</li>
        <li>Hệ thống kiểm tra từng dòng:
          <ul style={{ paddingLeft: '1.2rem', marginTop: 4 }}>
            <li>✅ Dòng hợp lệ → bảng xanh</li>
            <li>❌ Dòng lỗi → bảng đỏ kèm lý do (SKU không tồn tại, số lượng sai…)</li>
          </ul>
        </li>
        <li>Bấm <strong>Import N Valid Rows</strong> → Dữ liệu được nạp vào invoice</li>
      </ol>
      <div style={noteBox('var(--color-info)')}>
        <i className="fa-solid fa-circle-info" style={{ marginRight: 6, color: 'var(--color-info)' }} />
        <strong>Định dạng Excel JM chuẩn:</strong> Cột A: Store · B: Location · C: SKU · D: SO/MO · E: Vendor Model · F: Description · G: Qty · H: Total Weight · I: Gold Weight · J: Metal Type · K: Class · L: Sub Class
      </div>

      <p style={h3}>✍️ Cách 2 — Tạo thủ công</p>
      <ol style={stepList}>
        <li>Vào <strong>Invoices</strong> → Bấm <strong>New Invoice</strong></li>
        <li>Nhập: PO Number, MR Number, Store, chọn Metal Rate → <strong>Save</strong></li>
        <li>Mở invoice → Bấm <strong>Add Item</strong> để thêm từng dòng sản phẩm</li>
      </ol>

      <p style={h3}>🔍 Kiểm tra và chỉnh sửa</p>
      <p style={{ ...p, fontWeight: 600, marginBottom: 4 }}>Tab JM Form View</p>
      <ul style={stepList}>
        <li>Xem toàn bộ invoice dạng spreadsheet 15 cột</li>
        <li>Cột <strong>SKU JWMold</strong> luôn có nền <span style={{ background: '#FEF3C7', padding: '0 5px', fontFamily: 'var(--font-mono)' }}>vàng</span></li>
        <li>Cột <strong>Notes</strong> hiển thị <span style={{ color: '#DC2626', fontWeight: 700 }}>đỏ</span> nếu có ghi "ba sao"</li>
        <li>Các cột giá (Gold Value, HPUSA, CIF) được tính tự động</li>
      </ul>
      <p style={{ ...p, fontWeight: 600, marginBottom: 4 }}>Tab Detail View</p>
      <ul style={stepList}>
        <li>Click vào ô để sửa: trọng lượng, số lượng, phí…</li>
        <li>Hệ thống <strong>tính lại giá ngay lập tức</strong> sau mỗi thay đổi</li>
        <li>Thêm/sửa/xóa đá quý (gem) cho từng sản phẩm</li>
      </ul>

      <p style={h3}>📤 Gửi duyệt</p>
      <ol style={stepList}>
        <li>Kiểm tra xong → Trong thanh trạng thái, bấm <strong>Submit for Approval</strong></li>
        <li>Viết ghi chú nếu cần (VD: "Kiểm tra lại dòng 3") → Bấm <strong>Confirm</strong></li>
        <li>Invoice chuyển sang <span style={badge('#fef3c7', '#92400e')}>Pending Approval</span></li>
      </ol>
      <div style={noteBox('var(--color-warning)')}>
        <i className="fa-solid fa-triangle-exclamation" style={{ marginRight: 6, color: 'var(--color-warning)' }} />
        Sau khi Submit, bạn <strong>không sửa được</strong> cho đến khi Manager trả về Draft.
      </div>

      <p style={h3}>↩️ Nếu invoice bị trả về</p>
      <ol style={stepList}>
        <li>Invoice quay về trạng thái <span style={badge('var(--bg-muted)', 'var(--text-secondary)')}>Draft</span></li>
        <li>Xem ghi chú lý do của Manager trong phần lịch sử</li>
        <li>Sửa những gì được yêu cầu → Submit lại</li>
      </ol>
    </>
  )
}

function TabViewer() {
  return (
    <>
      <h2 style={h2}>Viewer — Xem báo cáo</h2>
      <p style={{ ...p, color: 'var(--text-muted)' }}>Quyền chỉ xem và xuất Excel. Không tạo, sửa hay duyệt được.</p>
      <div style={hr} />

      <p style={h3}>📋 Viewer có thể làm gì?</p>
      <ul style={stepList}>
        <li>Xem danh sách invoice tại <strong>Invoices</strong></li>
        <li>Mở và đọc chi tiết từng invoice</li>
        <li>Xuất file Excel (nhưng không có cột giá)</li>
        <li>In invoice ra giấy</li>
        <li>Xem thống kê tại <strong>Dashboard</strong></li>
      </ul>

      <p style={h3}>👁️ Viewer thấy những cột nào?</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', marginBottom: '1rem' }}>
        <thead>
          <tr style={{ background: 'var(--bg-base)' }}>
            {['Thông tin', 'Viewer thấy?'].map(col => (
              <th key={col} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-base)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[
            ['SKU, Số lượng, Trọng lượng, Loại kim loại', '✓'],
            ['Gold Value USD, HPUSA, CIF Price',           '✗'],
            ['Tag Price, FR Price',                        '✗'],
            ['Sell Price, Discount %',                     '✗'],
          ].map(([info, val], i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-base)' }}>
              <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>{info}</td>
              <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', color: val === '✗' ? 'var(--text-muted)' : 'var(--color-success)' }}>{val}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div style={noteBox('var(--color-info)')}>
        <i className="fa-solid fa-circle-info" style={{ marginRight: 6, color: 'var(--color-info)' }} />
        Khi xuất Excel, file cũng sẽ không có các cột giá — chỉ có thông tin sản phẩm cơ bản.
      </div>
    </>
  )
}

function TabFlow() {
  const steps = [
    { from: null,               to: 'draft',            who: 'User / Manager / Admin', action: 'Tạo invoice' },
    { from: 'draft',            to: 'pending_approval', who: 'User / Manager / Admin', action: 'Submit for Approval' },
    { from: 'pending_approval', to: 'approved',         who: 'Manager / Admin',        action: 'Approve' },
    { from: 'pending_approval', to: 'draft',            who: 'Manager / Admin',        action: 'Return to Draft' },
    { from: 'approved',         to: 'pending_approval', who: 'Admin',                  action: 'Return for Review' },
    { from: 'approved',         to: 'invoiced',         who: 'Admin',                  action: 'Mark as Invoiced ⚠️' },
  ]

  const statusStyle = (s: string): React.CSSProperties => {
    if (s === 'draft')            return badge('var(--bg-muted)', 'var(--text-secondary)')
    if (s === 'pending_approval') return badge('#fef3c7', '#92400e')
    if (s === 'approved')         return badge('#dcfce7', '#14532d')
    if (s === 'invoiced')         return { ...badge('var(--text-primary)', 'var(--text-inverse)'), fontWeight: 700 }
    return {}
  }

  return (
    <>
      <h2 style={h2}>Luồng duyệt invoice</h2>
      <p style={{ ...p, color: 'var(--text-muted)' }}>Quy trình phê duyệt từng bước theo vai trò.</p>
      <div style={hr} />

      <p style={h3}>🔄 Sơ đồ trạng thái</p>

      {/* Visual flow */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '0.75rem 0 1.5rem', padding: '1rem', background: 'var(--bg-base)', border: '1px solid var(--border-light)' }}>
        {(['draft', '→', 'pending_approval', '→', 'approved', '→', 'invoiced 🔒'] as string[]).map((s, i) => (
          s === '→'
            ? <i key={i} className="fa-solid fa-arrow-right" style={{ color: 'var(--text-muted)', fontSize: 10 }} />
            : <span key={i} style={statusStyle(s.replace(' 🔒', ''))}>{s.replace('_', ' ')}</span>
        ))}
      </div>

      <p style={h3}>📋 Bảng chuyển đổi trạng thái</p>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--text-xs)', marginBottom: '1.25rem' }}>
        <thead>
          <tr style={{ background: 'var(--bg-base)' }}>
            {['Từ', 'Sang', 'Người thực hiện', 'Hành động'].map(col => (
              <th key={col} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', borderBottom: '1px solid var(--border-base)', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {steps.map((s, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-base)' }}>
              <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>
                {s.from ? <span style={statusStyle(s.from)}>{s.from.replace('_', ' ')}</span> : <span style={{ color: 'var(--text-muted)' }}>—</span>}
              </td>
              <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)' }}>
                <span style={statusStyle(s.to)}>{s.to.replace('_', ' ')}</span>
              </td>
              <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', color: 'var(--text-secondary)' }}>{s.who}</td>
              <td style={{ padding: '0.5rem 0.75rem', borderBottom: '1px solid var(--border-light)', fontWeight: 500 }}>{s.action}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={h3}>🔒 Khi invoice bị khóa (Invoiced)</p>
      <ul style={stepList}>
        <li>Hệ thống tự động lưu <strong>snapshot</strong> toàn bộ dữ liệu (sản phẩm, giá, đá quý, giá vàng, hệ số nhân)</li>
        <li>Invoice <strong>không thể sửa</strong> dù giá vàng sau này thay đổi</li>
        <li>Dữ liệu snapshot là bằng chứng bất biến cho kế toán và kiểm toán</li>
        <li>Vẫn có thể xem, xuất Excel, và in</li>
      </ul>

      <div style={noteBox('var(--color-danger)')}>
        <i className="fa-solid fa-lock" style={{ marginRight: 6, color: 'var(--color-danger)' }} />
        Mark as Invoiced <strong>không thể hoàn tác</strong>. Hãy kiểm tra kỹ trước khi thực hiện.
      </div>
    </>
  )
}

function TabFAQ() {
  const faqs = [
    {
      q: 'Import Excel bị lỗi "SKU not found"?',
      a: 'SKU trong file Excel chưa được nhập vào danh mục Products. Nhờ Admin thêm SKU đó vào menu → Products trước, sau đó import lại.',
    },
    {
      q: 'Tôi đã Submit nhưng muốn sửa lại?',
      a: 'Sau khi Submit, bạn không tự sửa được. Liên hệ Manager để "Return to Draft" — invoice sẽ trở lại DRAFT để bạn chỉnh sửa.',
    },
    {
      q: 'Giá tính sai, tôi có thể sửa không?',
      a: 'Giá được tính tự động từ trọng lượng × giá vàng × hệ số. Để sửa: (1) sửa trọng lượng/phí trong Detail View — giá tự cập nhật; hoặc (2) nhờ Admin cập nhật giá vàng ngày hôm đó.',
    },
    {
      q: 'Invoice đã INVOICED, tôi cần sửa thì làm sao?',
      a: 'Invoice đã INVOICED không thể sửa được. Cần tạo invoice mới để thay thế.',
    },
    {
      q: 'Tag Price và FR Price tôi không thấy?',
      a: 'Các cột này chỉ hiển thị cho Manager và Admin. Nếu bạn là User hoặc Viewer, các cột này bị ẩn theo phân quyền.',
    },
    {
      q: 'In invoice thì có giữ màu SKU vàng không?',
      a: 'Có. Trang in được tối ưu cho máy in — màu nền vàng của cột SKU và chữ đỏ "ba sao" sẽ giữ nguyên khi in.',
    },
    {
      q: '"Ba sao" nghĩa là gì?',
      a: 'Là ký hiệu nội bộ đánh dấu dòng sản phẩm cần chú ý đặc biệt. Khi cột Notes chứa chữ "ba sao" (không phân biệt hoa thường), toàn bộ dòng đó sẽ hiển thị màu đỏ trong JM Form View.',
    },
    {
      q: 'Dòng lỗi khi import có block toàn bộ file không?',
      a: 'Không. Partial import được hỗ trợ: dòng hợp lệ được import, dòng lỗi hiển thị bảng đỏ kèm lý do. Bạn có thể import phần hợp lệ trước, sửa file rồi import lại phần còn lại.',
    },
  ]

  return (
    <>
      <h2 style={h2}>Câu hỏi thường gặp</h2>
      <p style={{ ...p, color: 'var(--text-muted)' }}>FAQ cho tất cả vai trò.</p>
      <div style={hr} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {faqs.map((faq, i) => (
          <div key={i} style={{ border: '1px solid var(--border-light)', background: 'var(--bg-base)', padding: '0.85rem 1rem' }}>
            <p style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-primary)', margin: '0 0 0.35rem' }}>
              <i className="fa-regular fa-circle-question" style={{ marginRight: 7, color: 'var(--color-info)' }} />
              {faq.q}
            </p>
            <p style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.65, paddingLeft: 22 }}>
              {faq.a}
            </p>
          </div>
        ))}
      </div>
    </>
  )
}

const TAB_CONTENT: Record<TabId, React.ReactNode> = {
  overview: <TabOverview />,
  admin:    <TabAdmin />,
  manager:  <TabManager />,
  user:     <TabUser />,
  viewer:   <TabViewer />,
  flow:     <TabFlow />,
  faq:      <TabFAQ />,
}

/* ── Main component ──────────────────────────────────────────── */
interface Props { onClose: () => void }

export function HelpModal({ onClose }: Props) {
  const { user }    = useUser()
  const [tab, setTab] = useState<TabId>(() => DEFAULT_TAB[user.role] ?? 'overview')
  const [mounted, setMounted] = useState(false)
  const overlayRef  = useRef<HTMLDivElement>(null)
  const contentRef  = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  /* Scroll content to top when tab changes */
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 })
  }, [tab])

  if (!mounted) return null

  return createPortal(
    <div
      ref={overlayRef}
      style={{
        position:            'fixed',
        inset:               0,
        background:          'rgba(42,39,37,0.65)',
        backdropFilter:      'blur(4px)',
        WebkitBackdropFilter:'blur(4px)',
        display:             'flex',
        alignItems:          'center',
        justifyContent:      'center',
        zIndex:              9999,
        padding:             '1.25rem',
        animation:           'fadeIn 0.18s ease-out both',
      }}
      onClick={e => { if (e.target === overlayRef.current) onClose() }}
    >
      <div style={{
        background: 'var(--bg-surface)',
        border:     '1px solid var(--border-base)',
        width:      '100%',
        maxWidth:   960,
        height:     '88vh',
        display:    'flex',
        flexDirection: 'column',
        animation:  'slideUpFade 0.22s ease-out both',
        overflow:   'hidden',
      }}>

        {/* ── Header ── */}
        <div style={{
          display:        'flex',
          justifyContent: 'space-between',
          alignItems:     'center',
          padding:        '1rem 1.5rem',
          borderBottom:   '1px solid var(--border-light)',
          background:     'var(--bg-muted)',
          flexShrink:     0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <i className="fa-solid fa-circle-question" style={{ color: 'var(--text-muted)', fontSize: 16 }} />
            <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'var(--text-xl)', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
              Hướng dẫn sử dụng
            </h2>
            <span style={{
              fontSize:       '10px',
              fontWeight:     600,
              letterSpacing:  '0.12em',
              textTransform:  'uppercase',
              color:          'var(--text-muted)',
              border:         '1px solid var(--border-base)',
              padding:        '1px 7px',
              fontFamily:     'var(--font-body)',
            }}>
              {user.role}
            </span>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 16, padding: 6, lineHeight: 1, transition: 'color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
          >
            <i className="fa-solid fa-xmark" />
          </button>
        </div>

        {/* ── Body: sidebar + content ── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

          {/* Sidebar */}
          <div style={{
            width:          200,
            flexShrink:     0,
            borderRight:    '1px solid var(--border-light)',
            background:     'var(--bg-base)',
            overflowY:      'auto',
            padding:        '0.5rem 0',
          }}>
            {TABS.map(t => {
              const isActive = tab === t.id
              const isMyRole = t.id === user.role
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  style={{
                    display:        'flex',
                    alignItems:     'center',
                    gap:            8,
                    width:          '100%',
                    padding:        '0.6rem 1rem',
                    border:         'none',
                    borderLeft:     isActive ? '2px solid var(--border-strong)' : '2px solid transparent',
                    background:     isActive ? 'var(--bg-surface)' : 'transparent',
                    color:          isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontFamily:     'var(--font-body)',
                    fontSize:       'var(--text-xs)',
                    fontWeight:     isActive ? 600 : 400,
                    letterSpacing:  '0.06em',
                    textTransform:  'uppercase',
                    cursor:         'pointer',
                    textAlign:      'left',
                    transition:     'background 0.12s, color 0.12s',
                    position:       'relative',
                  }}
                  onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'var(--bg-hover)'; e.currentTarget.style.color = 'var(--text-primary)' } }}
                  onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' } }}
                >
                  <i className={`fa-solid ${t.icon}`} style={{ fontSize: 11, width: 14, textAlign: 'center', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)' }} />
                  {t.label}
                  {isMyRole && (
                    <span style={{
                      marginLeft:    'auto',
                      fontSize:       9,
                      background:    'var(--border-strong)',
                      color:         'var(--text-inverse)',
                      padding:       '1px 5px',
                      letterSpacing: '0.06em',
                      fontWeight:    700,
                    }}>YOU</span>
                  )}
                </button>
              )
            })}
          </div>

          {/* Content */}
          <div ref={contentRef} style={{ flex: 1, overflowY: 'auto', padding: '1.75rem 2rem' }}>
            {TAB_CONTENT[tab]}
          </div>
        </div>

      </div>
    </div>,
    document.body,
  )
}
