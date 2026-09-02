require('dotenv').config()
const sequelize = require('./db/index')
require('./db/models/user')
require('./db/models/transaction')
const startTelegram = require('./adapters/telegram/index')
const startDiscord = require('./adapters/discord/index')
const express = require('express')
const webhookHandler = require('./webhook/handler')
const mockHandler = require('./webhook/mock')
const adminRoutes = require('./routes/admin')
const TimerService = require('./services/timer')
const path = require('path')

const app = express()
const PORT = process.env.PORT || 3000

// Middleware JSON & CORS header untuk dashboard React
app.use(express.json())
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*')
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
if (process.env.MOCK_PAYMENT === 'true') {
  app.use('/mock-pay', mockHandler)
}

async function start() {
  try {
    await sequelize.authenticate()
    console.log('✅ Database terhubung')
    
    // Auto-sync for development to add missing columns safely
    await sequelize.sync({ alter: true })
    console.log('✅ Database schema disinkronisasi')

    // Start Express Webhook Server
    app.listen(PORT, () => {
      console.log(`✅ Webhook Server running on port ${PORT}`)
    })

    // Start Timer Service
    TimerService.start()

    await startTelegram()
    await startDiscord()
  } catch (error) {
    console.error('❌ Error:', error)
  }
}

start()