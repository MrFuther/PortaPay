const { Op } = require('sequelize')
const Transaction = require('../db/models/transaction')
const Finance = require('./finance')
module.exports = {
  start() {
    if (this.interval) return
    this.interval = setInterval(() => this.checkCompletedHolds(), 60000)
    this.checkCompletedHolds()
  },
  stop() { clearInterval(this.interval); this.interval = null },
  async checkCompletedHolds() {
    try {
      const rows = await Transaction.findAll({ where: { status: 'COMPLETED_HOLDING', hold_expired_at: { [Op.lte]: new Date() } } })
      for (const trx of rows) await this.finalizeTransaction(trx)
    } catch (error) { console.error('Timer Service Error:', error.message) }
  },
  async finalizeTransaction(trx) {
    try {
      const result = await Finance.settle(trx.id, 'RELEASE_SELLER', { timer: true })
      if (result) await require('./notification').notifyCompleted(result.transaction, result.seller, result.buyer).catch(console.error)
      return result
    } catch (error) { console.error(`Settlement ${trx.id} ditahan:`, error.message); return null }
  }
}
