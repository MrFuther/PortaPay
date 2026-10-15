const Escrow = require('../../services/escrow')
const User = require('../../db/models/user')
const panels = require('../../services/transaction-panels')
const input = (id, label, required = true) => ({ type: 1, components: [{ type: 4, custom_id: id, label, style: 1, required, max_length: 255 }] })
async function handle(interaction) {
  const match = /^escrow:(send|ship|received|confirm|dispute|complaint|refresh):([0-9a-f-]{36})$/i.exec(interaction.customId)
  if (!match) return
  const [, action, id] = match
  try {
    const [trx, user] = await Promise.all([Escrow.getTransaction(id), User.findOne({ where: { discord_id: interaction.user.id } })])
    if (!trx || !user || trx.platform !== 'DISCORD' || ![trx.seller_id, trx.buyer_id].includes(user.id)) return interaction.reply({ content: 'Kamu bukan peserta transaksi ini.', flags: 64 })
    const seller = trx.seller_id === user.id
    if (['send', 'ship'].includes(action) && (!seller || trx.status !== 'PAID')) return interaction.reply({ content: 'Hanya penjual dapat menandai pengiriman setelah pembayaran diterima.', flags: 64 })
    if (['received', 'confirm'].includes(action) && (seller || trx.status !== 'DELIVERED')) return interaction.reply({ content: 'Hanya pembeli dapat mengonfirmasi setelah barang diserahkan.', flags: 64 })
    if (action === 'send') {
      return interaction.showModal({ title: trx.type === 'DIGITAL' ? 'Penyerahan barang digital' : 'Pengiriman barang fisik', custom_id: `escrow:ship:${id}`, components: trx.type === 'DIGITAL' ? [input('note', 'Bukti/catatan penyerahan (opsional)', false)] : [input('carrier', 'Ekspedisi'), input('tracking', 'Nomor resi')] })
    }
    if (action === 'dispute') return interaction.showModal({ title: 'Ajukan komplain', custom_id: `escrow:complaint:${id}`, components: [input('reason', 'Alasan komplain')] })
    if (action === 'received') return interaction.reply({ content: 'Pastikan barang sudah diterima dan sesuai. Konfirmasi memulai hold 3 jam sebelum saldo penjual dikreditkan.', flags: 64, components: [{ type: 1, components: [{ type: 2, custom_id: `escrow:confirm:${id}`, label: 'Ya, barang sudah saya terima', style: 3 }] }] })
    await interaction.deferReply({ flags: 64 })
    let result = { success: true }
    if (action === 'ship') result = await Escrow.markAsDelivered({ seller_platform_id: interaction.user.id, platform: 'DISCORD', transaction_id: id, delivery_note: trx.type === 'DIGITAL' ? interaction.fields.getTextInputValue('note') : null, resi_expedition: trx.type === 'PHYSICAL' ? interaction.fields.getTextInputValue('carrier') : null, resi_number: trx.type === 'PHYSICAL' ? interaction.fields.getTextInputValue('tracking') : null })
    if (action === 'confirm') result = await Escrow.confirmReceived(interaction.user.id, 'DISCORD', id)
    if (action === 'complaint') result = await Escrow.triggerDispute({ user_platform_id: interaction.user.id, platform: 'DISCORD', transaction_id: id, reason: interaction.fields.getTextInputValue('reason') })
    if (!result.success) return interaction.editReply({ content: result.message, components: [] })
    await panels.refresh(id)
    return interaction.editReply({ content: action === 'refresh' ? 'Panel diperbarui otomatis dalam beberapa detik.' : action === 'confirm' ? 'Penerimaan dicatat. Masa hold 3 jam dimulai.' : action === 'complaint' ? 'Komplain dicatat. Pencairan dibekukan.' : 'Penyerahan/pengiriman dicatat. Menunggu konfirmasi pembeli.', components: [] })
  } catch (error) {
    const payload = { content: error.name === 'Error' ? error.message : 'Aksi belum berhasil. Silakan coba kembali.', components: [] }
    if (interaction.deferred || interaction.replied) return interaction.editReply(payload)
    return interaction.reply({ ...payload, flags: 64 })
  }
}
module.exports = { handle }
