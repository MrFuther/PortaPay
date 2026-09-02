import React from 'react'

export default function Withdrawals({ withdrawals, onActionWithdrawal, isProcessing }) {
  const handleAction = (id, action) => {
    const actionText = action === 'APPROVE' ? 'MENSETUJUI' : 'MENOLAK'
    if (window.confirm(`Apakah Anda yakin ingin ${actionText} pengajuan penarikan dana ini?`)) {
      onActionWithdrawal(id, action)
    }
  }

  const getStatusBadge = (status) => {
    switch (status) {
      case 'PENDING':
        return <span className="badge badge-pending">⏳ PENDING</span>
      case 'COMPLETED':
      case 'APPROVED':
        return <span className="badge badge-completed">✅ DISETUJUI</span>
      case 'REJECTED':
        return <span className="badge badge-rejected">❌ DITOLAK</span>
      default:
        return <span className="badge">{status}</span>
    }
  }

  return (
    <div>
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>💸 Pengajuan Penarikan Dana</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Verifikasi transfer manual ke rekening penjual untuk pengajuan PENDING.
            </p>
          </div>
          <span className="badge badge-pending" style={{ fontSize: '13px', padding: '6px 12px' }}>
            {withdrawals.filter(w => w.status === 'PENDING').length} Menunggu Proses
          </span>
        </div>

        {withdrawals.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>💸</div>
            <h4 style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>Belum Ada Pengajuan Penarikan Dana</h4>
            <p style={{ fontSize: '13px' }}>Riwayat penarikan dana penjual akan muncul di sini.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID Pengajuan</th>
                  <th>Penjual</th>
                  <th>Nominal</th>
                  <th>Tujuan Rekening / E-Wallet</th>
                  <th>Atas Nama</th>
                  <th>Platform</th>
                  <th>Status</th>
                  <th>Tanggal Pengajuan</th>
                  <th style={{ textAlign: 'center' }}>Tindakan Admin</th>
                </tr>
              </thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: '600', color: '#818cf8' }}>
                      #{w.id.substring(0, 8)}...
                    </td>
                    <td>👤 {w.username}</td>
                    <td style={{ fontWeight: '700', color: '#10b981' }}>
                      Rp {Number(w.amount).toLocaleString('id-ID')}
                    </td>
                    <td>
                      <strong style={{ color: '#fff' }}>{w.bank_name}</strong> - <code>{w.account_number}</code>
                    </td>
                    <td style={{ fontWeight: '500' }}>{w.account_name}</td>
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        background: w.platform === 'DISCORD' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(6, 182, 212, 0.2)',
                        color: w.platform === 'DISCORD' ? '#818cf8' : '#22d3ee'
                      }}>
                        {w.platform}
                      </span>
                    </td>
                    <td>{getStatusBadge(w.status)}</td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(w.createdAt).toLocaleString('id-ID')}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {w.status === 'PENDING' ? (
                        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                          <button
                            id={`approve-withdraw-${w.id}`}
                            className="glass-button-success"
                            disabled={isProcessing}
                            onClick={() => handleAction(w.id, 'APPROVE')}
                          >
                            ✅ Setujui
                          </button>
                          <button
                            id={`reject-withdraw-${w.id}`}
                            className="glass-button-danger"
                            disabled={isProcessing}
                            onClick={() => handleAction(w.id, 'REJECT')}
                          >
                            ❌ Tolak
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {w.admin_note || 'Selesai'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
