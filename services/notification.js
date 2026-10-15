const User = require('../db/models/user')
const { createHash } = require('crypto')

const NotificationService = {
  discordClient: null,
  telegramBot: null,

  setDiscordClient(client) {
    this.discordClient = client
    require('./payment-notifications').kick()
    require('./transaction-panels').kick()
  },

  setTelegramBot(bot) {
    this.telegramBot = bot
    require('./payment-notifications').kick()
  },

  /**
   * Kirim pesan Direct Message (DM) ke user di platform tertentu
   */
  async sendDirectMessage({ platform, platform_id, content, embed, deliveryKey, plainText = false, throwOnError = false, transaction_id, role }) {
    if (!platform_id) return false

    try {
      if (platform === 'DISCORD' && transaction_id && role) return require('./transaction-panels').deliverPayment(transaction_id, role)
      if (platform === 'DISCORD' && this.discordClient) {
        const user = await this.discordClient.users.fetch(platform_id)
        if (user) {
          await user.send({
            ...(embed ? { embeds: [embed] } : { content }),
            allowedMentions: { parse: [] },
            ...(deliveryKey ? { nonce: createHash('sha256').update(deliveryKey).digest('hex').slice(0, 24), enforceNonce: true } : {})
          })
          return true
        }
      } else if (platform === 'TELEGRAM' && this.telegramBot) {
        await this.telegramBot.telegram.sendMessage(platform_id, content, plainText ? {} : { parse_mode: 'Markdown' })
        return true
      }
    } catch (error) {
      if (throwOnError) {
        const code = Number(error.code || error.response?.error_code)
        throw new Error(code === 50007 || code === 403 ? 'DM diblokir penerima/platform. Aktifkan izin DM; sistem akan mencoba ulang.' : 'Pengiriman DM gagal sementara; sistem akan mencoba ulang.')
      }
      console.warn(`⚠️ [NotificationService] Gagal mengirim DM ke ${platform} ID ${platform_id}:`, error.message)
    }
    return false
  },

  /**
   * Notifikasi saat Pembayaran Diterima (PAID)
   */
  async notifyPaid(transaction) {
    const queue = require('./payment-notifications')
    await require('../db').transaction(async dbTransaction => {
      const current = await require('../db/models/transaction').findByPk(transaction.id, { transaction: dbTransaction })
      if (!current) throw new Error('Transaksi notifikasi tidak ditemukan.')
      await queue.enqueue(current, dbTransaction)
    })
    queue.kick()
  },

  /**
   * Notifikasi saat Barang Dikirim (DELIVERED)
   */
  async notifyDelivered(transaction, buyer) {
    if (transaction.platform === 'DISCORD') return require('./transaction-panels').refresh(transaction.id)
    if (!buyer && transaction.buyer_id) buyer = await User.findByPk(transaction.buyer_id)
    if (!buyer) return

    const platform = transaction.platform
    const buyerPlatformId = platform === 'TELEGRAM' ? buyer.telegram_id : buyer.discord_id
    if (!buyerPlatformId) return

    const msg =
      `📦 *Barang Telah Dikirim oleh Penjual!*\n\n` +
      `📋 *ID Transaksi:* \`${transaction.id}\`\n` +
      `📦 *Barang:* ${transaction.description}\n` +
      `🚚 *Ekspedisi:* ${transaction.resi_expedition || '-'}\n` +
      `🔢 *Nomor Resi:* \`${transaction.resi_number || '-'}\`\n\n` +
      `Silakan periksa barang tersebut saat sampai. Ketik \`/terima\` untuk mengonfirmasi penerimaan.`

    const embed = {
      title: '📦 Barang Telah Dikirim oleh Penjual!',
      color: 0x0984e3,
      fields: [
        { name: '📋 ID Transaksi', value: `\`${transaction.id}\`` },
        { name: '📦 Barang', value: transaction.description, inline: true },
        { name: '🚚 Ekspedisi', value: transaction.resi_expedition || '-', inline: true },
        { name: '🔢 Nomor Resi', value: `\`${transaction.resi_number || '-'}\``, inline: true },
        { name: '✅ Tindakan', value: 'Jalankan `/terima` di channel operasional jika barang sudah diterima.' }
      ],
      timestamp: new Date()
    }

    await this.sendDirectMessage({
      platform,
      platform_id: buyerPlatformId,
      content: msg,
      embed: platform === 'DISCORD' ? embed : null
    })
  },

  /**
   * Notifikasi saat Transaksi Selesai (COMPLETED)
   */
  async notifyCompleted(transaction, seller, buyer) {
    if (transaction.platform === 'DISCORD') return require('./transaction-panels').refresh(transaction.id)
    if (!seller) seller = await User.findByPk(transaction.seller_id)
    if (!buyer && transaction.buyer_id) buyer = await User.findByPk(transaction.buyer_id)

    const platform = transaction.platform
    const sellerPlatformId = platform === 'TELEGRAM' ? seller?.telegram_id : seller?.discord_id
    const buyerPlatformId = platform === 'TELEGRAM' ? buyer?.telegram_id : buyer?.discord_id
    const released = Number(transaction.amount) - (transaction.fee_type === 'INCLUDE' ? Number(transaction.fee) : 0)
    const amountStr = `Rp ${released.toLocaleString('id-ID')}`

    // DM ke Seller
    if (sellerPlatformId) {
      const sellerMsg =
        `🎉 *Transaksi Selesai!*\n\n` +
        `📋 *ID Transaksi:* \`${transaction.id}\`\n` +
        `📦 *Barang:* ${transaction.description}\n` +
        `💰 *Dana Cair:* ${amountStr}\n\n` +
        `Pencairan dana telah masuk ke saldo akun Anda (\`available_balance\`). Ketik \`/withdraw\` untuk menarik dana ke rekening/e-wallet Anda.`

      const sellerEmbed = {
        title: '🎉 Transaksi Selesai — Saldo Dicairkan!',
        color: 0x6c5ce7,
        fields: [
          { name: '📋 ID Transaksi', value: `\`${transaction.id}\`` },
          { name: '📦 Barang', value: transaction.description, inline: true },
          { name: '💰 Dana Cair', value: amountStr, inline: true },
          { name: '💸 Penarikan Dana', value: 'Gunakan command `/withdraw` untuk menarik saldo ke bank / e-wallet kamu.' }
        ],
        timestamp: new Date()
      }

      await this.sendDirectMessage({
        platform,
        platform_id: sellerPlatformId,
        content: sellerMsg,
        embed: platform === 'DISCORD' ? sellerEmbed : null
      })
    }

    // DM ke Buyer
    if (buyerPlatformId) {
      const buyerMsg =
        `🎉 *Transaksi Selesai!*\n\n` +
        `📋 *ID Transaksi:* \`${transaction.id}\`\n` +
        `📦 *Barang:* ${transaction.description}\n\n` +
        `Terima kasih telah menggunakan Rekber PortaPay!`

      const buyerEmbed = {
        title: '🎉 Transaksi Selesai!',
        color: 0x6c5ce7,
        fields: [
          { name: '📋 ID Transaksi', value: `\`${transaction.id}\`` },
          { name: '📦 Barang', value: transaction.description, inline: true },
          { name: '🙏 Info', value: 'Terima kasih telah bertransaksi secara aman melalui PortaPay!' }
        ],
        timestamp: new Date()
      }

      await this.sendDirectMessage({
        platform,
        platform_id: buyerPlatformId,
        content: buyerMsg,
        embed: platform === 'DISCORD' ? buyerEmbed : null
      })
    }
  },

  /**
   * Notifikasi saat Transaksi Dibekukan (FROZEN / KOMPLAIN)
   */
  async notifyFrozen(transaction, seller, buyer, complainantId, reason) {
    if (transaction.platform === 'DISCORD') return require('./transaction-panels').refresh(transaction.id)
    if (!seller) seller = await User.findByPk(transaction.seller_id)
    if (!buyer && transaction.buyer_id) buyer = await User.findByPk(transaction.buyer_id)

    const platform = transaction.platform
    const sellerPlatformId = platform === 'TELEGRAM' ? seller?.telegram_id : seller?.discord_id
    const buyerPlatformId = platform === 'TELEGRAM' ? buyer?.telegram_id : buyer?.discord_id

    const notifyUser = async (targetPlatformId, isComplainant) => {
      if (!targetPlatformId) return

      const roleStr = isComplainant ? 'Kamu telah mengajukan komplain' : 'Pihak lawan telah mengajukan komplain'
      const msg =
        `⚠️ *Transaksi Dibekukan (FROZEN)*\n\n` +
        `📋 *ID Transaksi:* \`${transaction.id}\`\n` +
        `📦 *Barang:* ${transaction.description}\n` +
        `📝 *Alasan:* ${reason || '-'}\n\n` +
        `${roleStr}. Transaksi dibekukan dan pencairan dana ditahan sampai ditangani Admin.`

      const embed = {
        title: '⚠️ Transaksi Dibekukan (FROZEN)',
        color: 0xd63031,
        description: `${roleStr} pada transaksi **#${transaction.id.substring(0, 8)}**.`,
        fields: [
          { name: '📋 ID Transaksi', value: `\`${transaction.id}\`` },
          { name: '📦 Barang', value: transaction.description, inline: true },
          { name: '📝 Alasan', value: reason || '_Tidak ada deskripsi_', inline: false },
          { name: '🛡️ Info', value: 'Pencairan dana ditahan. Admin akan membantu memverifikasi transaksi ini.' }
        ],
        timestamp: new Date()
      }

      await this.sendDirectMessage({
        platform,
        platform_id: targetPlatformId,
        content: msg,
        embed: platform === 'DISCORD' ? embed : null
      })
    }

    if (sellerPlatformId) {
      await notifyUser(sellerPlatformId, sellerPlatformId === complainantId)
    }
    if (buyerPlatformId) {
      await notifyUser(buyerPlatformId, buyerPlatformId === complainantId)
    }
  }
}

module.exports = NotificationService
