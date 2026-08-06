require('dotenv').config()
const sequelize = require('./db/index')
require('./db/models/user')
require('./db/models/transaction')
const startTelegram = require('./adapters/telegram/index')
const startDiscord = require('./adapters/discord/index')
const express = require('express')
const webhookHandler = require('./webhook/handler')
const mockHandler = require('./webhook/mock')
const TimerService = require('./services/timer')

const app = express()
const PORT = process.env.PORT || 3000

// Mount Webhook
app.use('/tripay', webhookHandler)

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