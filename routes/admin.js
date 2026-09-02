const express = require('express')
const router = express.Router()
const { Op } = require('sequelize')
const Transaction = require('../db/models/transaction')
const User = require('../db/models/user')
const Withdrawal = require('../db/models/withdrawal')
const NotificationService = require('../services/notification')
require('dotenv').config()

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345'

// Middleware Autentikasi Admin Simple
function adminAuth(req, res, next) {
  const authHeader = req.headers.authorization
  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Autentikasi admin diperlukan.' })
  }

  const token = authHeader.replace('Bearer ', '').trim()
  if (token !== ADMIN_PASSWORD) {
    return res.status(403).json({ success: false, message: 'Token admin tidak valid.' })
  }

  next()
}

// 1. POST /api/admin/login
router.post('/login', express.json(), (req, res) => {
  const { password } = req.body
  if (password === ADMIN_PASSWORD) {
    return res.json({ success: true, token: ADMIN_PASSWORD })
  }
  return res.status(401).json({ success: false, message: 'Password Admin salah.' })
})

// 2. GET /api/admin/stats (Protected)
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const totalVolumeResult = await Transaction.sum('amount', { where: { status: 'COMPLETED' } })
    const totalVolume = Number(totalVolumeResult || 0)

    const activeDeals = await Transaction.count({
      where: {
        status: { [Op.in]: ['WAITING_BUYER', 'WAITING_PAYMENT', 'PAID', 'DELIVERED', 'COMPLETED_HOLDING'] }
      }
    })

    const frozenDisputes = await Transaction.count({ where: { status: 'FROZEN' } })
    const pendingWithdrawals = await Withdrawal.count({ where: { status: 'PENDING' } })
    const totalCompletedDeals = await Transaction.count({ where: { status: 'COMPLETED' } })

    return res.json({
      success: true,
      stats: {
        totalVolume,
        activeDeals,
        frozenDisputes,
        pendingWithdrawals,
        totalCompletedDeals
      }
    })
  } catch (error) {
    console.error('Error fetching admin stats:', error)
    return res.status(500).json({ success: false, message: 'Gagal mengambil data statistik.' })
  }
})

// 3. GET /api/admin/disputes (Protected)
router.get('/disputes', adminAuth, async (req, res) => {
  try {
    const disputes = await Transaction.findAll({
      where: { status: 'FROZEN' },
      order: [['updatedAt', 'DESC']]
    })

    // Populate seller & buyer usernames
    const populated = await Promise.all(disputes.map(async (trx) => {
      const seller = await User.findByPk(trx.seller_id)
      const buyer = trx.buyer_id ? await User.findByPk(trx.buyer_id) : null
      return {
        ...trx.toJSON(),
        seller_name: seller ? seller.username : 'Unknown',
        buyer_name: buyer ? buyer.username : '-'
      }
    }))

    return res.json({ success: true, disputes: populated })
  } catch (error) {
    console.error('Error fetching admin disputes:', error)
    return res.status(500).json({ success: false, message: 'Gagal mengambil data komplain.' })
  }
})

// 4. POST /api/admin/disputes/:id/resolve (Protected)
router.post('/disputes/:id/resolve', adminAuth, express.json(), async (req, res) => {
  try {
    const { id } = req.params
    const { action, note } = req.body // action: 'RELEASE_SELLER' | 'REFUND_BUYER'

    const trx = await Transaction.findByPk(id)
    if (!trx) return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan.' })
    if (trx.status !== 'FROZEN') {
      return res.status(400).json({ success: false, message: 'Transaksi ini tidak dalam status FROZEN.' })
    }

    const seller = await User.findByPk(trx.seller_id)
    const buyer = trx.buyer_id ? await User.findByPk(trx.buyer_id) : null

    if (action === 'RELEASE_SELLER') {
      await trx.update({ status: 'COMPLETED' })

      const sellerAmount = trx.fee_type === 'EXCLUDE'
        ? Number(trx.amount)
        : Number(trx.amount) - Number(trx.fee)

      if (seller) {
        await seller.update({
          available_balance: Number(seller.available_balance) + sellerAmount,
          total_deals: seller.total_deals + 1
        })
      }

      await NotificationService.notifyCompleted(trx, seller, buyer)

      return res.json({
        success: true,
        message: `Komplain berhasil diselesaikan. Dana Rp ${sellerAmount.toLocaleString('id-ID')} dicairkan ke penjual.`
      })
    } else if (action === 'REFUND_BUYER') {
      await trx.update({ status: 'CANCELLED' })

      const refundAmount = trx.amount_with_code ? Number(trx.amount_with_code) : Number(trx.amount)
      if (buyer) {
        await buyer.update({
          available_balance: Number(buyer.available_balance) + refundAmount
        })
      }

      return res.json({
        success: true,
        message: `Komplain berhasil diselesaikan. Dana Rp ${refundAmount.toLocaleString('id-ID')} dikembalikan ke pembeli.`
      })
    } else {
      return res.status(400).json({ success: false, message: 'Aksi resolusi tidak valid.' })
    }
  } catch (error) {
    console.error('Error resolving dispute:', error)
    return res.status(500).json({ success: false, message: 'Gagal memproses resolusi komplain.' })
  }
})

// 5. GET /api/admin/withdrawals (Protected)
router.get('/withdrawals', adminAuth, async (req, res) => {
  try {
    const withdrawals = await Withdrawal.findAll({
      order: [['createdAt', 'DESC']]
    })

    const populated = await Promise.all(withdrawals.map(async (w) => {
      const user = await User.findByPk(w.user_id)
      return {
        ...w.toJSON(),
        username: user ? user.username : 'Unknown'
      }
    }))

    return res.json({ success: true, withdrawals: populated })
  } catch (error) {
    console.error('Error fetching admin withdrawals:', error)
    return res.status(500).json({ success: false, message: 'Gagal mengambil data penarikan dana.' })
  }
})

// 6. POST /api/admin/withdrawals/:id/action (Protected)
router.post('/withdrawals/:id/action', adminAuth, express.json(), async (req, res) => {
  try {
    const { id } = req.params
    const { action, note } = req.body // action: 'APPROVE' | 'REJECT'

    const withdrawal = await Withdrawal.findByPk(id)
    if (!withdrawal) return res.status(404).json({ success: false, message: 'Pengajuan withdraw tidak ditemukan.' })
    if (withdrawal.status !== 'PENDING') {
      return res.status(400).json({ success: false, message: 'Status pengajuan withdraw sudah diproses sebelumnya.' })
    }

    const user = await User.findByPk(withdrawal.user_id)

    if (action === 'APPROVE') {
      await withdrawal.update({ status: 'COMPLETED', admin_note: note || 'Disetujui Admin' })
      return res.json({ success: true, message: 'Pengajuan penarikan dana berhasil disetujui.' })
    } else if (action === 'REJECT') {
      await withdrawal.update({ status: 'REJECTED', admin_note: note || 'Ditolak Admin' })

      // Refund saldo ke user
      if (user) {
        await user.update({
          available_balance: Number(user.available_balance) + Number(withdrawal.amount)
        })
      }

      return res.json({ success: true, message: 'Pengajuan penarikan dana ditolak dan saldo dikembalikan ke user.' })
    } else {
      return res.status(400).json({ success: false, message: 'Aksi withdraw tidak valid.' })
    }
  } catch (error) {
    console.error('Error processing withdrawal action:', error)
    return res.status(500).json({ success: false, message: 'Gagal memproses pengajuan withdraw.' })
  }
})

module.exports = router
