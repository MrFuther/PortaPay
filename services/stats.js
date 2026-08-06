/**
 * Stats Service — aggregates transaction statistics from the database.
 * Used by the Discord Dashboard to display real-time trust metrics.
 */
const { Op } = require('sequelize')
const Transaction = require('../db/models/transaction')

const ACTIVE_STATUSES = ['WAITING_BUYER', 'WAITING_PAYMENT', 'PAID', 'DELIVERED', 'COMPLETED_HOLDING']

function startOfDay() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function startOfMonth() {
  const d = new Date()
  d.setDate(1)
  d.setHours(0, 0, 0, 0)
  return d
}

const StatsService = {
  // Jumlah sesi yang sedang aktif (belum selesai/batal)
  async getActiveCount() {
    return await Transaction.count({
      where: { status: { [Op.in]: ACTIVE_STATUSES } }
    })
  },

  // Total amount yang diamankan hari ini (aktif + selesai hari ini)
  async getDailySecuredAmount() {
    const result = await Transaction.sum('amount', {
      where: {
        status: { [Op.in]: [...ACTIVE_STATUSES, 'COMPLETED'] },
        createdAt: { [Op.gte]: startOfDay() }
      }
    })
    return result || 0
  },

  // Statistik bulan ini: count + volume COMPLETED
  async getMonthlyStats() {
    const [count, volume] = await Promise.all([
      Transaction.count({
        where: {
          status: 'COMPLETED',
          updatedAt: { [Op.gte]: startOfMonth() }
        }
      }),
      Transaction.sum('amount', {
        where: {
          status: 'COMPLETED',
          updatedAt: { [Op.gte]: startOfMonth() }
        }
      })
    ])
    return { count: count || 0, volume: volume || 0 }
  },

  // Transaksi COMPLETED hari ini (untuk ditampilkan dengan sensor privasi)
  async getTodayCompleted() {
    return await Transaction.findAll({
      where: {
        status: 'COMPLETED',
        updatedAt: { [Op.gte]: startOfDay() }
      },
      order: [['updatedAt', 'DESC']],
      limit: 8,
      attributes: ['id', 'amount', 'type', 'fee_type', 'updatedAt']
    })
  },

  // Ambil semua stats sekaligus
  async getAllStats() {
    const [activeCount, dailyAmount, monthly, todayCompleted] = await Promise.all([
      StatsService.getActiveCount(),
      StatsService.getDailySecuredAmount(),
      StatsService.getMonthlyStats(),
      StatsService.getTodayCompleted()
    ])
    return { activeCount, dailyAmount, monthly, todayCompleted }
  }
}

module.exports = StatsService
