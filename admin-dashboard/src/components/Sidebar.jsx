import React from 'react'

export default function Sidebar({ activeTab, setActiveTab, onLogout, pendingWithdrawsCount, frozenCount }) {
  return (
    <aside className="sidebar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', paddingBottom: '24px', borderBottom: '1px solid var(--border-color)' }}>
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

      <nav style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
        <button
          id="nav-dashboard-btn"
          onClick={() => setActiveTab('dashboard')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'dashboard' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            color: activeTab === 'dashboard' ? '#818cf8' : 'var(--text-secondary)',
            fontWeight: activeTab === 'dashboard' ? '600' : '400',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s'
          }}
        >
          <span>📊 Overview Stats</span>
        </button>

        <button
          id="nav-disputes-btn"
          onClick={() => setActiveTab('disputes')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'disputes' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            color: activeTab === 'disputes' ? '#818cf8' : 'var(--text-secondary)',
            fontWeight: activeTab === 'disputes' ? '600' : '400',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s'
          }}
        >
          <span>⚠️ Komplain / Frozen</span>
          {frozenCount > 0 && (
            <span className="badge badge-frozen">{frozenCount}</span>
          )}
        </button>

        <button
          id="nav-withdrawals-btn"
          onClick={() => setActiveTab('withdrawals')}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderRadius: '10px',
            border: 'none',
            background: activeTab === 'withdrawals' ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
            color: activeTab === 'withdrawals' ? '#818cf8' : 'var(--text-secondary)',
            fontWeight: activeTab === 'withdrawals' ? '600' : '400',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'all 0.2s'
          }}
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
  )
}
