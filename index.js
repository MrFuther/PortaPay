require('dotenv').config()
const sequelize = require('./db/index')
require('./db/models/user')
require('./db/models/transaction')
const startTelegram = require('./adapters/telegram/index')
const { startDiscord, stopDiscord } = require('./adapters/discord/index')
const express = require('express')
const webhookHandler = require('./webhook/handler')
const mockHandler = require('./webhook/mock')
const adminRoutes = require('./routes/admin')
const TimerService = require('./services/timer')
const PaymentNotifications = require('./services/payment-notifications')
const TransactionPanels = require('./services/transaction-panels')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3000

// Middleware JSON & CORS header untuk dashboard React
app.use(express.json({ limit: '100kb', verify: (req, res, buffer) => { req.rawBody = Buffer.from(buffer) } }))
app.use((req, res, next) => {
  if (process.env.ADMIN_ORIGIN && req.headers.origin === process.env.ADMIN_ORIGIN) {
    res.header('Access-Control-Allow-Origin', process.env.ADMIN_ORIGIN)
    res.header('Access-Control-Allow-Credentials', 'true')
    res.header('Vary', 'Origin')
  }
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization')
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  if (req.method === 'OPTIONS') return res.sendStatus(200)
  next()
})

// Mount Admin REST API
app.use('/api/admin', adminRoutes)

// Mount Webhook
app.use('/tripay', webhookHandler)

// Serve Static Frontend Admin Panel (bila diproduksi / built)
app.use('/admin', express.static(path.join(__dirname, 'admin-dashboard/dist')))

// Mount Mock Payment Gateway
if (process.env.MOCK_PAYMENT === 'true' && process.env.NODE_ENV !== 'production') {
  app.use('/mock-pay', mockHandler)
}

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
let isShuttingDown = false
async function gracefulShutdown(signal) {
  if (isShuttingDown) return
  isShuttingDown = true
  PaymentNotifications.stop()
  TransactionPanels.stop()
  console.log(`\n⚠️  Sinyal ${signal} diterima. Memperbarui Live Dashboard ke OFFLINE...`)
  await stopDiscord(signal)
  process.exit(0)
}

process.once('SIGINT', () => gracefulShutdown('SIGINT'))
process.once('SIGBREAK', () => gracefulShutdown('SIGBREAK'))
process.once('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.once('SIGUSR2', () => gracefulShutdown('SIGUSR2'))

async function start() {
  try {
    await sequelize.authenticate()
    console.log('✅ Database terhubung')
    
    if (!require('./services/admin-auth').validConfig) throw new Error('ADMIN_PASSWORD wajib unik dan minimal 16 karakter.')
    if (process.env.NODE_ENV === 'production' && process.env.MOCK_PAYMENT === 'true') throw new Error('MOCK_PAYMENT tidak boleh aktif di production.')
    // Schema changes are applied explicitly through reviewed migrations.
    await sequelize.getQueryInterface().describeTable('PaymentEvents')
    await sequelize.getQueryInterface().describeTable('NotificationDeliveries')
    await sequelize.getQueryInterface().describeTable('TransactionPanels')

    // Start Express Webhook & Admin Server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✅ Webhook & Admin Server running on port ${PORT} (LAN accessible)`)
    })

    // Start Timer Service
    TimerService.start()
    PaymentNotifications.start()
    TransactionPanels.start()

    await startTelegram()
    await startDiscord()
  } catch (error) {
    console.error('❌ Error:', error)
    process.exitCode = 1
  }
}

start()
