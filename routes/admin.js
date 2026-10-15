const express = require('express')
const router = express.Router()
const { Op } = require('sequelize')
const Transaction = require('../db/models/transaction')
const User = require('../db/models/user')
const Withdrawal = require('../db/models/withdrawal')
const NotificationService = require('../services/notification')
require('dotenv').config()

const AdminAuth = require('../services/admin-auth')
const Finance = require('../services/finance')
const sequelize = require('../db')
const adminAuth = AdminAuth.auth
router.post('/login', express.json(), AdminAuth.login)
router.get('/session', adminAuth, (req, res) => res.json({ success: true }))
router.post('/logout', adminAuth, AdminAuth.logout)

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
    const [escrowFunds, pendingWithdrawalAmount, pipeline, recentTransactions] = await Promise.all([
      Transaction.sum('funded_amount', { where: { settled_at: null, status: { [Op.in]: ['PAID', 'DELIVERED', 'COMPLETED_HOLDING', 'FROZEN'] } } }),
      Withdrawal.sum('amount', { where: { status: 'PENDING' } }),
      Transaction.findAll({ attributes: ['status', [sequelize.fn('COUNT', sequelize.col('id')), 'count']], group: ['status'], raw: true }),
      Transaction.findAll({ attributes: ['id', 'description', 'amount', 'status', 'platform', 'type', 'updatedAt'], order: [['updatedAt', 'DESC']], limit: 8 })
    ])

    return res.json({
      success: true,
      stats: {
        totalVolume,
        activeDeals,
        frozenDisputes,
        pendingWithdrawals,
        totalCompletedDeals,
        escrowFunds: Number(escrowFunds || 0),
        pendingWithdrawalAmount: Number(pendingWithdrawalAmount || 0),
        pipeline: pipeline.map(row => ({ status: row.status, count: Number(row.count) })),
        recentTransactions
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
    const { action } = req.body

    const result = await Finance.settle(id, action)
    if (action === 'RELEASE_SELLER') await NotificationService.notifyCompleted(result.transaction, result.seller, result.buyer).catch(console.error)
    return res.json({ success: true, message: 'Resolusi selesai. Saldo diproses secara atomik.' })
  } catch (error) {
    console.error('Error resolving dispute:', error)
    return res.status(error.name === 'Error' ? 400 : 500).json({ success: false, message: error.name === 'Error' ? error.message : 'Gagal memproses resolusi komplain.' })
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

    if (!['APPROVE', 'REJECT'].includes(action)) return res.status(400).json({ success: false, message: 'Aksi tidak valid.' })
    await sequelize.transaction(async transaction => {
      const withdrawal = await Withdrawal.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
      if (!withdrawal || withdrawal.status !== 'PENDING') throw new Error('Pengajuan tidak ditemukan atau sudah diproses.')
      if (action === 'REJECT') {
        const user = await User.findByPk(withdrawal.user_id, { transaction, lock: transaction.LOCK.UPDATE })
        if (!user) throw new Error('User tidak ditemukan.')
        await Finance.changeBalance(user, require('../services/money').cents(withdrawal.amount), 'withdrawal-refund:' + withdrawal.id, transaction)
      }
      await withdrawal.update({ status: action === 'APPROVE' ? 'COMPLETED' : 'REJECTED', admin_note: String(note || action).slice(0, 255) }, { transaction })
    })
    return res.json({ success: true, message: 'Pengajuan selesai diproses.' })
  } catch (error) {
    console.error('Error processing withdrawal action:', error)
    return res.status(500).json({ success: false, message: 'Gagal memproses pengajuan withdraw.' })
  }
})

module.exports = router
