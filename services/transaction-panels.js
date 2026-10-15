const { Op } = require('sequelize')
const { createHash, randomUUID } = require('crypto')
const sequelize = require('../db')
const Panel = require('../db/models/transaction-panel')
const Transaction = require('../db/models/transaction')
const User = require('../db/models/user')
const labels = { PAID: 'Pembayaran diterima', DELIVERED: 'Barang sudah dikirim/diserahkan', COMPLETED_HOLDING: 'Barang diterima — masa hold 3 jam', COMPLETED: 'Selesai — saldo penjual sudah dikreditkan', FROZEN: 'Komplain — pencairan dibekukan', CANCELLED: 'Dibatalkan' }
const button = (action, id, label, style = 2) => ({ type: 2, custom_id: `escrow:${action}:${id}`, label, style })
function build(trx, role) {
  const digital = trx.type === 'DIGITAL'
  const controls = []
  if (role === 'seller' && trx.status === 'PAID') controls.push(button('send', trx.id, digital ? 'Barang digital sudah diserahkan' : 'Input pengiriman barang', 1))
  if (role === 'buyer' && trx.status === 'DELIVERED') controls.push(button('received', trx.id, 'Barang sudah saya terima', 3))
  if (['PAID', 'DELIVERED', 'COMPLETED_HOLDING'].includes(trx.status)) controls.push(button('dispute', trx.id, 'Ajukan komplain', 4))
  controls.push(button('refresh', trx.id, 'Perbarui panel'))
  const fields = [
    { name: 'Barang', value: String(trx.description).slice(0, 1024) },
    { name: 'Jenis', value: digital ? 'Digital — tanpa resi' : 'Fisik — ekspedisi dan resi diperlukan', inline: true },
    { name: 'Harga barang', value: `Rp ${Number(trx.amount).toLocaleString('id-ID')}`, inline: true },
    { name: 'Status sekarang', value: labels[trx.status] || trx.status },
    { name: 'ID transaksi', value: trx.id }
  ]
  if (trx.resi_number) fields.push({ name: 'Pengiriman', value: `${trx.resi_expedition || ''} — ${trx.resi_number}`.slice(0, 1024) })
  if (trx.delivery_note) fields.push({ name: 'Catatan penyerahan', value: trx.delivery_note.slice(0, 1024) })
  if (trx.status === 'COMPLETED_HOLDING' && trx.hold_expired_at) fields.push({ name: 'Jadwal pencairan', value: `<t:${Math.floor(new Date(trx.hold_expired_at).getTime() / 1000)}:R>. Ajukan komplain sebelum hold berakhir jika ada masalah.` })
  if (trx.status === 'FROZEN') fields.push({ name: 'Komplain', value: (trx.dispute_reason || 'Sedang ditangani admin.').slice(0, 1024) })
  const instruction = trx.status === 'PAID' ? (role === 'seller' ? 'Dana sudah terverifikasi. Setelah menyerahkan barang, gunakan tombol di bawah.' : 'Dana sudah terverifikasi. Tunggu penjual menyerahkan barang.') : trx.status === 'DELIVERED' ? (role === 'buyer' ? 'Periksa barang terlebih dahulu. Hanya konfirmasi jika sudah benar-benar diterima.' : 'Menunggu pembeli memeriksa dan mengonfirmasi penerimaan.') : 'Panel ini mengikuti status transaksi secara otomatis.'
  return { embeds: [{ title: trx.status === 'PAID' ? 'Pembayaran rekber terverifikasi' : 'Perkembangan transaksi rekber', description: instruction, fields, color: trx.status === 'FROZEN' ? 0xd63031 : 0x00b894, footer: { text: role === 'seller' ? 'Panel penjual • diperbarui otomatis' : 'Panel pembeli • diperbarui otomatis' } }], components: [{ type: 1, components: controls }], allowedMentions: { parse: [] } }
}
async function ensure(trx, transaction) {
  if (trx.platform !== 'DISCORD' || !trx.buyer_id) return
  await Panel.bulkCreate([['seller', trx.seller_id], ['buyer', trx.buyer_id]].map(([role, user_id]) => ({ transaction_id: trx.id, role, user_id, sync_after: new Date() })), { transaction, ignoreDuplicates: true })
}
async function syncOne(id, force = false) {
  const client = require('./notification').discordClient
  if (!client?.isReady()) return false
  const row = await sequelize.transaction(async transaction => {
    const now = new Date()
    const record = await Panel.findOne({ where: { id, ...(force ? {} : { sync_after: { [Op.lte]: now } }), [Op.or]: [{ lease_until: null }, { lease_until: { [Op.lte]: now } }] }, transaction, lock: transaction.LOCK.UPDATE, skipLocked: true })
    if (!record) return null
    await record.update({ lease_token: randomUUID(), lease_until: new Date(Date.now() + 120000) }, { transaction })
    return record
  })
  if (!row) return false
  const owned = { id: row.id, lease_token: row.lease_token }
  let timeout
  try {
    const success = await Promise.race([(async () => {
      const [trx, user] = await Promise.all([Transaction.findByPk(row.transaction_id), User.findByPk(row.user_id)])
      if (!trx || !user?.discord_id) throw new Error('Penerima/transaksi panel tidak tersedia.')
      const payload = build(trx, row.role)
      const hash = createHash('sha256').update(JSON.stringify(payload)).digest('hex')
      const active = !['COMPLETED', 'CANCELLED'].includes(trx.status)
      if (row.message_id && hash === row.render_hash) {
        await Panel.update({ active, sync_after: new Date(Date.now() + 15000), lease_token: null, lease_until: null, last_error: null }, { where: owned })
        return true
      }
      const recipient = await client.users.fetch(user.discord_id)
      const channel = await recipient.createDM()
      let existing
      if (row.message_id) {
        try { existing = await channel.messages.fetch(row.message_id) }
        catch (error) { if (Number(error.code) !== 10008) throw error }
      } else {
        // Upgrade the prior payment DM in place rather than send another panel.
        const recent = await channel.messages.fetch({ limit: 50 })
        existing = recent.find(message => message.author.id === client.user.id && message.embeds.some(embed => (embed.description || '').includes(trx.id) || embed.fields?.some(field => field.value.includes(trx.id))))
      }
      const message = existing ? await existing.edit(payload) : await channel.send({ ...payload, nonce: createHash('sha256').update(row.id).digest('hex').slice(0, 24), enforceNonce: true })
      await Panel.update({ message_id: message.id, channel_id: channel.id, render_hash: hash, active, sync_after: new Date(Date.now() + 15000), last_error: null, lease_token: null, lease_until: null }, { where: owned })
      return true
    })(), new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Panel Discord belum merespons.')), 30000) })])
    return success
  } catch (error) {
    await Panel.update({ last_error: Number(error.code) === 50007 ? 'DM penerima diblokir.' : 'Panel belum berhasil diperbarui; akan dicoba ulang.', sync_after: new Date(Date.now() + 30000), lease_token: null, lease_until: null }, { where: owned })
    return false
  } finally { clearTimeout(timeout) }
}
async function deliverPayment(transaction_id, role) {
  const trx = await Transaction.findByPk(transaction_id)
  if (!trx) return false
  await ensure(trx)
  const row = await Panel.findOne({ where: { transaction_id, role } })
  return row ? syncOne(row.id, true) : false
}
async function refresh(transaction_id) {
  await Panel.update({ active: true, sync_after: new Date() }, { where: { transaction_id } })
  worker.kick()
}
const worker = {
  build, ensure, syncOne, deliverPayment, refresh,
  async drain() {
    if (this.running || !require('./notification').discordClient?.isReady()) return
    this.running = true
    try {
      const rows = await Panel.findAll({ where: { active: true, sync_after: { [Op.lte]: new Date() } }, order: [['sync_after', 'ASC']], limit: 20 })
      for (const row of rows) await syncOne(row.id)
    } catch (error) { console.error('Transaction panel sync failed:', error.name) }
    finally { this.running = false }
  },
  kick() { void this.drain() },
  start() { if (!this.interval) this.interval = setInterval(() => this.kick(), 15000); this.kick() },
  stop() { clearInterval(this.interval); this.interval = null }
}
module.exports = worker
