const { test } = require('node:test')
const assert = require('node:assert/strict')
const { build } = require('../services/transaction-panels')
const trx = { id: '00000000-0000-4000-8000-000000000001', description: 'test', amount: '10000', type: 'DIGITAL', status: 'PAID' }
const buttons = payload => payload.components.flatMap(row => row.components)
test('seller and buyer get different actions; digital delivery has no tracking', () => {
  const seller = build(trx, 'seller'), buyer = build(trx, 'buyer')
  assert.ok(buttons(seller).some(b => b.custom_id.includes(':send:') && /digital/.test(b.label)))
  assert.ok(!buttons(seller).some(b => b.custom_id.includes(':received:')))
  assert.ok(!buttons(buyer).some(b => b.custom_id.includes(':send:')))
  assert.ok(buttons(build({ ...trx, status: 'DELIVERED' }, 'buyer')).some(b => b.custom_id.includes(':received:')))
  assert.ok(buttons(build({ ...trx, type: 'PHYSICAL' }, 'seller')).some(b => /pengiriman/.test(b.label)))
})
test('hold, frozen and finished cards remove unsafe delivery/receipt actions', () => {
  for (const status of ['COMPLETED_HOLDING', 'FROZEN', 'COMPLETED', 'CANCELLED']) {
    for (const role of ['seller', 'buyer']) assert.ok(!buttons(build({ ...trx, status }, role)).some(b => /:(send|received):/.test(b.custom_id)))
  }
  assert.ok(buttons(build({ ...trx, status: 'COMPLETED_HOLDING' }, 'buyer')).some(b => b.custom_id.includes(':dispute:')))
})
