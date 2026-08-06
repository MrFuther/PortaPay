const { Telegraf } = require('telegraf')
const registerCommands = require('./commands')
require('dotenv').config()

async function startTelegram() {
  const bot = new Telegraf(process.env.TELEGRAM_TOKEN)
  await registerCommands(bot)
  bot.launch()
  console.log('✅ Telegram Bot berjalan')

  process.once('SIGINT', () => bot.stop('SIGINT'))
  process.once('SIGTERM', () => bot.stop('SIGTERM'))
}

module.exports = startTelegram