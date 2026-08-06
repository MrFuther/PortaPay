const axios = require('axios')
const crypto = require('./crypto')
require('dotenv').config()

const TRIPAY_API_KEY = process.env.TRIPAY_API_KEY
const TRIPAY_PRIVATE_KEY = process.env.TRIPAY_PRIVATE_KEY
const TRIPAY_MERCHANT_CODE = process.env.TRIPAY_MERCHANT_CODE
const TRIPAY_URL = process.env.TRIPAY_URL || 'https://tripay.co.id/api-sandbox/transaction/create'

const TripayService = {
  async createTransaction(transaction, buyer) {
    // Determine payment amount based on fee_type
    const amount = Number(transaction.amount)
    const fee = Number(transaction.fee)
    const totalAmount = transaction.fee_type === 'EXCLUDE' ? amount + fee : amount

    const merchantRef = transaction.id

    // MOCK PAYMENT INTERCEPTOR
    if (process.env.MOCK_PAYMENT === 'true') {
      const baseUrl = process.env.BASE_URL || 'http://localhost:3000'
      return {
        success: true,
        payment_url: `${baseUrl}/mock-pay/${merchantRef}`,
        payment_ref: `MOCK-${merchantRef}`
      }
    }
    
    // Generate signature: merchantCode + merchantRef + amount
    const signature = crypto.generateSignature(TRIPAY_MERCHANT_CODE + merchantRef + totalAmount, TRIPAY_PRIVATE_KEY)

    const payload = {
      method: 'QRIS',
      merchant_ref: merchantRef,
      amount: totalAmount,
      customer_name: buyer.username || 'Buyer',
      customer_email: 'buyer@example.com',
      customer_phone: '081234567890',
      order_items: [
        {
          sku: 'REKBER',
          name: transaction.description,
          price: totalAmount,
          quantity: 1
        }
      ],
      return_url: 'https://example.com/return',
      expired_time: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
      signature
    }

    try {
      const response = await axios.post(TRIPAY_URL, payload, {
        headers: {
          'Authorization': `Bearer ${TRIPAY_API_KEY}`
        }
      })

      if (response.data.success) {
        return {
          success: true,
          payment_url: response.data.data.checkout_url,
          payment_ref: response.data.data.reference
        }
      } else {
        return { success: false, message: response.data.message }
      }
    } catch (error) {
      console.error('Tripay Create Transaction Error:', error.response ? error.response.data : error.message)
      return { success: false, message: 'Gagal menghubungi payment gateway.' }
    }
  }
}

module.exports = TripayService
