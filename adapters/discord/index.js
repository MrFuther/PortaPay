const { Client, GatewayIntentBits, REST, Routes } = require('discord.js')
const { commands, handleInteraction } = require('./commands')
const DashboardService = require('./dashboard')
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
    // Start live stats dashboard — restore pinned message or post a new one
    DashboardService.start(client)
  })

  client.on('interactionCreate', (interaction) => {
    handleInteraction(interaction, client)
  })

  await client.login(process.env.DISCORD_TOKEN)

  // ── Graceful Shutdown ─────────────────────────────────────────────────────
  // Tangkap sinyal terminal (Ctrl+C atau kill) dan update dashboard ke OFFLINE
  // sebelum proses benar-benar berhenti, agar channel tidak menampilkan status
  // "ONLINE" yang salah saat bot sudah mati.
  async function shutdown(signal) {
    console.log(`\n⚠️  Sinyal ${signal} diterima. Memperbarui dashboard ke OFFLINE...`)
    await DashboardService.setOffline(client)
    console.log('✅ Dashboard diperbarui. Bot offline. Sampai jumpa!')
    process.exit(0)
  }

  process.on('SIGINT',  () => shutdown('SIGINT'))   // Ctrl+C di terminal
  process.on('SIGTERM', () => shutdown('SIGTERM'))  // kill / PM2 stop
}

module.exports = startDiscord