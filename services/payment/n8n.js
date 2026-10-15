const Transaction = require('../../db/models/transaction')
const { cents, decimal } = require('../money')
const { randomInt } = require('crypto')
module.exports = {
  async generateUniqueCode(base, transaction) {
    if (!transaction) throw new Error('Reservasi pembayaran harus dalam transaksi database.')
    // Historical amounts remain reserved so late transfers cannot fund a new buyer.
    const start = randomInt(900)
    for (let i = 0; i < 900; i++) {
      const uniqueCode = 100 + ((start + i) % 900)
      const amountWithCode = decimal(cents(base) + uniqueCode * 100)
      if (!await Transaction.findOne({ where: { amount_with_code: amountWithCode }, transaction })) return { uniqueCode, amountWithCode }
    }
    throw new Error('Nominal pembayaran sudah penuh. Hubungi admin untuk alternatif pembayaran.')
  },
  async createTransaction(trx, buyer, transaction) {
    const base = cents(trx.amount) + (trx.fee_type === 'EXCLUDE' ? cents(trx.fee) : 0)
    const code = await this.generateUniqueCode(decimal(base), transaction)
    return { success: true, amount_with_code: code.amountWithCode, unique_code: code.uniqueCode, payment_ref: `N8N-${trx.id}` }
  }
}
