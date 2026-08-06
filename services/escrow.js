const { Op } = require('sequelize')
const Transaction = require('../db/models/transaction')
const User = require('../db/models/user')
require('dotenv').config()

const FEE_PERCENT = parseFloat(process.env.FEE_PERCENT) / 100

const ACTIVE_STATUSES = ['WAITING_BUYER', 'WAITING_PAYMENT', 'PAID', 'DELIVERED']

const EscrowService = {

  // Daftarkan atau ambil user
  async getOrCreateUser({ platform_id, platform, username }) {
    const field = platform === 'TELEGRAM' ? 'telegram_id' : 'discord_id'
    let user = await User.findOne({ where: { [field]: platform_id } })
    if (!user) {
      user = await User.create({ [field]: platform_id, username })
    }
    return user
  },

  // Ambil transaksi aktif milik user
  async getActiveTransaction(platform_id, platform) {
    const field = platform === 'TELEGRAM' ? 'telegram_id' : 'discord_id'
    const user = await User.findOne({ where: { [field]: platform_id } })
    if (!user) return null

    return await Transaction.findOne({
      where: {
        status: { [Op.in]: ACTIVE_STATUSES },
        [Op.or]: [
          { seller_id: user.id },
          { buyer_id: user.id }
        ]
      }
    })
  },

  // Penjual mulai sesi rekber
  async createSession({ seller_platform_id, platform, amount, fee_type, type, description, username }) {
    // Cek transaksi aktif
    const existing = await EscrowService.getActiveTransaction(seller_platform_id, platform)
    if (existing) {
      return {
        success: false,
        message: `Kamu masih punya transaksi aktif!\n📋 ID: ${existing.id}\n🏷️ Status: ${existing.status}\n\nSelesaikan transaksi tersebut terlebih dahulu.`
      }
    }

    const seller = await EscrowService.getOrCreateUser({ platform_id: seller_platform_id, platform, username })
    const fee = parseFloat((amount * FEE_PERCENT).toFixed(2))

    const transaction = await Transaction.create({
      seller_id: seller.id,
      amount,
      fee,
      fee_type: fee_type || 'EXCLUDE',
      type: type || 'DIGITAL',
      description,
      platform,
      status: 'WAITING_BUYER'
    })

    return { success: true, transaction }
  },

  // Pembeli join sesi
  async joinSession({ transaction_id, buyer_platform_id, platform, username }) {
    // Cek transaksi aktif
    const existing = await EscrowService.getActiveTransaction(buyer_platform_id, platform)
    if (existing) {
      return {
        success: false,
        message: `Kamu masih punya transaksi aktif!\n📋 ID: ${existing.id}\n🏷️ Status: ${existing.status}\n\nSelesaikan transaksi tersebut terlebih dahulu.`
      }
    }

    const transaction = await Transaction.findByPk(transaction_id)
    if (!transaction) return { success: false, message: 'Transaksi tidak ditemukan.' }
    if (transaction.status !== 'WAITING_BUYER') return { success: false, message: 'Sesi ini sudah tidak bisa dimasuki.' }

    const buyer = await EscrowService.getOrCreateUser({ platform_id: buyer_platform_id, platform, username })
    if (transaction.seller_id === buyer.id) return { success: false, message: 'Kamu tidak bisa join sesi milikmu sendiri.' }

    const N8nPaymentService = require('./payment/n8n')
    const paymentResult = await N8nPaymentService.createTransaction(transaction, buyer)
    
    if (!paymentResult.success) {
      return { success: false, message: paymentResult.message }
    }

    await transaction.update({ 
      buyer_id: buyer.id, 
      status: 'WAITING_PAYMENT',
      payment_ref: paymentResult.payment_ref,
      amount_with_code: paymentResult.amount_with_code,
      unique_code: paymentResult.unique_code
    })
    
    const seller = await User.findByPk(transaction.seller_id)

    return { success: true, transaction, seller }
  },

  // Ambil detail transaksi by ID
  async getTransaction(transaction_id) {
    return await Transaction.findByPk(transaction_id)
  },

  // Penjual tandai barang sudah dikirim + input resi
  async markAsDelivered({ seller_platform_id, platform, resi_number, resi_expedition }) {
    const trx = await EscrowService.getActiveTransaction(seller_platform_id, platform)
    if (!trx) return { success: false, message: 'Kamu tidak punya transaksi aktif.' }
    if (trx.status !== 'PAID') return { success: false, message: 'Pembayaran belum dikonfirmasi.' }

    const seller = await User.findOne({
      where: { [platform === 'TELEGRAM' ? 'telegram_id' : 'discord_id']: seller_platform_id }
    })
    if (!seller || trx.seller_id !== seller.id) return { success: false, message: 'Kamu bukan penjual di transaksi ini.' }

    await trx.update({ status: 'DELIVERED', resi_number, resi_expedition })
    return { success: true, transaction: trx }
  },

  // Pembeli lihat resi sebelum konfirmasi
  async getResiInfo(buyer_platform_id, platform) {
    const trx = await EscrowService.getActiveTransaction(buyer_platform_id, platform)
    if (!trx) return { success: false, message: 'Kamu tidak punya transaksi aktif.' }
    if (trx.status !== 'DELIVERED') return { success: false, message: 'Barang belum ditandai dikirim oleh penjual.' }

    const buyer = await User.findOne({
      where: { [platform === 'TELEGRAM' ? 'telegram_id' : 'discord_id']: buyer_platform_id }
    })
    if (!buyer || trx.buyer_id !== buyer.id) return { success: false, message: 'Kamu bukan pembeli di transaksi ini.' }

    return { success: true, transaction: trx }
  },

  // Pembeli konfirmasi terima barang
  async confirmReceived(buyer_platform_id, platform) {
    const trx = await EscrowService.getActiveTransaction(buyer_platform_id, platform)
    if (!trx) return { success: false, message: 'Kamu tidak punya transaksi aktif.' }
    if (trx.status !== 'DELIVERED') return { success: false, message: 'Barang belum ditandai dikirim oleh penjual.' }

    const buyer = await User.findOne({
      where: { [platform === 'TELEGRAM' ? 'telegram_id' : 'discord_id']: buyer_platform_id }
    })
    if (!buyer || trx.buyer_id !== buyer.id) return { success: false, message: 'Kamu bukan pembeli di transaksi ini.' }

    // Set hold expiry to 3 hours from now
    const holdExpiredAt = new Date(Date.now() + 3 * 60 * 60 * 1000)

    await trx.update({ 
      status: 'COMPLETED_HOLDING',
      hold_expired_at: holdExpiredAt
    })
    return { success: true, transaction: trx }
  },

  // Seller cancel sesi rekber (hanya bisa saat WAITING_BUYER)
  async cancelSession({ seller_platform_id, platform, transaction_id }) {
    const field = platform === 'TELEGRAM' ? 'telegram_id' : 'discord_id'
    const seller = await User.findOne({ where: { [field]: seller_platform_id } })
    if (!seller) return { success: false, message: 'User tidak ditemukan.' }

    // If transaction_id is provided, use it directly (from button click)
    // Otherwise, find active transaction
    let trx
    if (transaction_id) {
      trx = await Transaction.findByPk(transaction_id)
    } else {
      trx = await EscrowService.getActiveTransaction(seller_platform_id, platform)
    }

    if (!trx) return { success: false, message: 'Kamu tidak punya transaksi aktif.' }
    if (trx.seller_id !== seller.id) return { success: false, message: 'Kamu bukan penjual di transaksi ini.' }
    if (trx.status !== 'WAITING_BUYER') {
      return { success: false, message: 'Transaksi tidak bisa dibatalkan karena pembeli sudah bergabung.' }
    }

    await trx.update({ status: 'CANCELLED' })
    return { success: true, transaction: trx }
  },

  // Update status setelah pembayaran (dipanggil dari webhook atau callback n8n)
  async markAsPaid(identifier) {
    let trx = null
    // Cek berdasarkan UUID Primary Key
    if (typeof identifier === 'string' && identifier.match(/^[0-9a-fA-F-]{36}$/)) {
      trx = await Transaction.findByPk(identifier)
    }
    if (!trx) {
      trx = await Transaction.findOne({
        where: {
          [Op.or]: [
            { payment_ref: String(identifier) },
            { amount_with_code: Number(identifier) || 0 }
          ]
        }
      })
    }
    if (!trx) return null
    await trx.update({ status: 'PAID' })
    return trx
  }
}

module.exports = EscrowService