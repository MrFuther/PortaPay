const express = require('express')
const router = express.Router()
const crypto = require('../services/payment/crypto')
const EscrowService = require('../services/escrow')
const NotificationService = require('../services/notification')
require('dotenv').config()

const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY

router.post('/callback', express.json(), async (req, res) => {
  try {
    const signature = req.headers['x-callback-signature']
    if (!signature) {
      return res.status(400).json({ success: false, message: 'No signature provided' })
    }

    const jsonBody = JSON.stringify(req.body)
    const isValid = crypto.verifyCallbackSignature(jsonBody, signature, TRIPAY_PRIVATE_KEY)

    if (!isValid) {
      return res.status(403).json({ success: false, message: 'Invalid signature' })
    }

    const { reference, merchant_ref, status } = req.body

    // Handle payment status
    if (status === 'PAID') {
      const transaction = await EscrowService.markAsPaid(merchant_ref)
      if (transaction) {
        console.log(`✅ Transaction ${merchant_ref} paid successfully!`)
        await NotificationService.notifyPaid(transaction)
      }
    }

    return res.json({ success: true })
  } catch (error) {
    console.error('Webhook Error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

// Endpoint Callback dari n8n Workflow (Mutasi Email DANA / SeaBank)
router.post('/n8n/callback', express.json(), async (req, res) => {
  try {
    const { nominal_mutasi, transaction_id, payment_ref, status } = req.body

    const identifier = transaction_id || payment_ref || nominal_mutasi
    if (!identifier) {
      return res.status(400).json({ success: false, message: 'Nominal mutasi / Transaction ID required' })
    }

    const transaction = await EscrowService.markAsPaid(identifier)
    if (transaction) {
      console.log(`✅ [n8n Webhook] Transaction ${transaction.id} (Rp ${transaction.amount_with_code}) paid successfully!`)
      await NotificationService.notifyPaid(transaction)
      return res.json({ success: true, transaction_id: transaction.id, status: transaction.status })
    } else {
      return res.status(404).json({ success: false, message: 'Transaksi tidak ditemukan atau status sudah berubah' })
    }
  } catch (error) {
    console.error('n8n Webhook Error:', error)
    return res.status(500).json({ success: false, message: 'Internal server error' })
  }
})

module.exports = router
