const { Op } = require('sequelize')
const { randomUUID } = require('crypto')
const sequelize = require('../db')
const Delivery = require('../db/models/notification-delivery')
const Transaction = require('../db/models/transaction')
const PaymentEvent = require('../db/models/payment-event')
const User = require('../db/models/user')
const { cents } = require('./money')

async function enqueue(trx, transaction) {
  const payment = await PaymentEvent.findOne({ where: { transaction_id: trx.id }, transaction })
  if (!payment || cents(trx.funded_amount) <= 0 || cents(payment.amount) !== cents(trx.funded_amount)) throw new Error('Notifikasi pembayaran memerlukan bukti dana terverifikasi.')
  const recipients = [['seller', trx.seller_id], ['buyer', trx.buyer_id]]
  if (recipients.some(([, id]) => !id)) throw new Error('Penerima notifikasi pembayaran tidak lengkap.')
  await Delivery.bulkCreate(recipients.map(([role, user_id]) => ({ transaction_id: trx.id, user_id, role, platform: trx.platform, next_attempt_at: new Date() })), { transaction, ignoreDuplicates: true })
  await require('./transaction-panels').ensure(trx, transaction)
}

function readyPlatforms() {
  const notifications = require('./notification')
  return [notifications.discordClient?.isReady() ? 'DISCORD' : null, notifications.telegramBot ? 'TELEGRAM' : null].filter(Boolean)
}

async function claim({ transactionId, deliveryId } = {}) {
  const platforms = readyPlatforms()
  if (!platforms.length) return null
  return sequelize.transaction(async transaction => {
    const now = new Date()
    const row = await Delivery.findOne({
      where: {
        ...(transactionId ? { transaction_id: transactionId } : {}), ...(deliveryId ? { id: deliveryId } : {}),
        platform: { [Op.in]: platforms }, status: { [Op.in]: ['PENDING', 'SENDING'] }, next_attempt_at: { [Op.lte]: now },
        [Op.or]: [{ lease_until: null }, { lease_until: { [Op.lte]: now } }]
      }, order: [['next_attempt_at', 'ASC'], ['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE, skipLocked: true
    })
    if (!row) return null
    await row.update({ status: 'SENDING', lease_token: randomUUID(), lease_until: new Date(Date.now() + 120000) }, { transaction })
    return row
  })
}

function message(trx, role) {
  const status = { PAID: 'Pembayaran diterima', DELIVERED: 'Barang sudah dikirim', COMPLETED_HOLDING: 'Masa hold sebelum pencairan', COMPLETED: 'Transaksi selesai', FROZEN: 'Dana dibekukan karena komplain', CANCELLED: 'Transaksi dibatalkan' }[trx.status] || 'Periksa status transaksi'
  const instruction = trx.status === 'PAID' ? (role === 'seller' ? 'Silakan kirim barang, lalu gunakan /kirim untuk memasukkan bukti pengiriman.' : 'Pembayaran kamu telah diverifikasi. Tunggu penjual mengirim barang.') : 'Status transaksi sudah berubah sejak pembayaran. Ikuti status terbaru di atas.'
  const content = `Pembayaran rekber terverifikasi.\nID: ${trx.id}\nBarang: ${trx.description}\nHarga barang: Rp ${Number(trx.amount).toLocaleString('id-ID')}\nDana diterima: Rp ${Number(trx.funded_amount).toLocaleString('id-ID')}\nStatus sekarang: ${status}\n\n${instruction}`
  return { content, embed: { title: role === 'seller' ? 'Pembayaran Rekber Diterima' : 'Pembayaran Kamu Terkonfirmasi', color: 0x00b894, description: content.slice(0, 4096) } }
}

async function deliver(row) {
  let sent = false
  let failure = 'DM gagal; akan dicoba ulang. Periksa kesiapan bot dan izin DM penerima.'
  try {
    const [trx, user] = await Promise.all([Transaction.findByPk(row.transaction_id), User.findByPk(row.user_id)])
    if (!trx || !user) throw new Error('Data penerima/transaksi tidak tersedia.')
    const platform_id = row.platform === 'DISCORD' ? user.discord_id : user.telegram_id
    const payload = message(trx, row.role)
    const notifications = require('./notification')
    let timeout
    try {
      sent = await Promise.race([
        notifications.sendDirectMessage({ platform: row.platform, platform_id, content: payload.content, embed: row.platform === 'DISCORD' ? payload.embed : null, deliveryKey: row.id, plainText: true, throwOnError: true, transaction_id: trx.id, role: row.role }),
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Waktu pengiriman habis.')), 30000) })
      ])
    } finally { clearTimeout(timeout) }
  } catch (error) { failure = error.message.slice(0, 255); console.warn('Notifikasi pembayaran belum terkirim:', failure) }
  const attempts = row.attempts + 1
  // Keep failures visible and retry indefinitely, at most every 15 minutes.
  const backoff = Math.min(900000, 15000 * 2 ** Math.min(attempts - 1, 6))
  await Delivery.update(sent ? {
    status: 'SENT', attempts, sent_at: new Date(), last_error: null, lease_until: null, lease_token: null
  } : {
    status: 'PENDING', attempts, next_attempt_at: new Date(Date.now() + backoff), last_error: failure, lease_until: null, lease_token: null
  }, { where: { id: row.id, status: 'SENDING', lease_token: row.lease_token } })
  return sent
}

const worker = {
  enqueue, claim, deliver, message,
  async drain(options = {}) {
    if (this.running) return
    this.running = true
    try {
      for (let count = 0; count < 25; count++) {
        const row = await claim(options)
        if (!row) break
        await deliver(row)
      }
    } catch (error) { console.error('Payment notification worker:', error.message) }
    finally { this.running = false }
  },
  kick() { void this.drain() },
  start() {
    if (this.interval) return
    this.interval = setInterval(() => this.kick(), 15000)
    this.kick()
  },
  stop() { clearInterval(this.interval); this.interval = null }
}
module.exports = worker
