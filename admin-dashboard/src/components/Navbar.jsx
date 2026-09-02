import React from 'react'

export default function Navbar({ title, onRefresh, isRefreshing }) {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: '32px'
    }}>
      <div>
        <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#fff' }}>{title}</h1>
        <p style={{ fontSize: '14px', color: 'var(--text-secondary)' }}>
          Kelola transaksi rekber, resolusi sengketa, dan verifikasi pencairan dana.
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          id="refresh-data-btn"
          onClick={onRefresh}
          className="glass-button-secondary"
          disabled={isRefreshing}
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <span style={{ display: 'inline-block', transform: isRefreshing ? 'rotate(360deg)' : 'none', transition: 'transform 0.6s' }}>🔄</span>
          {isRefreshing ? 'Memperbarui...' : 'Refresh Data'}
        </button>
      </div>
    </header>
  )
}
