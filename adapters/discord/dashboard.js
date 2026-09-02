/**
 * Dashboard Service — builds the live stats embed and manages the pinned message
 * in the guild's operational channel. Auto-updates every N minutes.
 *
 * Privacy design:
 *  - Nominal transaksi ditampilkan sebagai rentang, bukan angka pasti
 *  - Tidak ada info seller/buyer yang ditampilkan
 *  - Hanya jenis barang, rentang harga, dan waktu (HH:MM) yang tampil
 */
const { EmbedBuilder } = require('discord.js')
const StatsService = require('../../services/stats')
const GuildSettings = require('../../db/guild-settings')

const INTERVAL_MS = (parseInt(process.env.STATS_UPDATE_INTERVAL_MINUTES) || 5) * 60 * 1000

// In-memory map: guildId -> { messageId }
const dashboardMessages = new Map()

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Sensor nominal ke rentang harga untuk menjaga privasi user.
 * Contoh: Rp 1.350.000 → "Rp 1jt – 5jt"
 */
function censorAmount(amount) {
  const n = parseFloat(amount)
  if (n < 100_000)    return '< Rp 100rb'
  if (n < 500_000)    return 'Rp 100rb – 500rb'
  if (n < 1_000_000)  return 'Rp 500rb – 1jt'
  if (n < 5_000_000)  return 'Rp 1jt – 5jt'
  if (n < 10_000_000) return 'Rp 5jt – 10jt'
  if (n < 50_000_000) return 'Rp 10jt – 50jt'
  return '> Rp 50jt'
}

function formatRupiah(amount) {
  return `Rp ${parseFloat(amount).toLocaleString('id-ID')}`
}

function formatUptime(startTime) {
  const diff = Date.now() - startTime
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h > 0) return `${h}j ${m}m`
  return `${m}m`
}

// ─── Embed Builder ───────────────────────────────────────────────────────────

function buildEmbed(stats, uptimeStart) {
  const now = new Date()
  const monthName = now.toLocaleString('id-ID', { month: 'long', year: 'numeric' })

  // Build today's completed transaction list (privacy-safe)
  let completedList = '*Belum ada transaksi selesai hari ini.*'
  if (stats.todayCompleted?.length > 0) {
    completedList = stats.todayCompleted.map(t => {
      const time = new Date(t.updatedAt).toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Jakarta'
      })
      const typeIcon = t.type === 'DIGITAL' ? '💻' : '📦'
      const typeLabel = t.type === 'DIGITAL' ? 'Digital' : 'Fisik'
      return `\`${time} WIB\`  ${typeIcon} ${typeLabel}  •  ${censorAmount(t.amount)}  ✅`
    }).join('\n')
  }

  return new EmbedBuilder()
    .setTitle('🛡️  PortaPay BOT  —  Live Dashboard')
    .setColor(0x5865F2)
    .setDescription(
      '> *Platform rekening bersama otomatis untuk transaksi yang **aman** dan **terpercaya**.*\n' +
      '> Data diperbarui secara real-time dari database.'
    )
    .addFields(
      {
        name: '🟢 Status Bot',
        value: '```ansi\n\u001b[32m● ONLINE\u001b[0m\n```',
        inline: true
      },
      {
        name: '⚡ Uptime',
        value: `\`${formatUptime(uptimeStart)}\``,
        inline: true
      },
      { name: '\u200b', value: '\u200b', inline: true },

      {
        name: '━━━━━━  📊 STATISTIK HARI INI  ━━━━━━',
        value: '\u200b'
      },
      {
        name: '🔄 Sesi Aktif Sekarang',
        value: `**${stats.activeCount}** sesi`,
        inline: true
      },
      {
        name: '💰 Dana Diamankan Hari Ini',
        value: `**${formatRupiah(stats.dailyAmount)}**`,
        inline: true
      },
      { name: '\u200b', value: '\u200b', inline: true },

      {
        name: `━━━━━━  📅 BULAN INI (${monthName})  ━━━━━━`,
        value: '\u200b'
      },
      {
        name: '🏆 Transaksi Sukses',
        value: `**${stats.monthly.count}** transaksi`,
        inline: true
      },
      {
        name: '💵 Volume Berhasil',
        value: `**${formatRupiah(stats.monthly.volume)}**`,
        inline: true
      },
      { name: '\u200b', value: '\u200b', inline: true },

      {
        name: '━━━━━━  ✅ BERHASIL HARI INI  ━━━━━━',
        value: completedList
      }
    )
    .setFooter({
      text: '🔄 Auto-update setiap 5 menit  •  💡 Nominal ditampilkan dalam rentang untuk menjaga privasi transaksi'
    })
    .setTimestamp()
}

