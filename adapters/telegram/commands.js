const EscrowService = require('../../services/escrow')
const fmt = require('./formatter')

async function registerCommands(bot) {

  // /start
  bot.command('start', async (ctx) => {
    await ctx.reply(fmt.help(), { parse_mode: 'Markdown' })
  })

  // /rekber <nominal> <fee_type> <deskripsi>
  bot.command('rekber', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    if (args.length < 3) {
      return ctx.reply(fmt.error('Format: /rekber <nominal> <fee_type> <deskripsi>\nContoh: /rekber 150000 EXCLUDE Sepatu Nike'))
    }

    const amount = parseFloat(args[0])
    if (isNaN(amount) || amount <= 0) {
      return ctx.reply(fmt.error('Nominal tidak valid.'))
    }

    let fee_type = args[1].toUpperCase()
    if (!['INC', 'EXC', 'INCLUDE', 'EXCLUDE'].includes(fee_type)) {
      return ctx.reply(fmt.error('Fee type harus INC atau EXC.'))
    }
    
    // Map to database ENUM
    if (fee_type === 'INC') fee_type = 'INCLUDE'
    if (fee_type === 'EXC') fee_type = 'EXCLUDE'

    const description = args.slice(2).join(' ')
    const user = ctx.from

    const result = await EscrowService.createSession({
      seller_platform_id: String(user.id),
      platform: 'TELEGRAM',
      amount,
      fee_type,
      description,
      username: user.username || user.first_name
    })

    if (!result.success) return ctx.reply(fmt.error(result.message))
    await ctx.reply(fmt.sessionCreated(result.transaction), { parse_mode: 'Markdown' })
  })

  // /join <id>
  bot.command('join', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    if (args.length < 1) {
      return ctx.reply(fmt.error('Format: /join <id_transaksi>'))
    }

    const user = ctx.from
    const result = await EscrowService.joinSession({
      transaction_id: args[0],
      buyer_platform_id: String(user.id),
      platform: 'TELEGRAM',
      username: user.username || user.first_name
    })

    if (!result.success) return ctx.reply(fmt.error(result.message))
    await ctx.reply(fmt.paymentInstruction(result.transaction, result.seller), { parse_mode: 'Markdown' })
  })

  // /status (tanpa ID)
  bot.command('status', async (ctx) => {
    const user = ctx.from
    const trx = await EscrowService.getActiveTransaction(String(user.id), 'TELEGRAM')
    if (!trx) return ctx.reply(fmt.error('Kamu tidak punya transaksi aktif.'))
    await ctx.reply(fmt.status(trx), { parse_mode: 'Markdown' })
  })

  // /kirim <ekspedisi> <nomor_resi>
  bot.command('kirim', async (ctx) => {
    const args = ctx.message.text.split(' ').slice(1)
    if (args.length < 2) {
      return ctx.reply(fmt.error('Format: /kirim <ekspedisi> <nomor_resi>\nContoh: /kirim JNE JNE123456789'))
    }

    const resi_expedition = args[0].toUpperCase()
    const resi_number = args[1]
    const user = ctx.from

    const result = await EscrowService.markAsDelivered({
      seller_platform_id: String(user.id),
      platform: 'TELEGRAM',
      resi_number,
      resi_expedition
    })

    if (!result.success) return ctx.reply(fmt.error(result.message))
    await ctx.reply(fmt.delivered(result.transaction), { parse_mode: 'Markdown' })
  })

  // /terima — lihat info resi dulu
  bot.command('terima', async (ctx) => {
    const user = ctx.from
    const result = await EscrowService.getResiInfo(String(user.id), 'TELEGRAM')
    if (!result.success) return ctx.reply(fmt.error(result.message))
    await ctx.reply(fmt.resiInfo(result.transaction), { parse_mode: 'Markdown' })
  })

  // /konfirmasi — selesaikan transaksi
  bot.command('konfirmasi', async (ctx) => {
    const user = ctx.from
    const result = await EscrowService.confirmReceived(String(user.id), 'TELEGRAM')
    if (!result.success) return ctx.reply(fmt.error(result.message))
    await ctx.reply(fmt.completed(result.transaction), { parse_mode: 'Markdown' })
  })

  // /dispute
  bot.command('dispute', async (ctx) => {
    const user = ctx.from
    const trx = await EscrowService.getActiveTransaction(String(user.id), 'TELEGRAM')
    if (!trx) return ctx.reply(fmt.error('Kamu tidak punya transaksi aktif.'))
    await ctx.reply(
      `⚠️ *Dispute Transaksi*\n\n` +
      `📋 *ID:* \`${trx.id}\`\n\n` +
      `Silakan hubungi admin untuk menyelesaikan dispute ini.\n` +
      `Sertakan ID transaksi di atas sebagai referensi.`,
      { parse_mode: 'Markdown' }
    )
  })
}

module.exports = registerCommands