// Real PostgreSQL tests in a unique disposable schema. Never use public tables.
require('dotenv').config({ quiet: true })
const { randomBytes } = require('crypto')
const assert = require('node:assert/strict')
const schema = `escrow_test_${Date.now()}_${randomBytes(4).toString('hex')}`
process.env.DB_SCHEMA = schema
process.env.ADMIN_PASSWORD = randomBytes(24).toString('hex')
process.env.N8N_WEBHOOK_SECRET = randomBytes(32).toString('hex')
process.env.PAYMENT_ALLOWED_ACCOUNTS = 'BLU_MAIN'
const sequelize = require('../db')
const User = require('../db/models/user')
const Transaction = require('../db/models/transaction')
const Withdrawal = require('../db/models/withdrawal')
const PaymentEvent = require('../db/models/payment-event')
const BalanceEntry = require('../db/models/balance-entry')
const Delivery = require('../db/models/notification-delivery')
const PaymentNotifications = require('../services/payment-notifications')
const TransactionPanels = require('../services/transaction-panels')
const Escrow = require('../services/escrow')
const Finance = require('../services/finance')
const Withdrawals = require('../services/withdrawal')
const express = require('express')
let server
let passed = 0
async function check(name, fn) { await fn(); passed++; console.log(`PASS ${name}`) }
async function main() {
  await sequelize.createSchema(schema)
  try {
    // Apply historical migrations and the new migration, then verify model compatibility.
    const q = sequelize.getQueryInterface()
    // Historical migrations use unqualified tables; set search_path per connection.
    await sequelize.query(`SET search_path TO "${schema}"`)
    // For a faithful additive migration test, create legacy model tables without new fields.
    const fields = ['payment_issued_at','payment_expires_at','paid_at','funded_amount','settled_at','dispute_reason','disputed_from','delivery_note']
    const attrs = { ...Transaction.rawAttributes }
    for (const key of fields) delete Transaction.rawAttributes[key]
    const indexes = Transaction.options.indexes; Transaction.options.indexes = []; Transaction._indexes = []
    Transaction.refreshAttributes()
    await User.sync(); await Transaction.sync(); await Withdrawal.sync()
    Object.assign(Transaction.rawAttributes, attrs); Transaction.refreshAttributes(); Transaction.options.indexes = indexes; Transaction._indexes = indexes
    await require('../db/migrations/20261015000000-harden-escrow').up(q, require('sequelize'))
    await require('../db/migrations/20261015010000-payment-notifications').up(q, require('sequelize'))
    await require('../db/migrations/20261015020000-transaction-panels').up(q, require('sequelize'))
    const seller = await User.create({ discord_id: 'seller', available_balance: 100000 })
    const buyer = await User.create({ discord_id: 'buyer' })
    const buyer2 = await User.create({ discord_id: 'buyer2' })
    const args = { user_platform_id: 'seller', platform: 'DISCORD', amount: 80000, bank_name: 'DANA', account_number: 'test', account_name: 'test' }
    await check('parallel withdrawals cannot exceed balance', async () => {
      const results = await Promise.all([Withdrawals.requestWithdrawal(args), Withdrawals.requestWithdrawal(args)])
      assert.equal(results.filter(r => r.success).length, 1)
      assert.equal(Number((await seller.reload()).available_balance), 20000)
      assert.equal(await Withdrawal.count(), 1)
    })
    await check('withdrawal failure rolls back debit and insert', async () => {
      Withdrawal.addHook('afterCreate', 'test-fail', () => { throw new Error('injected insert failure') })
      try { assert.equal((await Withdrawals.requestWithdrawal({ ...args, amount: 10000 })).success, false) }
      finally { Withdrawal.removeHook('afterCreate', 'test-fail') }
      assert.equal(Number((await seller.reload()).available_balance), 20000)
      assert.equal(await Withdrawal.count(), 1)
    })
    let trx
    await check('parallel buyers cannot both join', async () => {
      const created = await Escrow.createSession({ seller_platform_id: 'seller', platform: 'DISCORD', amount: 10000, description: 'test' })
      assert.ok(created.success); trx = created.transaction
      const results = await Promise.all(['buyer', 'buyer2'].map(id => Escrow.joinSession({ transaction_id: trx.id, buyer_platform_id: id, platform: 'DISCORD' })))
      assert.equal(results.filter(r => r.success).length, 1)
      await trx.reload()
    })
    const payment = () => ({ provider: 'N8N', event_id: 'bank-ref-1', transaction_id: trx.id, amount: trx.amount_with_code, occurred_at: new Date().toISOString() })
    await check('wrong amount rejected without status or balance changes', async () => {
      await assert.rejects(Escrow.acceptPayment({ ...payment(), amount: 1 }))
      assert.equal((await trx.reload()).status, 'WAITING_PAYMENT')
    })
    await check('payment retries record one event and never credit buyer', async () => {
      const result = await Promise.all([Escrow.acceptPayment(payment()), Escrow.acceptPayment(payment())])
      assert.equal(result.filter(r => r.duplicate).length, 1)
      assert.equal(await PaymentEvent.count(), 1)
      assert.equal(await Delivery.count({ where: { transaction_id: trx.id } }), 2)
      assert.equal(Number((await User.findByPk(trx.buyer_id)).available_balance), 0)
    })
    await check('callback cannot revive FROZEN or overwrite completed states', async () => {
      await trx.update({ status: 'FROZEN' })
      await assert.rejects(Escrow.acceptPayment({ ...payment(), event_id: 'other-bank-ref' }))
      assert.equal((await trx.reload()).status, 'FROZEN')
      assert.equal((await Escrow.acceptPayment(payment())).duplicate, true)
      assert.equal((await trx.reload()).status, 'FROZEN')
    })
    await check('stale timer cannot release a frozen transaction', async () => {
      assert.equal(await Finance.settle(trx.id, 'RELEASE_SELLER', { timer: true }), null)
    })
    await check('settlement failure rolls back status, journal and balance', async () => {
      BalanceEntry.addHook('afterCreate', 'test-fail', () => { throw new Error('injected ledger failure') })
      try { await assert.rejects(Finance.settle(trx.id, 'RELEASE_SELLER')) }
      finally { BalanceEntry.removeHook('afterCreate', 'test-fail') }
      assert.equal((await trx.reload()).status, 'FROZEN')
      assert.equal(Number((await seller.reload()).available_balance), 20000)
      assert.equal(await BalanceEntry.count({ where: { event_key: `settlement:${trx.id}` } }), 0)
    })
    await check('parallel settlement credits exactly once', async () => {
      const results = await Promise.allSettled([Finance.settle(trx.id, 'RELEASE_SELLER'), Finance.settle(trx.id, 'RELEASE_SELLER')])
      assert.equal(results.filter(r => r.status === 'fulfilled').length, 1)
      assert.equal(Number((await seller.reload()).available_balance), 30000)
      assert.equal((await trx.reload()).status, 'COMPLETED')
    })
    await check('unfunded dispute cannot mint refund or release', async () => {
      const unpaid = await Transaction.create({ seller_id: seller.id, buyer_id: buyer.id, amount: 10000, fee: 100, description: 'unpaid', platform: 'DISCORD', status: 'FROZEN', disputed_from: 'WAITING_PAYMENT' })
      await assert.rejects(Finance.settle(unpaid.id, 'REFUND_BUYER'))
      await assert.rejects(Finance.settle(unpaid.id, 'RELEASE_SELLER'))
      await Finance.settle(unpaid.id, 'CANCEL_UNFUNDED')
      assert.equal((await unpaid.reload()).status, 'CANCELLED')
    })
    await check('holding sessions block creation', async () => {
      await trx.update({ status: 'COMPLETED_HOLDING' })
      const result = await Escrow.createSession({ seller_platform_id: 'seller', platform: 'DISCORD', amount: 10000, description: 'another' })
      assert.equal(result.success, false)
      await trx.update({ status: 'COMPLETED' })
    })
    const app = express()
    app.use(express.json({ verify: (req, res, buf) => { req.rawBody = buf } }))
    app.use('/tripay', require('../webhook/handler'))
    app.use('/api/admin', require('../routes/admin'))
    server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)) })
    const base = `http://127.0.0.1:${server.address().port}`
    await check('unsigned and FAILED callbacks rejected by HTTP API', async () => {
      const r = await fetch(`${base}/tripay/n8n/callback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ transaction_id: trx.id }) })
      assert.equal(r.status, 403)
      const failed = await fetch(`${base}/tripay/n8n/callback`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET }, body: JSON.stringify({ status: 'FAILED', direction: 'CREDIT', currency: 'IDR', account: 'BLU_MAIN' }) })
      assert.equal(failed.status, 400)
    })
    await check('admin cookie session and logout revoke access', async () => {
      const login = await fetch(`${base}/api/admin/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: process.env.ADMIN_PASSWORD }) })
      assert.equal(login.status, 200)
      const body = await login.json(); assert.equal(body.token, undefined)
      const cookie = login.headers.get('set-cookie'); assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/)
      const headers = { Cookie: cookie.split(';')[0] }
      assert.equal((await fetch(`${base}/api/admin/session`, { headers })).status, 200)
      await fetch(`${base}/api/admin/logout`, { method: 'POST', headers })
      assert.equal((await fetch(`${base}/api/admin/session`, { headers })).status, 401)
    })
    await check('authenticated callback accepts exact amount and rejects expired evidence', async () => {
      const fresh = await Transaction.create({ seller_id: seller.id, buyer_id: buyer.id, platform: 'DISCORD', description: 'HTTP payment', amount: 20000, fee: 200, amount_with_code: 20555, status: 'WAITING_PAYMENT', payment_issued_at: new Date(Date.now() - 60000), payment_expires_at: new Date(Date.now() + 60000) })
      const payload = { status: 'PAID', direction: 'CREDIT', currency: 'IDR', account: 'BLU_MAIN', event_id: 'http-bank-ref', nominal_mutasi: '20555.00', occurred_at: new Date().toISOString() }
      const request = data => fetch(`${base}/tripay/n8n/callback`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-webhook-secret': process.env.N8N_WEBHOOK_SECRET }, body: JSON.stringify(data) })
      assert.equal((await request({ ...payload, occurred_at: new Date(Date.now() - 120000).toISOString() })).status, 422)
      assert.equal((await fresh.reload()).status, 'WAITING_PAYMENT')
      const accepted = await request(payload)
      assert.equal(accepted.status, 200)
      assert.equal((await accepted.json()).transaction_id, fresh.id)
      assert.equal((await fresh.reload()).status, 'PAID')
      assert.equal((await (await request(payload)).json()).duplicate, true)
      assert.equal(Number((await User.findByPk(buyer.id)).available_balance), 0)
      await fresh.update({ status: 'FROZEN' })
      await Finance.settle(fresh.id, 'REFUND_BUYER')
      assert.equal(Number((await User.findByPk(buyer.id)).available_balance), 20555)
    })
    await check('INCLUDE settlement deducts fee once and timer retry is a no-op', async () => {
      const held = await Transaction.create({ seller_id: seller.id, buyer_id: buyer2.id, platform: 'DISCORD', description: 'include fee', amount: 10000, fee: 100, fee_type: 'INCLUDE', amount_with_code: 10777, funded_amount: 10777, status: 'COMPLETED_HOLDING', hold_expired_at: new Date(Date.now() - 60000) })
      await PaymentEvent.create({ provider: 'N8N', event_id: 'include-ref', transaction_id: held.id, amount: 10777, occurred_at: new Date() })
      const before = Number((await seller.reload()).available_balance)
      await Finance.settle(held.id, 'RELEASE_SELLER', { timer: true })
      assert.equal(Number((await seller.reload()).available_balance), before + 9900)
      assert.equal(await Finance.settle(held.id, 'RELEASE_SELLER', { timer: true }), null)
    })
    await check('notification insert failure rolls back payment event and PAID', async () => {
      const pending = await Transaction.create({ seller_id: seller.id, buyer_id: buyer.id, platform: 'DISCORD', description: 'atomic notification', amount: 30000, fee: 300, amount_with_code: 30555, status: 'WAITING_PAYMENT', payment_issued_at: new Date(Date.now() - 60000), payment_expires_at: new Date(Date.now() + 60000) })
      Delivery.addHook('beforeBulkCreate', 'queue-failure', () => { throw new Error('injected outbox failure') })
      try { await assert.rejects(Escrow.acceptPayment({ provider: 'N8N', event_id: 'queue-fail-ref', amount: 30555, occurred_at: new Date().toISOString(), transaction_id: pending.id })) }
      finally { Delivery.removeHook('beforeBulkCreate', 'queue-failure') }
      assert.equal((await pending.reload()).status, 'WAITING_PAYMENT')
      assert.equal(Number(pending.funded_amount), 0)
      assert.equal(await PaymentEvent.count({ where: { transaction_id: pending.id } }), 0)
      assert.equal(await Delivery.count({ where: { transaction_id: pending.id } }), 0)
    })
    const notifications = require('../services/notification')
    const originalSend = notifications.sendDirectMessage
    const originalClient = notifications.discordClient
    const originalTelegram = notifications.telegramBot
    const counts = { seller: 0, buyer: 0 }
    try {
      notifications.discordClient = null; notifications.telegramBot = null
      await check('offline bot leaves durable messages queued without consuming attempts', async () => {
        assert.equal(await PaymentNotifications.claim({ transactionId: trx.id }), null)
        const rows = await Delivery.findAll({ where: { transaction_id: trx.id } })
        assert.ok(rows.every(row => row.status === 'PENDING' && row.attempts === 0))
      })
      notifications.discordClient = { isReady: () => true }
      await check('parallel workers claim once and expired crash leases recover', async () => {
        const row = await Delivery.findOne({ where: { transaction_id: trx.id, role: 'seller' } })
        const claims = await Promise.all([PaymentNotifications.claim({ deliveryId: row.id }), PaymentNotifications.claim({ deliveryId: row.id })])
        assert.equal(claims.filter(Boolean).length, 1)
        const firstToken = claims.find(Boolean).lease_token
        await row.update({ lease_until: new Date(Date.now() - 1000) })
        const recovered = await PaymentNotifications.claim({ deliveryId: row.id })
        assert.ok(recovered); assert.notEqual(recovered.lease_token, firstToken)
        await row.update({ status: 'PENDING', lease_until: null, lease_token: null })
      })
      notifications.sendDirectMessage = async payload => {
        const row = await Delivery.findByPk(payload.deliveryKey)
        counts[row.role]++
        // One recipient fails while the other succeeds.
        return row.role === 'seller' || counts.buyer > 1
      }
      await check('recipient failures are retried independently with backoff', async () => {
        await PaymentNotifications.drain({ transactionId: trx.id })
        const sellerDelivery = await Delivery.findOne({ where: { transaction_id: trx.id, role: 'seller' } })
        const buyerDelivery = await Delivery.findOne({ where: { transaction_id: trx.id, role: 'buyer' } })
        assert.equal(sellerDelivery.status, 'SENT'); assert.equal(sellerDelivery.attempts, 1)
        assert.equal(buyerDelivery.status, 'PENDING'); assert.equal(buyerDelivery.attempts, 1)
        assert.ok(buyerDelivery.next_attempt_at > new Date()); assert.ok(buyerDelivery.last_error)
        await PaymentNotifications.drain({ transactionId: trx.id })
        assert.deepEqual(counts, { seller: 1, buyer: 1 })
        await buyerDelivery.update({ next_attempt_at: new Date(Date.now() - 1000) })
        await PaymentNotifications.drain({ transactionId: trx.id })
        assert.equal((await buyerDelivery.reload()).status, 'SENT')
        assert.deepEqual(counts, { seller: 1, buyer: 2 })
      })
      await check('callback/reconciliation retry does not resend delivered messages', async () => {
        await Promise.all([sequelize.transaction(t => PaymentNotifications.enqueue(trx, t)), sequelize.transaction(t => PaymentNotifications.enqueue(trx, t))])
        await PaymentNotifications.drain({ transactionId: trx.id })
        assert.equal(await Delivery.count({ where: { transaction_id: trx.id } }), 2)
        assert.deepEqual(counts, { seller: 1, buyer: 2 })
      })
      await check('delayed payment messages reflect frozen state without shipping instructions', async () => {
        const payload = PaymentNotifications.message({ ...trx.toJSON(), status: 'FROZEN' }, 'seller')
        assert.match(payload.content, /dibekukan/)
        assert.doesNotMatch(payload.content, /Silakan kirim barang/)
      })
    } finally {
      notifications.sendDirectMessage = originalSend
      notifications.discordClient = originalClient; notifications.telegramBot = originalTelegram
      PaymentNotifications.stop()
    }
    await check('digital delivery needs no resi; only buyer can confirm the exact transaction', async () => {
      const digitalSeller = await User.create({ discord_id: 'digital-seller' })
      const digitalBuyer = await User.create({ discord_id: 'digital-buyer' })
      const digital = await Transaction.create({ seller_id: digitalSeller.id, buyer_id: digitalBuyer.id, platform: 'DISCORD', type: 'DIGITAL', description: 'digital test', amount: 10000, fee: 100, status: 'PAID' })
      const delivered = await Escrow.markAsDelivered({ seller_platform_id: 'digital-seller', platform: 'DISCORD', transaction_id: digital.id, delivery_note: 'File sudah diserahkan' })
      assert.ok(delivered.success); assert.equal(delivered.transaction.resi_number, null)
      assert.equal(delivered.transaction.delivery_note, 'File sudah diserahkan')
      assert.equal((await Escrow.confirmReceived('digital-seller', 'DISCORD', digital.id)).success, false)
      assert.equal((await Escrow.confirmReceived('seller', 'DISCORD', digital.id)).success, false)
      assert.equal((await digital.reload()).status, 'DELIVERED')
      assert.equal((await Escrow.confirmReceived('digital-buyer', 'DISCORD', digital.id)).success, true)
      assert.equal((await digital.reload()).status, 'COMPLETED_HOLDING')
      assert.ok(digital.hold_expired_at > new Date(Date.now() + 179 * 60000))
    })
    await check('physical delivery rejects missing tracking and accepts carrier plus resi', async () => {
      const physical = await Transaction.create({ seller_id: seller.id, buyer_id: buyer.id, platform: 'DISCORD', type: 'PHYSICAL', description: 'physical test', amount: 10000, fee: 100, status: 'PAID' })
      await assert.rejects(Escrow.markAsDelivered({ seller_platform_id: 'seller', platform: 'DISCORD', transaction_id: physical.id }), /resi/)
      assert.equal((await physical.reload()).status, 'PAID')
      assert.ok((await Escrow.markAsDelivered({ seller_platform_id: 'seller', platform: 'DISCORD', transaction_id: physical.id, resi_number: 'TEST123', resi_expedition: 'TEST' })).success)
      const actions = require('../adapters/discord/transaction-actions')
      let reply
      await actions.handle({ customId: `escrow:confirm:${physical.id}`, user: { id: 'seller' }, reply: async value => { reply = value } })
      assert.match(reply.content, /Hanya pembeli/)
      assert.equal((await physical.reload()).status, 'DELIVERED')
      await actions.handle({ customId: `escrow:send:${physical.id}`, user: { id: 'digital-seller' }, reply: async value => { reply = value } })
      assert.match(reply.content, /bukan peserta/)
    })
    const notificationService = require('../services/notification')
    const previousClient = notificationService.discordClient
    const edits = [], sends = []
    const messages = new Map()
    notificationService.discordClient = {
      user: { id: 'bot-test' }, isReady: () => true,
      users: { fetch: async platformId => ({ createDM: async () => {
        if (!messages.has(platformId)) messages.set(platformId, { id: `legacy-${platformId}`, author: { id: 'bot-test' }, embeds: [{ description: `Payment ${trx.id}`, fields: [] }], async edit(payload) { edits.push({ platformId, payload }); return this } })
        return { id: `dm-${platformId}`, messages: { fetch: async query => typeof query === 'string' ? messages.get(platformId) : { find: fn => [messages.get(platformId)].find(fn) } }, send: async payload => { sends.push(payload); return { id: `new-${platformId}` } } }
      } }) }
    }
    try {
      await check('live panels adopt existing payment DMs and do not repeatedly edit unchanged cards', async () => {
        assert.equal(await TransactionPanels.deliverPayment(trx.id, 'seller'), true)
        assert.equal(await TransactionPanels.deliverPayment(trx.id, 'buyer'), true)
        assert.equal(edits.length, 2); assert.equal(sends.length, 0)
        assert.equal(await TransactionPanels.deliverPayment(trx.id, 'seller'), true)
        assert.equal(edits.length, 2)
      })
      await check('status changes update the same cards with buyer-only receipt buttons', async () => {
        await trx.update({ status: 'DELIVERED' })
        assert.equal(await TransactionPanels.deliverPayment(trx.id, 'seller'), true)
        assert.equal(await TransactionPanels.deliverPayment(trx.id, 'buyer'), true)
        assert.equal(edits.length, 4); assert.equal(sends.length, 0)
        const sellerControls = edits[2].payload.components[0].components
        const buyerControls = edits[3].payload.components[0].components
        assert.ok(!sellerControls.some(button => button.custom_id.includes(':received:')))
        assert.ok(buyerControls.some(button => button.custom_id.includes(':received:')))
        const buyerUser = await User.findByPk(trx.buyer_id)
        let prompt
        await require('../adapters/discord/transaction-actions').handle({ customId: `escrow:received:${trx.id}`, user: { id: buyerUser.discord_id }, reply: async value => { prompt = value } })
        assert.match(prompt.content, /hold 3 jam/)
        assert.equal((await trx.reload()).status, 'DELIVERED')
      })
    } finally { notificationService.discordClient = previousClient }
    console.log(`${passed} integration scenarios passed; live tables untouched.`)
  } finally {
    if (server) await new Promise(resolve => server.close(resolve))
    PaymentNotifications.stop(); TransactionPanels.stop()
    if (!/^escrow_test_\d+_[a-f0-9]{8}$/.test(schema)) throw new Error('Unsafe cleanup schema')
    await sequelize.dropSchema(schema, { cascade: true })
    await sequelize.close()
  }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