// Embed khusus saat bot dimatikan — ditampilkan di semua channel dashboard
function buildOfflineEmbed() {
  return new EmbedBuilder()
    .setTitle('🛡️  PortaPay BOT  —  Live Dashboard')
    .setColor(0xed4245) // Discord red
    .setDescription(
      '> ⚠️ *Bot sedang **offline**. Layanan rekber tidak tersedia saat ini.*\n' +
      '> Silakan tunggu, bot akan kembali online sebentar lagi.'
    )
    .addFields(
      {
        name: '🔴 Status Bot',
        value: '```ansi\n\u001b[31m● OFFLINE\u001b[0m\n```',
        inline: true
      },
      {
        name: '🕐 Offline Sejak',
        value: `<t:${Math.floor(Date.now() / 1000)}:R>`,
        inline: true
      }
    )
    .setFooter({ text: '⚡ PortaPay Bot  •  Menunggu restart...' })
    .setTimestamp()
}

// ─── Dashboard Service ───────────────────────────────────────────────────────

const DashboardService = {
  _uptimeStart: Date.now(),

  async _updateGuild(client, guildId) {
    const settings = GuildSettings.getGuildSettings(guildId)
    if (!settings.operationalChannelId) return

    try {
      const channel = await client.channels.fetch(settings.operationalChannelId)
      if (!channel) return

      const stats = await StatsService.getAllStats()
      const embed = buildEmbed(stats, DashboardService._uptimeStart)

      // Try to edit existing pinned message
      const stored = dashboardMessages.get(guildId)
      if (stored?.messageId) {
        try {
          const msg = await channel.messages.fetch(stored.messageId)
          await msg.edit({ embeds: [embed] })
          return
        } catch (_) {
          // Message was deleted — fall through to send a new one
        }
      }

      // Send new dashboard message
      const msg = await channel.send({ embeds: [embed] })
      dashboardMessages.set(guildId, { messageId: msg.id })
      GuildSettings.setGuildSettings(guildId, { dashboardMessageId: msg.id })

      // Pin the message (ignore errors if bot lacks permission)
      try { await msg.pin() } catch (_) {}

    } catch (err) {
      console.error(`❌ [Dashboard] Gagal update guild ${guildId}:`, err.message)
    }
  },

  // Restore in-memory state from persisted settings on startup
  async _initGuild(client, guildId) {
    const settings = GuildSettings.getGuildSettings(guildId)
    if (!settings.operationalChannelId) return

    if (settings.dashboardMessageId) {
      dashboardMessages.set(guildId, { messageId: settings.dashboardMessageId })
    }

    await DashboardService._updateGuild(client, guildId)
  },

  // Called from discord/index.js on 'clientReady'
  start(client) {
    client.guilds.cache.forEach(guild => {
      DashboardService._initGuild(client, guild.id)
    })

    setInterval(() => {
      client.guilds.cache.forEach(guild => {
        DashboardService._updateGuild(client, guild.id)
      })
    }, INTERVAL_MS)

    console.log(`✅ Dashboard Service started (interval: ${INTERVAL_MS / 60000} menit)`)
  },

  // Called from /setupbot command after setting the new channel
  async setupForGuild(client, guildId, channelId) {
    GuildSettings.setGuildSettings(guildId, {
      operationalChannelId: channelId,
      dashboardMessageId: null  // reset so a fresh message is sent
    })
    dashboardMessages.delete(guildId)
    await DashboardService._updateGuild(client, guildId)
  },

  // Called on graceful shutdown (SIGINT/SIGTERM) to mark bot as OFFLINE
  // di semua channel dashboard sebelum proses benar-benar berhenti.
  async setOffline(client) {
    const embed = buildOfflineEmbed()
    const allSettings = GuildSettings.getAllGuildSettings()
    const jobs = []

    for (const [guildId, settings] of Object.entries(allSettings)) {
      const messageId = settings.dashboardMessageId || dashboardMessages.get(guildId)?.messageId
      if (!settings.operationalChannelId || !messageId) continue

      jobs.push(
        (async () => {
          try {
            const channel = await client.channels.fetch(settings.operationalChannelId)
            if (channel) {
              const msg = await channel.messages.fetch(messageId)
              if (msg) {
                await msg.edit({ embeds: [embed] })
                console.log(`✅ [Dashboard] Guild ${guildId} di-set OFFLINE.`)
              }
            }
          } catch (err) {
            console.error(`❌ [Dashboard] Gagal set offline untuk guild ${guildId}:`, err.message)
          }
        })()
      )
    }

    await Promise.allSettled(jobs)
  }
}

module.exports = DashboardService
