const { Op } = require('sequelize')
const Transaction = require('../db/models/transaction')
const User = require('../db/models/user')

const TimerService = {
  start() {
    console.log('⏳ Timer Service started. Checking for completed holds every minute.')
    // Run every minute (60000 ms)
    setInterval(this.checkCompletedHolds.bind(this), 60000)
    // Run once immediately on start
    this.checkCompletedHolds()
  },

  async checkCompletedHolds() {
    try {
      const now = new Date()
      const expiredTransactions = await Transaction.findAll({
        where: {
          status: 'COMPLETED_HOLDING',
          hold_expired_at: {
            [Op.lt]: now
          }
        }
      })

      for (const trx of expiredTransactions) {
        await this.finalizeTransaction(trx)
      }
    } catch (error) {
      console.error('Timer Service Error:', error)
    }
  },

  async finalizeTransaction(trx) {
    try {
      // 1. Update status to COMPLETED
      await trx.update({ status: 'COMPLETED' })

      // 2. Add balance to seller
      // Jika EXCLUDE: Cair ke seller: Full Harga Barang (amount).
      // Jika INCLUDE: Cair ke seller: Harga Barang - Fee Platform (amount - fee).
      const sellerAmount = trx.fee_type === 'EXCLUDE' 
        ? Number(trx.amount) 
        : Number(trx.amount) - Number(trx.fee)

      const seller = await User.findByPk(trx.seller_id)
      if (seller) {
        await seller.update({
          available_balance: Number(seller.available_balance) + sellerAmount,
          total_deals: seller.total_deals + 1,
          trust_score: seller.trust_score + 1 // Example trust score increment
        })
      }

      const buyer = await User.findByPk(trx.buyer_id)
      if (buyer) {
        await buyer.update({
          total_deals: buyer.total_deals + 1
        })
      }

      const NotificationService = require('./notification')
      await NotificationService.notifyCompleted(trx, seller, buyer)

      console.log(`✅ Transaction ${trx.id} finalized successfully from HOLD.`)
    } catch (error) {
      console.error(`Failed to finalize transaction ${trx.id}:`, error)
    }
  }
}

module.exports = TimerService
