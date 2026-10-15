// Narrow repair for the user-reported receipt. Never transfers or credits money.
// Default is read-only; --apply records verified funding metadata only.
require('dotenv').config({ quiet: true })
const { DatabaseSync } = require('node:sqlite')
const path = require('node:path')
const { Op } = require('sequelize')
const sequelize = require('../db')
const Transaction = require('../db/models/transaction')
const User = require('../db/models/user')
const Withdrawal = require('../db/models/withdrawal')
const PaymentEvent = require('../db/models/payment-event')
const { parseBankEmail } = require('../n8n/parse-bank-email.cjs')
const { cents } = require('../services/money')
const id = '9dc634f7-e9b3-4633-a31b-700192ca51fe'
function decode(text) {
  const values = JSON.parse(text), cache = new Map()
  function at(index) {
    if (cache.has(index)) return cache.get(index)
    const value = values[index]
    if (!value || typeof value !== 'object') return value
    const result = Array.isArray(value) ? [] : {}; cache.set(index, result)
    for (const [key, child] of Object.entries(value)) result[key] = typeof child === 'string' ? at(Number(child)) : child
    return result
  }
  return at(0)
}
;(async () => {
  try {
    const db = new DatabaseSync(path.join(process.env.USERPROFILE, '.n8n', 'database.sqlite'), { readOnly: true })
    let candidates
    try {
      const execution = db.prepare('SELECT d.data FROM execution_data d JOIN execution_entity e ON e.id=d.executionId WHERE e.id=43 AND e.workflowId=?').get('K9ZIMlTQDCwVGVoy')
      if (!execution) throw new Error('Expected bank evidence execution missing.')
      const data = decode(execution.data)
      candidates = data.resultData.runData['Email Trigger (IMAP)'][0].data.main.flat().map(item => parseBankEmail(item.json)).filter(Boolean)
    } finally { db.close() }
    await sequelize.transaction(async transaction => {
      await sequelize.query('SELECT pg_advisory_xact_lock(740017)', { transaction })
      const trx = await Transaction.findByPk(id, { transaction, lock: transaction.LOCK.UPDATE })
      if (!trx) throw new Error('Legacy transaction not found.')
      const proofs = candidates.filter(proof => cents(proof.nominal_mutasi) === cents(trx.amount_with_code))
      if (proofs.length !== 1) throw new Error('Bank evidence is absent or ambiguous.')
      const proof = proofs[0], occurred = new Date(proof.occurred_at)
      const expires = new Date(new Date(trx.createdAt).getTime() + 2 * 60 * 60 * 1000)
      if (occurred < trx.createdAt || occurred > expires) throw new Error('Receipt outside the legacy two-hour payment window.')
      const sameAmount = await Transaction.count({ where: { amount_with_code: trx.amount_with_code }, transaction })
      if (sameAmount !== 1) throw new Error('Historical amount reused; manual review required.')
      const existing = await PaymentEvent.findOne({ where: { transaction_id: id }, transaction })
      if (existing) {
        if (existing.provider !== 'N8N' || existing.event_id !== proof.event_id || cents(existing.amount) !== cents(proof.nominal_mutasi) || cents(existing.amount) !== cents(trx.funded_amount)) throw new Error('Conflicting recorded funding evidence.')
        if (process.argv.includes('--apply')) {
          await require('../services/payment-notifications').enqueue(trx, transaction)
          console.log('Funding already reconciled; missing payment notifications scheduled without duplicating delivered messages.')
        } else console.log('Funding already reconciled. No changes.')
        return
      }
      if (trx.status !== 'PAID' || trx.settled_at) throw new Error('Expected unsettled PAID legacy transaction before recording new funding.')
      const users = await User.findAll({ where: { id: { [Op.in]: [trx.seller_id, trx.buyer_id] } }, order: [['id', 'ASC']], transaction, lock: transaction.LOCK.UPDATE })
      if (users.length !== 2 || users.some(user => cents(user.available_balance) !== 0 || user.total_deals !== 0)) throw new Error('Historical balance/deal activity requires manual reconciliation.')
      if (await Withdrawal.count({ where: { user_id: { [Op.in]: users.map(user => user.id) } }, transaction })) throw new Error('Historical withdrawals require manual reconciliation.')
      if (!process.argv.includes('--apply')) { console.log('DRY RUN: one authenticated Blu receipt matches 10342.00; participants have zero balance/deals/withdrawals. Safe to record funding only.'); return }
      await PaymentEvent.create({ provider: 'N8N', event_id: proof.event_id, transaction_id: id, amount: proof.nominal_mutasi, occurred_at: occurred }, { transaction })
      await trx.update({ funded_amount: proof.nominal_mutasi, paid_at: occurred, payment_issued_at: trx.createdAt, payment_expires_at: expires }, { transaction })
      await require('../services/payment-notifications').enqueue(trx, transaction)
      console.log('Reconciled verified Blu receipt 10342.00. Status remains PAID; no balance, payout or transfer changed.')
    })
  } finally { await sequelize.close() }
})().catch(error => { console.error(error.message); process.exitCode = 1 })
