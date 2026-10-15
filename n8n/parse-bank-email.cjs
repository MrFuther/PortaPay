// Shared verbatim with the generated n8n Code node. No network or dependencies.
function parseBankEmail(email) {
  const senders = {
    'receipts@blubybcadigital.id': { domain: 'blubybcadigital.id', account: 'BLU_MAIN' },
    'alerts@seabank.co.id': { domain: 'seabank.co.id', account: 'SEABANK_MAIN' },
    'noreply@dana.id': { domain: 'dana.id', account: 'DANA_MAIN' }
  }
  const address = String(email.from?.value?.[0]?.address || '').toLowerCase()
  const bank = senders[address]
  if (!bank) return null
  const subject = String(email.subject || '')
  const html = typeof email.html === 'string' ? email.html : ''
  const text = `${email.text || ''} ${html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]*>/g, ' ')}`
    .replace(/&nbsp;|&#160;|&#xA0;/gi, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/[\s\u200b]+/g, ' ')
  // Ignore outgoing receipts. They are not proof that the escrow account received funds.
  if (/permintaan transfer kamu|transfer keluar|kamu (?:telah )?mengirim/i.test(`${subject} ${text}`)) return null
  const incoming = bank.account === 'BLU_MAIN' ? /info transaksi masuk ke blu kamu/i.test(subject) : /(?:transfer|dana|uang|saldo|pembayaran)\s+(?:telah\s+)?(?:masuk|diterima)|(?:menerima|terima)\s+(?:transfer|dana|uang)/i.test(`${subject} ${text}`)
  if (!incoming) return null
  // Require the trusted receiving mail server's DMARC result, not From alone.
  const authValue = email.headers?.['authentication-results']
  if (typeof authValue !== 'string') throw new Error('Hasil autentikasi email kosong/ambigu.')
  const auth = authValue
  const domain = bank.domain.replace(/\./g, '\\.')
  if ((auth.match(/Authentication-Results:/gi) || []).length !== 1 || !/^Authentication-Results:\s*mx\.google\.com;/i.test(auth) || !new RegExp(`dmarc=pass[^;]*header\\.from=${domain}(?:\\s|;|$)`, 'i').test(auth)) throw new Error('Email bank tidak lolos DMARC penerima; perlu pemeriksaan manual.')
  const amounts = [...text.matchAll(/(?:Rp\.?|IDR)\s*(\d[\d.,]*)/gi)].map(match => {
    const value = match[1].replace(/\.$/, '')
    if (!/^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,\d{1,2})?$/.test(value)) throw new Error('Format nominal email ambigu.')
    const number = Number(value.replace(/\./g, '').replace(',', '.'))
    if (!Number.isFinite(number) || number <= 0 || !Number.isSafeInteger(Math.round(number * 100))) throw new Error('Nominal email tidak valid.')
    return number.toFixed(2)
  })
  const unique = [...new Set(amounts)]
  if (unique.length !== 1) throw new Error('Nominal email kosong/ambigu; perlu rekonsiliasi.')
  const occurred = new Date(email.date)
  const eventId = `${bank.account}:${email.messageId}`
  if (!email.messageId || eventId.length > 200 || !Number.isFinite(occurred.getTime())) throw new Error('ID/waktu mutasi email tidak tersedia atau terlalu panjang.')
  return { event_id: eventId, nominal_mutasi: unique[0], occurred_at: occurred.toISOString(), status: 'PAID', direction: 'CREDIT', currency: 'IDR', account: bank.account }
}
module.exports = { parseBankEmail }
