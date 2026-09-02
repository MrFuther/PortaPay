const { Client, GatewayIntentBits, REST, Routes } = require('discord.js')
const { commands, handleInteraction } = require('./commands')
const DashboardService = require('./dashboard')
const NotificationService = require('../../services/notification')
require('dotenv').config()

async function startDiscord() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  })

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN)
  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: commands.map(c => c.toJSON()) }
  )
  console.log('✅ Discord slash commands terdaftar')

  client.once('clientReady', () => {
    console.log(`✅ Discord Bot berjalan sebagai ${client.user.tag}`)
    NotificationService.setDiscordClient(client)
    // Start live stats dashboard — restore pinned message or post a new one
    DashboardService.start(client)
  })

  client.on('interactionCreate', (interaction) => {
    handleInteraction(interaction, client)
  })

  await client.login(process.env.DISCORD_TOKEN)

  // ── Graceful Shutdown ─────────────────────────────────────────────────────
  // Tangkap sinyal terminal (Ctrl+C, SIGTERM, atau nodemon SIGUSR2) dan update
  // dashboard ke OFFLINE sebelum proses benar-benar berhenti.
  let isShuttingDown = false

  async function shutdown(signal) {
    if (isShuttingDown) return
    isShuttingDown = true
    console.log(`\n⚠️  Sinyal ${signal} diterima. Memperbarui Live Dashboard ke OFFLINE...`)
    try {
      await DashboardService.setOffline(client)
      console.log('✅ Live Dashboard diperbarui: Bot OFFLINE. Sampai jumpa!')
    } catch (err) {
      console.error('❌ Gagal memperbarui dashboard ke OFFLINE:', err.message)
    } finally {
      process.exit(0)
    }
  }

  process.once('SIGINT',  () => shutdown('SIGINT'))   // Ctrl+C di terminal
  process.once('SIGTERM', () => shutdown('SIGTERM'))  // kill / PM2 stop
  process.once('SIGUSR2', () => shutdown('SIGUSR2'))  // nodemon restart
}

module.exports = startDiscord