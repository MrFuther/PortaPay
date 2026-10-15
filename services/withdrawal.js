const User = require('../db/models/user')
const Withdrawal = require('../db/models/withdrawal')
const sequelize = require('../db')
const { cents } = require('./money')
const { changeBalance } = require('./finance')
require('dotenv').config()

const MIN_WITHDRAW_AMOUNT = parseFloat(process.env.MIN_WITHDRAW_AMOUNT || '10000')

const WithdrawalService = {
  /**
   * Mengajukan penarikan dana (withdraw)
   */
  async requestWithdrawal({ user_platform_id, platform, amount, bank_name, account_number, account_name }) {
    try {
      const numAmount = cents(amount, { positive: true }) / 100
      if (!['DISCORD', 'TELEGRAM'].includes(platform) || ![bank_name, account_number, account_name].every(v => typeof v === 'string' && v.trim() && v.length <= 255)) {
        return { success: false, message: 'Nominal penarikan dana tidak valid.' }
      }

      if (numAmount < MIN_WITHDRAW_AMOUNT) {
        return {
          success: false,
          message: `Minimal penarikan dana adalah Rp ${MIN_WITHDRAW_AMOUNT.toLocaleString('id-ID')}.`
        }
      }

      return await sequelize.transaction(async transaction => {
      const field = platform === 'TELEGRAM' ? 'telegram_id' : 'discord_id'
      const user = await User.findOne({ where: { [field]: user_platform_id }, transaction, lock: transaction.LOCK.UPDATE })
      if (!user) {
        return { success: false, message: 'Akun user belum terdaftar.' }
      }

      const availableBalance = Number(user.available_balance)
      if (availableBalance < numAmount) {
        return {
          success: false,
          message: `Saldo tidak mencukupi.\n💰 Saldo kamu: Rp ${availableBalance.toLocaleString('id-ID')}\n💸 Pengajuan: Rp ${numAmount.toLocaleString('id-ID')}`
        }
      }

      // Potong saldo user untuk mencegah penarikan ganda (double withdraw)
      const newBalance = availableBalance - numAmount

      // Buat pengajuan penarikan dana
      const withdrawal = await Withdrawal.create({
        user_id: user.id,
        amount: numAmount,
        bank_name: bank_name.toUpperCase(),
        account_number,
        account_name,
        status: 'PENDING',
        platform
      }, { transaction })
      await changeBalance(user, -cents(amount), `withdrawal:${withdrawal.id}`, transaction)

      return {
        success: true,
        withdrawal,
        user,
        newBalance
      }
      })
    } catch (error) {
      console.error('Error in requestWithdrawal:', error)
      return { success: false, message: 'Terjadi kesalahan sistem saat memproses penarikan dana.' }
    }
  },

  /**
   * Mengambil daftar riwayat penarikan dana milik user
   */
  async getUserWithdrawals(user_platform_id, platform) {
    const field = platform === 'TELEGRAM' ? 'telegram_id' : 'discord_id'
    const user = await User.findOne({ where: { [field]: user_platform_id } })
    if (!user) return []

    return await Withdrawal.findAll({
      where: { user_id: user.id },
      order: [['createdAt', 'DESC']],
      limit: 10
    })
  }
}

module.exports = WithdrawalService
