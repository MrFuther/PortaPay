const { Op } = require('sequelize')
const sequelize = require('../db')
const Transaction = require('../db/models/transaction')
const User = require('../db/models/user')
const PaymentEvent = require('../db/models/payment-event')
const { cents, decimal } = require('./money')
require('dotenv').config()
const ACTIVE = ['WAITING_BUYER', 'WAITING_PAYMENT', 'PAID', 'DELIVERED', 'COMPLETED_HOLDING', 'FROZEN']
const fieldFor = platform => {
  if (!['DISCORD', 'TELEGRAM'].includes(platform)) throw new Error('Platform tidak valid.')
  return platform === 'TELEGRAM' ? 'telegram_id' : 'discord_id'
}
const belongs = id => ({ [Op.or]: [{ seller_id: id }, { buyer_id: id }] })
const fail = message => ({ success: false, message })
const sessionLock = transaction => sequelize.query('SELECT pg_advisory_xact_lock(740016)', { transaction })
const EscrowService = {
  async getOrCreateUser({ platform_id, platform, username }) {
    const [user] = await User.findOrCreate({ where: { [fieldFor(platform)]: platform_id }, defaults: { username } })
    return user
  },
  async getActiveTransaction(platform_id, platform) {
    const user = await User.findOne({ where: { [fieldFor(platform)]: platform_id } })
    if (!user) return null
    return Transaction.findOne({ where: { ...belongs(user.id), status: { [Op.in]: ACTIVE } }, order: [['createdAt', 'ASC']] })
  },
  async createSession({ seller_platform_id, platform, amount, fee_type = 'EXCLUDE', type = 'DIGITAL', description, username }) {
    try {
      const amountCents = cents(amount, { positive: true })
      const percent = Number(process.env.FEE_PERCENT ?? 1)
      if (!Number.isFinite(percent) || percent < 0 || percent >= 100) return fail('Konfigurasi fee tidak valid.')
      if (!['INCLUDE', 'EXCLUDE'].includes(fee_type) || !['DIGITAL', 'PHYSICAL'].includes(type) || typeof description !== 'string' || !description.trim() || description.length > 255) return fail('Detail transaksi tidak valid.')
      const seller = await this.getOrCreateUser({ platform_id: seller_platform_id, platform, username })
      return await sequelize.transaction(async transaction => {
        await sessionLock(transaction)
        if (await Transaction.findOne({ where: { ...belongs(seller.id), status: { [Op.in]: ACTIVE } }, transaction })) return fail('Kamu masih punya transaksi aktif, hold, atau sengketa.')
        const trx = await Transaction.create({ seller_id: seller.id, amount: decimal(amountCents), fee: decimal(Math.round(amountCents * percent / 100)), fee_type, type, description: description.trim(), platform, status: 'WAITING_BUYER' }, { transaction })
        return { success: true, transaction: trx }
      })
    } catch (error) { return fail(error.message) }
  },
  async joinSession({ transaction_id, buyer_platform_id, platform, username }) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(transaction_id || '')) return fail('ID transaksi tidak valid.')
    const buyer = await this.getOrCreateUser({ platform_id: buyer_platform_id, platform, username })
    return sequelize.transaction(async transaction => {
      await sessionLock(transaction)
      const trx = await Transaction.findByPk(transaction_id, { transaction, lock: transaction.LOCK.UPDATE })
      if (!trx || trx.status !== 'WAITING_BUYER') return fail('Sesi tidak ditemukan atau sudah dimasuki.')
      if (trx.platform !== platform) return fail('Gabung melalui platform yang sama dengan penjual.')
      if (trx.seller_id === buyer.id) return fail('Kamu tidak bisa join sesi milikmu sendiri.')
      if (await Transaction.findOne({ where: { ...belongs(buyer.id), status: { [Op.in]: ACTIVE } }, transaction })) return fail('Kamu masih punya transaksi aktif, hold, atau sengketa.')
      const payment = await require('./payment/n8n').createTransaction(trx, buyer, transaction)
      if (!payment.success) return fail(payment.message)
      const now = new Date()
      await trx.update({ buyer_id: buyer.id, status: 'WAITING_PAYMENT', payment_ref: payment.payment_ref, amount_with_code: payment.amount_with_code, unique_code: payment.unique_code, payment_issued_at: now, payment_expires_at: new Date(now.getTime() + 2 * 60 * 60 * 1000) }, { transaction })
      return { success: true, transaction: trx, seller: await User.findByPk(trx.seller_id, { transaction }) }
    })
  },
  getTransaction(id) { return Transaction.findByPk(id) },
  async transition(platform_id, platform, from, patch, role, transaction_id) {
    const user = await User.findOne({ where: { [fieldFor(platform)]: platform_id } })
    if (!user) return fail('User tidak ditemukan.')
    return sequelize.transaction(async transaction => {
      const candidates = await Transaction.findAll({ where: { ...belongs(user.id), ...(transaction_id ? { id: transaction_id } : {}), status: { [Op.in]: ACTIVE } }, transaction, lock: transaction.LOCK.UPDATE, order: [['createdAt', 'ASC']] })
      if (candidates.length !== 1) return fail('Tidak ada satu sesi aktif yang dapat diproses. Hubungi admin jika ada beberapa sesi lama.')
      const trx = candidates[0]
      if (!from.includes(trx.status) || (role && trx[role] !== user.id)) return fail('Status atau peran kamu tidak mengizinkan aksi ini.')
      const values = typeof patch === 'function' ? patch(trx) : patch
      await trx.update({ ...values, ...(values.status === 'FROZEN' ? { disputed_from: trx.status } : {}) }, { transaction })
      if (trx.platform === 'DISCORD') transaction.afterCommit(() => { void require('./transaction-panels').refresh(trx.id).catch(console.error) })
      return { success: true, transaction: trx }
    })
  },
  async markAsDelivered({ seller_platform_id, platform, resi_number, resi_expedition, delivery_note, transaction_id }) {
    const result = await this.transition(seller_platform_id, platform, ['PAID'], trx => {
      const digital = trx.type === 'DIGITAL'
      const valid = value => typeof value === 'string' && value.trim() && value.length <= 255
      if (!digital && (!valid(resi_number) || !valid(resi_expedition))) throw new Error('Barang fisik wajib memiliki ekspedisi dan nomor resi.')
      if (delivery_note && (typeof delivery_note !== 'string' || delivery_note.length > 1000)) throw new Error('Catatan penyerahan terlalu panjang.')
      return { status: 'DELIVERED', resi_number: digital ? null : resi_number.trim(), resi_expedition: digital ? null : resi_expedition.trim(), delivery_note: digital ? (delivery_note || '').trim() : null }
    }, 'seller_id', transaction_id)
    if (result.success) await require('./notification').notifyDelivered(result.transaction).catch(console.error)
    return result
  },
  async getResiInfo(platform_id, platform) {
    const trx = await this.getActiveTransaction(platform_id, platform)
    const user = await User.findOne({ where: { [fieldFor(platform)]: platform_id } })
    if (!trx || trx.status !== 'DELIVERED' || trx.buyer_id !== user?.id) return fail('Tidak ada pengiriman yang bisa kamu konfirmasi.')
    return { success: true, transaction: trx }
  },
  confirmReceived(platform_id, platform, transaction_id) {
    return this.transition(platform_id, platform, ['DELIVERED'], () => ({ status: 'COMPLETED_HOLDING', hold_expired_at: new Date(Date.now() + 3 * 60 * 60 * 1000) }), 'buyer_id', transaction_id)
  },
  async cancelSession({ seller_platform_id, platform, transaction_id }) {
    if (transaction_id) {
      const user = await User.findOne({ where: { [fieldFor(platform)]: seller_platform_id } })
      const [changed] = await Transaction.update({ status: 'CANCELLED' }, { where: { id: transaction_id, seller_id: user?.id || '', status: 'WAITING_BUYER' } })
      return changed ? { success: true, transaction: await Transaction.findByPk(transaction_id) } : fail('Sesi tidak dapat dibatalkan.')
    }
    return this.transition(seller_platform_id, platform, ['WAITING_BUYER'], { status: 'CANCELLED' }, 'seller_id')
  },
  async acceptPayment({ provider, event_id, amount, occurred_at, transaction_id, payment_ref }) {
    const paidCents = cents(amount, { positive: true })
    const occurred = new Date(occurred_at)
    if (!['N8N', 'TRIPAY', 'MOCK'].includes(provider) || typeof event_id !== 'string' || !event_id.trim() || event_id.length > 200 || !Number.isFinite(occurred.getTime()) || occurred > new Date(Date.now() + 300000)) throw new Error('Data mutasi tidak valid.')
    if (provider === 'MOCK' && (process.env.NODE_ENV === 'production' || process.env.MOCK_PAYMENT !== 'true')) throw new Error('Mock payment dinonaktifkan.')
    return sequelize.transaction(async transaction => {
      await sequelize.query('SELECT pg_advisory_xact_lock(740017)', { transaction })
      const existing = await PaymentEvent.findOne({ where: { provider, event_id }, transaction })
      if (existing) {
        const prior = await Transaction.findByPk(existing.transaction_id, { transaction })
        if (cents(existing.amount) !== paidCents || (transaction_id && existing.transaction_id !== transaction_id) || (payment_ref && prior.payment_ref !== payment_ref)) throw new Error('ID mutasi sudah digunakan untuk pembayaran berbeda.')
        await require('./payment-notifications').enqueue(prior, transaction)
        return { transaction: prior, duplicate: true }
      }
      const where = transaction_id ? { id: transaction_id } : payment_ref ? { payment_ref } : { status: 'WAITING_PAYMENT', amount_with_code: decimal(paidCents) }
      const matches = await Transaction.findAll({ where, transaction, lock: transaction.LOCK.UPDATE })
      if (matches.length !== 1) throw new Error('Pembayaran tidak cocok atau ambigu; perlu rekonsiliasi.')
      const trx = matches[0]
      if (trx.status !== 'WAITING_PAYMENT' || trx.settled_at || !trx.buyer_id || cents(trx.amount_with_code) !== paidCents) throw new Error('Status atau nominal pembayaran tidak cocok.')
      if (!trx.payment_issued_at || !trx.payment_expires_at || occurred < trx.payment_issued_at || occurred > trx.payment_expires_at) throw new Error('Pembayaran di luar masa instruksi; perlu rekonsiliasi.')
      await PaymentEvent.create({ provider, event_id, transaction_id: trx.id, amount: decimal(paidCents), occurred_at: occurred }, { transaction })
      await trx.update({ status: 'PAID', funded_amount: decimal(paidCents), paid_at: occurred }, { transaction })
      await require('./payment-notifications').enqueue(trx, transaction)
      return { transaction: trx, duplicate: false }
    })
  },
  async markAsPaid(id) {
    const trx = await Transaction.findByPk(id)
    if (!trx) return null
    const result = await this.acceptPayment({ provider: 'MOCK', event_id: `mock:${id}`, transaction_id: id, amount: trx.amount_with_code, occurred_at: new Date().toISOString() })
    return result.transaction
  },
  async triggerDispute({ user_platform_id, platform, reason, transaction_id }) {
    const result = await this.transition(user_platform_id, platform, ACTIVE.filter(s => s !== 'FROZEN'), { status: 'FROZEN', hold_expired_at: null, dispute_reason: String(reason || '').slice(0, 2000) }, null, transaction_id)
    if (!result.success) return result
    const trx = result.transaction
    const seller = await User.findByPk(trx.seller_id)
    const buyer = trx.buyer_id ? await User.findByPk(trx.buyer_id) : null
    await require('./notification').notifyFrozen(trx, seller, buyer, user_platform_id, reason).catch(console.error)
    return { ...result, seller, buyer, reason: reason || 'Tidak ada alasan yang disertakan.' }
  }
}
module.exports = EscrowService
