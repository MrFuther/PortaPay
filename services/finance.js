const sequelize = require('../db')
const { Op } = require('sequelize')
const Transaction = require('../db/models/transaction')
const User = require('../db/models/user')
const BalanceEntry = require('../db/models/balance-entry')
const PaymentEvent = require('../db/models/payment-event')
const { cents, decimal } = require('./money')

async function changeBalance(user, delta, event_key, transaction) {
  const next = cents(user.available_balance) + delta
  if (next < 0) throw new Error('Saldo tidak mencukupi.')
  await BalanceEntry.create({ user_id: user.id, event_key, amount: decimal(delta), balance_after: decimal(next) }, { transaction })
  await user.update({ available_balance: decimal(next) }, { transaction })
  return decimal(next)
}

async function settle(id, action, { timer = false } = {}) {
  return sequelize.transaction(async transaction => {
    const trx = await Transaction.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
    if (!trx) throw new Error('Transaksi tidak ditemukan.')
    if (timer && (trx.status !== 'COMPLETED_HOLDING' || !trx.hold_expired_at || new Date(trx.hold_expired_at) > new Date())) return null
    if (!timer && trx.status !== 'FROZEN') throw new Error('Transaksi tidak dalam status FROZEN.')
    if (trx.settled_at) throw new Error('Dana sudah diproses.')
    if (!['RELEASE_SELLER', 'REFUND_BUYER', 'CANCEL_UNFUNDED'].includes(action)) throw new Error('Aksi tidak valid.')
    const funded = cents(trx.funded_amount)
    if (action === 'CANCEL_UNFUNDED') {
      if (funded !== 0 || trx.paid_at || !['WAITING_BUYER', 'WAITING_PAYMENT'].includes(trx.disputed_from)) throw new Error('Status dana belum terbukti kosong; perlu rekonsiliasi.')
      await trx.update({ status: 'CANCELLED', settled_at: new Date(), hold_expired_at: null }, { transaction })
      return { transaction: trx, amount: 0 }
    }
    const payment = await PaymentEvent.findOne({ where: { transaction_id: trx.id }, transaction })
    if (!payment || funded <= 0 || cents(payment.amount) !== funded) throw new Error('Bukti dana belum terverifikasi. Rekonsiliasi pembayaran terlebih dahulu.')
    // Lock all participants in a stable order to avoid cross-transaction deadlocks.
    const users = await User.findAll({ where: { id: { [Op.in]: [trx.seller_id, trx.buyer_id].filter(Boolean) } }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE })
    const seller = users.find(u => u.id === trx.seller_id)
    const buyer = users.find(u => u.id === trx.buyer_id)
    const release = action === 'RELEASE_SELLER'
    const amount = release ? cents(trx.amount) - (trx.fee_type === 'INCLUDE' ? cents(trx.fee) : 0) : funded
    if (amount <= 0 || amount > funded || !(release ? seller : buyer)) throw new Error('Penerima atau jumlah pencairan tidak valid.')
    await changeBalance(release ? seller : buyer, amount, `settlement:${trx.id}`, transaction)
    if (release) {
      await seller.increment({ total_deals: 1, trust_score: 1 }, { transaction })
      if (buyer) await buyer.increment('total_deals', { by: 1, transaction })
    }
    await trx.update({ status: release ? 'COMPLETED' : 'CANCELLED', settled_at: new Date(), hold_expired_at: null }, { transaction })
    return { transaction: trx, seller, buyer, amount: amount / 100 }
  })
}
module.exports = { changeBalance, settle }
