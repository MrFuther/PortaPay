const express = require('express')
const { createHmac, timingSafeEqual } = require('crypto')
const Escrow = require('../services/escrow')
const router = express.Router()
function same(a, b) {
  return typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b))
}
async function processPayment(data, res) {
  try {
    const result = await Escrow.acceptPayment(data)
    require('../services/payment-notifications').kick()
    return res.json({ success: true, transaction_id: result.transaction.id, status: result.transaction.status, duplicate: result.duplicate })
  } catch (error) {
    console.error('Payment rejected:', error.message)
    return res.status(422).json({ success: false, message: 'Pembayaran tidak cocok atau perlu rekonsiliasi.' })
  }
}
router.post('/n8n/callback', express.json(), async (req, res) => {
  const secret = process.env.N8N_WEBHOOK_SECRET
  if (!secret || secret.length < 32 || /^(replace_with|your_)/i.test(secret)) return res.status(503).json({ success: false, message: 'Callback belum dikonfigurasi.' })
  // A dedicated n8n Header Auth credential; HTTPS is required outside localhost.
  if (!same(req.headers['x-webhook-secret'], secret)) return res.status(403).json({ success: false })
  const { event_id, nominal_mutasi, occurred_at, transaction_id, payment_ref, status, direction, currency, account } = req.body || {}
  const allowed = (process.env.PAYMENT_ALLOWED_ACCOUNTS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (status !== 'PAID' || direction !== 'CREDIT' || currency !== 'IDR' || !allowed.includes(account)) return res.status(400).json({ success: false, message: 'Status/arah/rekening mutasi tidak valid.' })
  return processPayment({ provider: 'N8N', event_id, amount: nominal_mutasi, occurred_at, transaction_id, payment_ref }, res)
})
router.post('/callback', express.json(), async (req, res) => {
  const key = process.env.TRIPAY_PRIVATE_KEY
  if (!key || !req.rawBody) return res.status(503).json({ success: false })
  const expected = createHmac('sha256', key).update(req.rawBody).digest('hex')
  if (!same(req.headers['x-callback-signature'], expected)) return res.status(403).json({ success: false })
  const { status, reference, merchant_ref, amount, paid_at } = req.body || {}
  if (status !== 'PAID') return res.json({ success: true, ignored: true })
  return processPayment({ provider: 'TRIPAY', event_id: reference, transaction_id: merchant_ref, amount, occurred_at: typeof paid_at === 'number' ? new Date(paid_at * 1000).toISOString() : paid_at }, res)
})
module.exports = router
