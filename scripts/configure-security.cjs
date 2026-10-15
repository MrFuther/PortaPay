const fs = require('node:fs')
const { randomBytes } = require('node:crypto')
const dotenv = require('dotenv')
let content = fs.readFileSync('.env', 'utf8')
const current = dotenv.parse(content)
fs.mkdirSync('scratch/n8n', { recursive: true })
if (!fs.existsSync('scratch/n8n/env-before-hardening')) fs.writeFileSync('scratch/n8n/env-before-hardening', content)
function set(key, value) {
  const line = `${key}=${value}`
  const regex = new RegExp(`^${key}=.*$`, 'm')
  content = regex.test(content) ? content.replace(regex, line) : `${content.trimEnd()}\n${line}\n`
}
const localOverride = current.NODE_ENV !== 'production' && current.ADMIN_ALLOW_LOCAL_PASSWORD === 'true' && current.ADMIN_PASSWORD === 'admin'
if (!localOverride && (!current.ADMIN_PASSWORD || current.ADMIN_PASSWORD.length < 16 || current.ADMIN_PASSWORD === 'admin12345')) set('ADMIN_PASSWORD', randomBytes(24).toString('base64url'))
if (!current.N8N_WEBHOOK_SECRET || current.N8N_WEBHOOK_SECRET.length < 32) set('N8N_WEBHOOK_SECRET', randomBytes(32).toString('hex'))
set('PAYMENT_ALLOWED_ACCOUNTS', 'BLU_MAIN,DANA_MAIN,SEABANK_MAIN')
// Disable public simulation endpoint for actual bank-payment testing.
set('MOCK_PAYMENT', 'false')
if (!current.ADMIN_ORIGIN) set('ADMIN_ORIGIN', 'http://localhost:5173')
fs.writeFileSync('.env', content)
const updated = dotenv.parse(content)
fs.writeFileSync('scratch/n8n/callback-credential.json', JSON.stringify([{ id: 'portapay-n8n-callback', name: 'PortaPay callback secret', type: 'httpHeaderAuth', data: { name: 'x-webhook-secret', value: updated.N8N_WEBHOOK_SECRET } }], null, 2))
console.log('Local secrets configured in ignored .env; no credentials printed. Mock payment disabled.')
