const { test } = require('node:test')
const assert = require('node:assert/strict')
const { parseBankEmail } = require('../n8n/parse-bank-email.cjs')
function blu(html = '<p>Rp 10.342</p>') {
  return { from: { value: [{ address: 'receipts@blubybcadigital.id' }] }, subject: 'Info Transaksi Masuk ke blu Kamu', html, messageId: '<bank-event@example>', date: '2026-10-15T09:09:20Z', headers: { 'authentication-results': 'Authentication-Results: mx.google.com; dmarc=pass header.from=blubybcadigital.id' } }
}
test('Blu HTML-only money supports thousands and decimal comma', () => {
  assert.equal(parseBankEmail(blu()).nominal_mutasi, '10342.00')
  assert.equal(parseBankEmail(blu('<p>Rp&nbsp;10.342,00</p>')).nominal_mutasi, '10342.00')
})
test('outgoing SeaBank receipts cannot become escrow deposits', () => {
  const email = blu(); email.from.value[0].address = 'alerts@seabank.co.id'
  email.subject = 'Notifikasi Transfer SeaBank'; email.text = 'Permintaan transfer kamu telah berhasil diproses.'
  assert.equal(parseBankEmail(email), null)
})
test('reject spoofed, missing or ambiguous bank payment evidence', () => {
  const email = blu(); email.headers = {}
  assert.throws(() => parseBankEmail(email))
  assert.throws(() => parseBankEmail(blu('<p>Tidak ada nominal</p>')))
  assert.throws(() => parseBankEmail(blu('<p>Rp 10.342 dan Rp 20.000</p>')))
  assert.throws(() => parseBankEmail({ ...blu(), messageId: undefined }))
})
test('generated workflow has valid email search and executable parser', () => {
  const workflow = require('../n8n/Payment Method.secure.json')
  const trigger = workflow.nodes.find(n => n.type === 'n8n-nodes-base.emailReadImap')
  assert.equal(JSON.parse(trigger.parameters.options.customEmailConfig)[0], 'UNSEEN')
  const parser = workflow.nodes.find(n => n.type === 'n8n-nodes-base.code')
  const run = new Function('$input', parser.parameters.jsCode)
  assert.equal(run({ all: () => [{ json: blu() }] })[0].json.nominal_mutasi, '10342.00')
  assert.ok(!workflow.nodes.some(n => /postgres|mySql/.test(n.type)))
  assert.equal(workflow.nodes.find(n => n.type === 'n8n-nodes-base.httpRequest').onError, 'stopWorkflow')
})
