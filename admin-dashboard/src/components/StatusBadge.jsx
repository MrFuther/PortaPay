import React from 'react'
export const statusLabels = { WAITING_BUYER: 'Menunggu pembeli', WAITING_PAYMENT: 'Menunggu pembayaran', PAID: 'Sudah dibayar', DELIVERED: 'Sudah diserahkan', COMPLETED_HOLDING: 'Masa hold', COMPLETED: 'Selesai', FROZEN: 'Sengketa', DISPUTED: 'Sengketa', CANCELLED: 'Dibatalkan', PENDING: 'Menunggu proses', REJECTED: 'Ditolak', APPROVED: 'Disetujui' }
export default function StatusBadge({ status }) { return <span className={`status-badge status-${status?.toLowerCase()}`}><i />{statusLabels[status] || status}</span> }
export const rupiah = value => `Rp ${Number(value || 0).toLocaleString('id-ID')}`
export const dateLabel = value => new Date(value).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta' })
