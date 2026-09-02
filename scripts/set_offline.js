const { Client, GatewayIntentBits } = require('discord.js')
const DashboardService = require('../adapters/discord/dashboard')
require('dotenv').config()

async function main() {
  console.log('🔄 Menghubungkan ke Discord API untuk memperbarui status ke OFFLINE...')

  const client = new Client({ intents: [GatewayIntentBits.Guilds] })

  client.once('clientReady', async () => {
    console.log(`✅ Terhubung sebagai ${client.user.tag}`)
    try {
      await DashboardService.setOffline(client)
      console.log('✅ Live Dashboard di Discord berhasil di-set ke OFFLINE!')
    } catch (err) {
      console.error('❌ Gagal memperbarui dashboard:', err)
    } finally {
      client.destroy()
      process.exit(0)
    }
  })

  await client.login(process.env.DISCORD_TOKEN)
}

main().catch(console.error)
