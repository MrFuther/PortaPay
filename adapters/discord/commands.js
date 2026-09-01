const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, PermissionFlagsBits } = require('discord.js')
const EscrowService = require('../../services/escrow')
const fmt = require('./formatter')
const GuildSettings = require('../../db/guild-settings')
const DashboardService = require('./dashboard')

// Temporary store for multi-step /rekber session setup
const pendingSessions = new Map()

const commands = [
  new SlashCommandBuilder()
    .setName('start')
    .setDescription('Lihat panduan penggunaan bot'),

  new SlashCommandBuilder()
    .setName('rekber')
    .setDescription('Buat sesi rekber baru')
    .addNumberOption(o => o.setName('nominal').setDescription('Nominal transaksi').setRequired(true))
    .addStringOption(o => o.setName('deskripsi').setDescription('Deskripsi barang').setRequired(true)),

  new SlashCommandBuilder()
    .setName('join')
    .setDescription('Join sesi rekber sebagai pembeli')
    .addStringOption(o => o.setName('id').setDescription('ID transaksi').setRequired(true)),

  new SlashCommandBuilder()
    .setName('statustransaksi')
    .setDescription('Cek status transaksi aktif kamu'),

  new SlashCommandBuilder()
    .setName('kirim')
    .setDescription('Tandai barang sudah dikirim')
    .addStringOption(o => o.setName('ekspedisi').setDescription('Nama ekspedisi (JNE, SICEPAT, dll)').setRequired(true))
    .addStringOption(o => o.setName('resi').setDescription('Nomor resi pengiriman').setRequired(true)),

  new SlashCommandBuilder()
    .setName('terima')
    .setDescription('Lihat info resi dan konfirmasi penerimaan barang'),

  new SlashCommandBuilder()
    .setName('konfirmasi')
    .setDescription('Selesaikan transaksi setelah barang diterima'),

  new SlashCommandBuilder()
    .setName('cancel')
    .setDescription('Batalkan sesi rekber yang sedang menunggu pembeli'),

  new SlashCommandBuilder()
    .setName('komplain')
    .setDescription('Ajukan komplain & bekukan transaksi jika ada kendala')
    .addStringOption(o => o.setName('alasan').setDescription('Alasan/detail komplain').setRequired(false)),

  new SlashCommandBuilder()
    .setName('setupbot')
    .setDescription('Jadikan channel ini sebagai channel operasional bot Rekber (Admin only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
]

async function handleInteraction(interaction) {
  // ─── Handle Button Interactions ───
  if (interaction.isButton()) {
    return handleButton(interaction)
  }

  if (!interaction.isChatInputCommand()) return

  const user = interaction.user
  const platform = 'DISCORD'

  // Helper: reply with ephemeral flag
  const ephReply = (data) => interaction.reply({ ...data, ephemeral: true })

  // ── Channel Guard ─────────────────────────────────────────────────────────
  // Bot hanya merespons perintah di channel operasional yang sudah diatur admin.
  // /setupbot dikecualikan agar admin bisa mengatur ulang channel dari mana saja.
  if (interaction.guildId && interaction.commandName !== 'setupbot') {
    const guildCfg = GuildSettings.getGuildSettings(interaction.guildId)
    if (guildCfg.operationalChannelId &&
        interaction.channelId !== guildCfg.operationalChannelId) {
      return interaction.reply({
        content: `🚫 **Bot Rekber hanya beroperasi di <#${guildCfg.operationalChannelId}>.**\nSilakan gunakan perintah di channel tersebut.`,
        ephemeral: true
      })
    }
  }

  if (interaction.commandName === 'start') {

    return ephReply(fmt.help())
  }

  if (interaction.commandName === 'rekber') {
    const amount = interaction.options.getNumber('nominal')
    const description = interaction.options.getString('deskripsi')

    if (amount <= 0) return ephReply(fmt.error('Nominal tidak valid.'))

    // Check for existing active transaction first
    const existing = await EscrowService.getActiveTransaction(user.id, platform)
    if (existing) {
      return ephReply(fmt.error(
        `Kamu masih punya transaksi aktif!\n📋 ID: ${existing.id}\n🏷️ Status: ${existing.status}\n\nSelesaikan transaksi tersebut terlebih dahulu.`
      ))
    }

    // Store pending session data
    pendingSessions.set(user.id, { amount, description, platform, username: user.username })

    // Step 1: Ask fee type via buttons
    const feeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('fee_exclude')
        .setLabel('Exclude (Buyer bayar fee)')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💸'),
      new ButtonBuilder()
        .setCustomId('fee_include')
        .setLabel('Include (Fee dipotong dari nominal)')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📦')
    )

    return ephReply({
      embeds: [{
        title: '🏷️ Pilih Tipe Fee',
        color: 0x6c5ce7,
        description: `**📦 Barang:** ${description}\n**💰 Nominal:** Rp ${amount.toLocaleString('id-ID')}`,
        fields: [
          {
            name: '💸 Exclude',
            value: 'Pembeli membayar harga barang **+ fee platform** di atas nominal.\nPenjual menerima **full** nominal barang.',
            inline: true
          },
          {
            name: '📦 Include',
            value: 'Pembeli membayar **sesuai nominal** saja.\nFee platform **dipotong** dari nominal yang diterima penjual.',
            inline: true
          }
        ],
        footer: { text: 'Pilih salah satu tipe fee di bawah ini' }
      }],
      components: [feeRow]
    })
  }

  if (interaction.commandName === 'join') {
    const id = interaction.options.getString('id')

    const result = await EscrowService.joinSession({
      transaction_id: id,
      buyer_platform_id: user.id,
      platform,
      username: user.username
    })

    if (!result.success) return ephReply(fmt.error(result.message))
    return ephReply(fmt.paymentInstruction(result.transaction, result.seller))
  }

  if (interaction.commandName === 'statustransaksi') {
    const trx = await EscrowService.getActiveTransaction(user.id, platform)
    if (!trx) return ephReply(fmt.error('Kamu tidak punya transaksi aktif.'))
    return ephReply(fmt.status(trx))
  }

  if (interaction.commandName === 'kirim') {
    const resi_expedition = interaction.options.getString('ekspedisi').toUpperCase()
    const resi_number = interaction.options.getString('resi')

    const result = await EscrowService.markAsDelivered({
      seller_platform_id: user.id,
      platform,
      resi_number,
      resi_expedition
    })

    if (!result.success) return ephReply(fmt.error(result.message))
    return ephReply(fmt.delivered(result.transaction))
  }

  if (interaction.commandName === 'terima') {
    const result = await EscrowService.getResiInfo(user.id, platform)
    if (!result.success) return ephReply(fmt.error(result.message))
    return ephReply(fmt.resiInfo(result.transaction))
  }

  if (interaction.commandName === 'konfirmasi') {
    const result = await EscrowService.confirmReceived(user.id, platform)
    if (!result.success) return ephReply(fmt.error(result.message))
    return ephReply(fmt.completed(result.transaction))
  }

  if (interaction.commandName === 'cancel') {
    const result = await EscrowService.cancelSession({
      seller_platform_id: user.id,
      platform
    })
    if (!result.success) return ephReply(fmt.error(result.message))
    return ephReply(fmt.cancelled(result.transaction))
  }

  if (interaction.commandName === 'komplain' || interaction.commandName === 'dispute') {
    const reason = interaction.options.getString('alasan')
    const result = await EscrowService.triggerDispute({
      user_platform_id: user.id,
      platform,
      reason
    })

    if (!result.success) return ephReply(fmt.error(result.message))
    return ephReply(fmt.dispute(result.transaction, result.reason))
  }

  if (interaction.commandName === 'setupbot') {
    if (!interaction.guildId) {
      return ephReply({ content: '❌ Command ini hanya bisa digunakan di dalam server Discord.' })
    }

    const channelId = interaction.channelId
    const channelName = interaction.channel?.name || channelId

    // Defer agar ada waktu untuk setup dashboard (async DB + Discord API)
    await interaction.deferReply({ ephemeral: true })

    await DashboardService.setupForGuild(interaction.client, interaction.guildId, channelId)

    return interaction.editReply({
      embeds: [{
        title: '✅ Channel Operasional Berhasil Diatur',
        color: 0x00b894,
        description:
          `Channel <#${channelId}> (\`#${channelName}\`) sekarang menjadi **channel operasional bot Rekber**.\n\n` +
          `📌 Dashboard statistik telah dikirim dan akan diperbarui otomatis setiap **5 menit**.\n\n` +
          `⚠️ Bot **hanya akan merespons perintah** di channel ini.`,
        fields: [
          { name: '📋 Channel', value: `<#${channelId}>`, inline: true },
          { name: '🔄 Update Interval', value: '5 menit', inline: true }
        ],
        footer: { text: 'Gunakan /setupbot lagi di channel lain untuk memindahkan bot' }
      }]
    })
  }
}


