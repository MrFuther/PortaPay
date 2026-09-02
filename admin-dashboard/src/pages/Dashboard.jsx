import React from 'react'

export default function Dashboard({ stats }) {
  const statCards = [
    {
      title: 'Total Volume Transaksi',
      value: `Rp ${(stats.totalVolume || 0).toLocaleString('id-ID')}`,
      icon: '💰',
      color: '#6366f1',
      bgGradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.2), rgba(99, 102, 241, 0.05))'
    },
    {
      title: 'Transaksi Aktif',
      value: stats.activeDeals || 0,
      icon: '⏳',
      color: '#06b6d4',
      bgGradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.2), rgba(6, 182, 212, 0.05))'
    },
    {
      title: 'Komplain / Frozen',
      value: stats.frozenDisputes || 0,
      icon: '⚠️',
      color: '#ef4444',
      bgGradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.2), rgba(239, 68, 68, 0.05))'
    },
    {
      title: 'Withdrawals Pending',
      value: stats.pendingWithdrawals || 0,
      icon: '💸',
      color: '#f59e0b',
      bgGradient: 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(245, 158, 11, 0.05))'
    }
  ]

  return (
    <div>
      {/* Stat Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '20px',
        marginBottom: '32px'
      }}>
        {statCards.map((card, index) => (
          <div
            key={index}
            className="glass-panel"
            style={{
              padding: '24px',
              background: card.bgGradient,
              position: 'relative',
              overflow: 'hidden'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-secondary)' }}>{card.title}</span>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '20px'
              }}>
                {card.icon}
              </div>
            </div>
            <div style={{ fontSize: '28px', fontWeight: '800', color: '#fff' }}>
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {/* System Status Panel */}
      <div className="glass-panel" style={{ padding: '28px' }}>
        <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff', marginBottom: '16px' }}>
          🛡️ Informasi Operasional Bot PortaPay
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Integration Mode</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#10b981' }}>n8n Email Mutasi Payment (DANA/SeaBank)</div>
          </div>

          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Total Successful Deals</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#6366f1' }}>{stats.totalCompletedDeals || 0} Transaksi Selesai</div>
          </div>

          <div style={{ padding: '16px', borderRadius: '12px', background: 'rgba(15, 23, 42, 0.6)', border: '1px solid var(--border-color)' }}>
            <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Status Engine</div>
            <div style={{ fontSize: '16px', fontWeight: '700', color: '#06b6d4' }}>🟢 Active & Monitoring</div>
          </div>
        </div>
      </div>
    </div>
  )
}
