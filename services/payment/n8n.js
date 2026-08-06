const { Op } = require('sequelize')
const Transaction = require('../../db/models/transaction')
require('dotenv').config()

const N8nPaymentService = {
  /**
   * Menghasilkan kode unik (100 - 999) yang belum dipakai oleh transaksi WAITING_PAYMENT lain
   * dalam kurun waktu 2 jam terakhir untuk nominal total yang sama.
   */
  async generateUniqueCode(totalBaseAmount) {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000)

    try {
      for (let i = 0; i < 50; i++) {
        // Pick random number from 100 to 999
        const candidateCode = Math.floor(Math.random() * 900) + 100
        const candidateAmountWithCode = Number((totalBaseAmount + candidateCode).toFixed(2))

        const existing = await Transaction.findOne({
          where: {
            status: 'WAITING_PAYMENT',
            amount_with_code: candidateAmountWithCode,
            createdAt: { [Op.gte]: twoHoursAgo }
          }
        })

        if (!existing) {
          return { uniqueCode: candidateCode, amountWithCode: candidateAmountWithCode }
        }
      }
    } catch (error) {
      // Fallback jika database tidak dapat dijangkau saat generator dipanggil
      const fallbackCode = Math.floor(Math.random() * 900) + 100
      return { uniqueCode: fallbackCode, amountWithCode: Number((totalBaseAmount + fallbackCode).toFixed(2)) }
    }

    // Fallback jika 100-999 sangat padat: ambil 1000 - 9999
    const fallbackCode = Math.floor(Math.random() * 9000) + 1000
    const fallbackAmountWithCode = Number((totalBaseAmount + fallbackCode).toFixed(2))
    return { uniqueCode: fallbackCode, amountWithCode: fallbackAmountWithCode }
  },

  /**
   * Memproses pembuatan instruksi pembayaran n8n
   */
  async createTransaction(transaction, buyer) {
    try {
      const amount = Number(transaction.amount)
      const fee = Number(transaction.fee)
      const totalBaseAmount = transaction.fee_type === 'EXCLUDE' ? amount + fee : amount

      const { uniqueCode, amountWithCode } = await this.generateUniqueCode(totalBaseAmount)

      const accounts = {
        dana: process.env.PAYMENT_DANA_NUMBER || '081234567890',
        seabank: process.env.PAYMENT_SEABANK_NUMBER || '901234567890',
        accountName: process.env.PAYMENT_ACCOUNT_NAME || 'PortaPay Escrow'
      }

      return {
        success: true,
        amount_with_code: amountWithCode,
        unique_code: uniqueCode,
        payment_ref: `N8N-${transaction.id.substring(0, 8)}`,
        accounts
      }
    } catch (error) {
      console.error('Error generating n8n payment instruction:', error)
      return {
        success: false,
        message: 'Gagal membuat instruksi pembayaran n8n.'
      }
    }
  }
}

module.exports = N8nPaymentService
