// Read the local n8n database only. Produce a reviewable import without secrets.
const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID } = require('node:crypto')
const { parseBankEmail } = require('../n8n/parse-bank-email.cjs')
const db = new DatabaseSync(path.join(process.env.USERPROFILE, '.n8n', 'database.sqlite'), { readOnly: true })
try {
  const row = db.prepare('SELECT * FROM workflow_entity WHERE id=?').get('K9ZIMlTQDCwVGVoy')
  if (!row) throw new Error('Workflow tidak ditemukan.')
  const nodes = JSON.parse(row.nodes)
  const trigger = nodes.find(n => n.type === 'n8n-nodes-base.emailReadImap')
  if (!trigger) throw new Error('IMAP trigger tidak ditemukan.')
  const original = { id: row.id, name: row.name, nodes, connections: JSON.parse(row.connections), settings: JSON.parse(row.settings || '{}'), active: false }
  fs.mkdirSync('scratch/n8n', { recursive: true })
  if (!fs.existsSync('scratch/n8n/original-workflow.json')) fs.writeFileSync('scratch/n8n/original-workflow.json', JSON.stringify(original, null, 2))
  const parser = { id: randomUUID(), name: 'Validate incoming bank email', type: 'n8n-nodes-base.code', typeVersion: 2, position: [300, 0], parameters: { mode: 'runOnceForAllItems', jsCode: `${parseBankEmail.toString()}\nreturn $input.all().map(item => parseBankEmail(item.json)).filter(Boolean).map(json => ({ json }));` } }
  const callback = { id: randomUUID(), name: 'Confirm escrow payment', type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [580, 0], onError: 'stopWorkflow', parameters: { method: 'POST', url: 'http://localhost:3000/tripay/n8n/callback', authentication: 'genericCredentialType', genericAuthType: 'httpHeaderAuth', sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json) }}', options: { timeout: 10000 } }, credentials: { httpHeaderAuth: { id: 'portapay-n8n-callback', name: 'PortaPay callback secret' } } }
  // Exact sender filters; code independently verifies sender, direction and DMARC.
  trigger.parameters.postProcessAction = 'read'
  trigger.parameters.options = { ...trigger.parameters.options, customEmailConfig: JSON.stringify(['UNSEEN', ['OR', ['FROM', 'receipts@blubybcadigital.id'], ['OR', ['FROM', 'alerts@seabank.co.id'], ['FROM', 'noreply@dana.id']]]]) }
  JSON.parse(trigger.parameters.options.customEmailConfig)
  const workflow = { ...original, name: row.name, nodes: [trigger, parser, callback], connections: { [trigger.name]: { main: [[{ node: parser.name, type: 'main', index: 0 }]] }, [parser.name]: { main: [[{ node: callback.name, type: 'main', index: 0 }]] } } }
  fs.mkdirSync('n8n', { recursive: true })
  fs.writeFileSync('n8n/Payment Method.secure.json', JSON.stringify(workflow, null, 2))
  fs.writeFileSync('Payment Method.json', JSON.stringify(workflow, null, 2))
  console.log('Prepared n8n/Payment Method.secure.json; original backed up in ignored scratch/n8n.')
} finally { db.close() }