// ─── Button Handler ─────────────────────────────────────────────────────────
async function handleButton(interaction) {
  const userId = interaction.user.id
  const customId = interaction.customId

  const ephUpdate = (data) => interaction.update({ ...data, ephemeral: true })
  const ephReply = (data) => interaction.reply({ ...data, ephemeral: true })

  // ── Step 1 result: Fee type selected ──
  if (customId === 'fee_exclude' || customId === 'fee_include') {
    const session = pendingSessions.get(userId)
    if (!session) {
      return ephReply(fmt.error('Sesi pembuatan rekber sudah kadaluarsa. Silakan ketik `/rekber` lagi.'))
    }

    // Save fee_type choice
    session.fee_type = customId === 'fee_exclude' ? 'EXCLUDE' : 'INCLUDE'
    pendingSessions.set(userId, session)

    // Step 2: Ask item type via buttons
    const typeRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('type_digital')
        .setLabel('Digital (Tanpa Resi)')
        .setStyle(ButtonStyle.Success)
        .setEmoji('💻'),
      new ButtonBuilder()
        .setCustomId('type_physical')
        .setLabel('Fisik (Perlu Resi)')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📦')
    )

    const feeLabel = session.fee_type === 'EXCLUDE' ? 'Exclude' : 'Include'

    return ephUpdate({
      embeds: [{
        title: '📦 Pilih Jenis Barang',
        color: 0x00b894,
        description: `**📦 Barang:** ${session.description}\n**💰 Nominal:** Rp ${session.amount.toLocaleString('id-ID')}\n**🏷️ Fee:** ${feeLabel}`,
        fields: [
          {
            name: '💻 Digital',
            value: 'Barang digital (akun, voucher, file, dll).\nPenjual **tidak perlu** input resi pengiriman.',
            inline: true
          },
          {
            name: '📦 Fisik',
            value: 'Barang fisik yang dikirim via ekspedisi.\nPenjual **wajib** input resi pengiriman.',
            inline: true
          }
        ],
        footer: { text: 'Pilih jenis barang di bawah ini' }
      }],
      components: [typeRow]
    })
  }

  // ── Step 2 result: Item type selected → Create session ──
  if (customId === 'type_digital' || customId === 'type_physical') {
    const session = pendingSessions.get(userId)
    if (!session) {
      return ephReply(fmt.error('Sesi pembuatan rekber sudah kadaluarsa. Silakan ketik `/rekber` lagi.'))
    }

    const type = customId === 'type_digital' ? 'DIGITAL' : 'PHYSICAL'

    // Clean up pending session
    pendingSessions.delete(userId)

    // Create the escrow session
    const result = await EscrowService.createSession({
      seller_platform_id: userId,
      platform: session.platform,
      amount: session.amount,
      fee_type: session.fee_type,
      type,
      description: session.description,
      username: session.username
    })

    if (!result.success) {
      return ephUpdate({
        ...fmt.error(result.message),
        components: []
      })
    }

    // Add cancel button to the session created embed
    const cancelRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`cancel_session_${result.transaction.id}`)
        .setLabel('Batalkan Sesi')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🗑️')
    )

    return ephUpdate({
      ...fmt.sessionCreated(result.transaction),
      components: [cancelRow]
    })
  }

  // ── Cancel session button ──
  if (customId.startsWith('cancel_session_')) {
    const transactionId = customId.replace('cancel_session_', '')

    const result = await EscrowService.cancelSession({
      seller_platform_id: userId,
      platform: 'DISCORD',
      transaction_id: transactionId
    })

    if (!result.success) {
      return ephReply(fmt.error(result.message))
    }

    return ephUpdate({
      ...fmt.cancelled(result.transaction),
      components: []
    })
  }
}

// Auto-expire pending sessions after 2 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [userId, session] of pendingSessions) {
    if (!session._createdAt) {
      session._createdAt = now
    } else if (now - session._createdAt > 2 * 60 * 1000) {
      pendingSessions.delete(userId)
    }
  }
}, 60 * 1000)

module.exports = { commands, handleInteraction }