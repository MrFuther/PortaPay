import React from 'react'

export default function Sidebar({
  activeTab,
  setActiveTab,
  onLogout,
  pendingWithdrawsCount,
  frozenCount,
  mobileMenuOpen,
  setMobileMenuOpen
}) {
  const handleNavClick = (tab) => {
    setActiveTab(tab)
    if (setMobileMenuOpen) setMobileMenuOpen(false)
  }

  return (
    <>
      {/* Mobile Drawer Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Desktop Sidebar / Mobile Slide-Over Drawer */}
      <aside className={`sidebar ${mobileMenuOpen ? 'mobile-open' : ''}`}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '20px', borderBottom: '1px solid var(--border-color)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #6366f1, #06b6d4)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '20px',
              fontWeight: 'bold'
            }}>
              🛡️
            </div>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>PortaPay</h2>
              <span style={{ fontSize: '11px', color: 'var(--accent-secondary)', fontWeight: '600', letterSpacing: '0.5px' }}>ADMIN PANEL</span>
            </div>
          </div>

          <button
            className="mobile-close-btn"
            onClick={() => setMobileMenuOpen(false)}
          >
            ✕
          </button>
        </div>

        <nav style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
          <button
            id="nav-dashboard-btn"
            onClick={() => handleNavClick('dashboard')}
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
          >
            <span>📊 Overview Stats</span>
          </button>

          <button
            id="nav-disputes-btn"
            onClick={() => handleNavClick('disputes')}
            className={`nav-item ${activeTab === 'disputes' ? 'active' : ''}`}
          >
            <span>⚠️ Komplain / Frozen</span>
            {frozenCount > 0 && (
              <span className="badge badge-frozen">{frozenCount}</span>
            )}
          </button>

          <button
            id="nav-withdrawals-btn"
            onClick={() => handleNavClick('withdrawals')}
            className={`nav-item ${activeTab === 'withdrawals' ? 'active' : ''}`}
          >
            <span>💸 Penarikan Dana</span>
            {pendingWithdrawsCount > 0 && (
              <span className="badge badge-pending">{pendingWithdrawsCount}</span>
            )}
          </button>
        </nav>

        <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-color)' }}>
          <button
            id="logout-btn"
            onClick={onLogout}
            className="glass-button-secondary"
            style={{ width: '100%', justifyContent: 'center' }}
          >
            🚪 Keluar Admin
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar (Native App-Like Feeling) */}
      <nav className="mobile-bottom-nav">
        <button
          onClick={() => setActiveTab('dashboard')}
          className={`bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
        >
          <span style={{ fontSize: '18px' }}>📊</span>
          <span>Stats</span>
        </button>

        <button
          onClick={() => setActiveTab('disputes')}
          className={`bottom-nav-item ${activeTab === 'disputes' ? 'active' : ''}`}
        >
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <span>Komplain</span>
          {frozenCount > 0 && (
            <span className="bottom-nav-badge badge-frozen">{frozenCount}</span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`bottom-nav-item ${activeTab === 'withdrawals' ? 'active' : ''}`}
        >
          <span style={{ fontSize: '18px' }}>💸</span>
          <span>Withdraw</span>
          {pendingWithdrawsCount > 0 && (
            <span className="bottom-nav-badge badge-pending">{pendingWithdrawsCount}</span>
          )}
        </button>
      </nav>
    </>
  )
}
