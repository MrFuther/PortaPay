const { Client, GatewayIntentBits, REST, Routes } = require('discord.js')
const { commands, handleInteraction } = require('./commands')
const DashboardService = require('./dashboard')
const NotificationService = require('../../services/notification')
require('dotenv').config()

let discordClient = null

async function startDiscord() {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds]
  })
  discordClient = client

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
    Promise.resolve(handleInteraction(interaction, client)).catch(async error => {
      console.error('Discord interaction failed:', error.name)
      const payload = { content: error.name === 'Error' ? error.message : 'Aksi belum berhasil. Silakan coba lagi.' }
      try {
        if (interaction.deferred || interaction.replied) await interaction.editReply(payload)
        else await interaction.reply({ ...payload, flags: 64 })
      } catch (replyError) { console.error('Discord reply failed:', replyError.name) }
    })
  })

  await client.login(process.env.DISCORD_TOKEN)
}

async function stopDiscord(signal = 'MANUAL') {
  if (!discordClient) return
  console.log(`\n⚠️  Memperbarui Live Dashboard ke OFFLINE (${signal})...`)
  try {
    await DashboardService.setOffline(discordClient)
    console.log('✅ Live Dashboard diperbarui: Bot OFFLINE. Sampai jumpa!')
  } catch (err) {
    console.error('❌ Gagal memperbarui dashboard ke OFFLINE:', err.message)
  }
}

module.exports = { startDiscord, stopDiscord }
