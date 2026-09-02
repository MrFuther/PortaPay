import React from 'react'

export default function Disputes({ disputes, onResolveDispute, isProcessing }) {
  const handleAction = (disputeId, action) => {
    if (window.confirm(`Apakah Anda yakin ingin melakukan aksi ${action} pada transaksi ini?`)) {
      onResolveDispute(disputeId, action)
    }
  }

  return (
    <div>
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#fff' }}>⚠️ Transaksi Dalam Komplain</h3>
            <p style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Transaksi dibekukan. Pilih tindakan resolusi di bawah ini.
            </p>
          </div>
          <span className="badge badge-frozen" style={{ fontSize: '13px', padding: '6px 12px' }}>
            {disputes.length} Komplain Aktif
          </span>
        </div>

        {disputes.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: '48px', marginBottom: '12px' }}>🎉</div>
            <h4 style={{ color: 'var(--text-secondary)', fontSize: '16px' }}>Tidak Ada Komplain Aktif</h4>
            <p style={{ fontSize: '13px' }}>Semua transaksi rekber berjalan lancar tanpa pembekuan.</p>
          </div>
        ) : (
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID Transaksi</th>
                  <th>Penjual</th>
                  <th>Pembeli</th>
                  <th>Barang</th>
                  <th>Nominal</th>
                  <th>Platform</th>
                  <th>Tanggal Komplain</th>
                  <th style={{ textAlign: 'center' }}>Aksi Resolusi</th>
                </tr>
              </thead>
              <tbody>
                {disputes.map((trx) => (
                  <tr key={trx.id}>
                    <td style={{ fontFamily: 'monospace', fontWeight: '600', color: '#818cf8' }}>
                      #{trx.id.substring(0, 8)}...
                    </td>
                    <td>👤 {trx.seller_name}</td>
                    <td>👤 {trx.buyer_name}</td>
                    <td style={{ fontWeight: '500' }}>{trx.description}</td>
                    <td style={{ fontWeight: '700', color: '#fff' }}>
                      Rp {Number(trx.amount).toLocaleString('id-ID')}
                    </td>
                    <td>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '11px',
                        fontWeight: '700',
                        background: trx.platform === 'DISCORD' ? 'rgba(99, 102, 241, 0.2)' : 'rgba(6, 182, 212, 0.2)',
                        color: trx.platform === 'DISCORD' ? '#818cf8' : '#22d3ee'
                      }}>
                        {trx.platform}
                      </span>
                    </td>
                    <td style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                      {new Date(trx.updatedAt).toLocaleString('id-ID')}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                        <button
                          id={`resolve-seller-${trx.id}`}
                          className="glass-button-success"
                          disabled={isProcessing}
                          onClick={() => handleAction(trx.id, 'RELEASE_SELLER')}
                          title="Cairkan dana transaksi ke saldo penjual"
                        >
                          ✅ Cairkan ke Seller
                        </button>
                        <button
                          id={`refund-buyer-${trx.id}`}
                          className="glass-button-danger"
                          disabled={isProcessing}
                          onClick={() => handleAction(trx.id, 'REFUND_BUYER')}
                          title="Kembalikan dana transaksi ke pembeli"
                        >
                          ↩️ Refund ke Buyer
                        </button>
                      </div>
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
