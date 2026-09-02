import React from 'react'

export default function Navbar({ title, onRefresh, isRefreshing, setMobileMenuOpen }) {
  return (
    <header className="page-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Mobile Hamburger Toggle Button */}
        <button
          className="mobile-hamburger-btn"
          onClick={() => setMobileMenuOpen(true)}
          aria-label="Open Menu"
        >
          ☰
        </button>

        <div>
          <h1 className="header-title">{title}</h1>
          <p className="header-subtitle">
            Kelola transaksi rekber, resolusi sengketa, dan verifikasi pencairan dana.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button
          id="refresh-data-btn"
          onClick={onRefresh}
          className="glass-button-secondary refresh-btn"
          disabled={isRefreshing}
        >
          <span style={{ display: 'inline-block', transform: isRefreshing ? 'rotate(360deg)' : 'none', transition: 'transform 0.6s' }}>🔄</span>
          <span className="refresh-btn-text">{isRefreshing ? 'Memperbarui...' : 'Refresh'}</span>
        </button>
      </div>
    </header>
  )
}
