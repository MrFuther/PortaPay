const { randomBytes, scryptSync, timingSafeEqual } = require('crypto')
const sessions = new Map()
const attempts = new Map()
const TTL = 60 * 60 * 1000
const cookieName = 'portapay_session'
const salt = randomBytes(16)
const configured = process.env.ADMIN_PASSWORD || ''
const localPassword = process.env.NODE_ENV !== 'production' && process.env.ADMIN_ALLOW_LOCAL_PASSWORD === 'true' && configured === 'admin'
const validConfig = localPassword || (configured.length >= 16 && configured.length <= 256 && !/^(admin12345|replace_with|your_)/i.test(configured))
const hash = scryptSync(configured, salt, 64)
const secure = process.env.NODE_ENV === 'production'
function localAccess(req) {
  const address = req.socket?.remoteAddress
  return ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(address) && ['localhost', '127.0.0.1', '[::1]', '::1'].includes(req.hostname) && !req.headers['x-forwarded-for'] && !req.headers.forwarded
}
function cookie(res, token, maxAge = TTL) {
  res.cookie(cookieName, token, { httpOnly: true, secure, sameSite: 'strict', maxAge, path: '/api/admin' })
}
function tokenFrom(req) {
  return (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1)
}
function auth(req, res, next) {
  if (localPassword && !localAccess(req)) return res.status(403).json({ success: false, message: 'Akses admin lokal hanya tersedia dari komputer ini.' })
  const token = tokenFrom(req)
  const session = sessions.get(token)
  if (!session || session.expires <= Date.now()) { sessions.delete(token); return res.status(401).json({ success: false }) }
  if (req.method !== 'GET' && req.headers.origin) {
    const allowed = new Set([`${req.protocol}://${req.get('host')}`, process.env.ADMIN_ORIGIN].filter(Boolean))
    if (!allowed.has(req.headers.origin)) return res.status(403).json({ success: false })
  }
  next()
}
function login(req, res) {
  if (!validConfig) return res.status(503).json({ success: false, message: 'ADMIN_PASSWORD wajib unik dan minimal 16 karakter.' })
  if (localPassword && !localAccess(req)) return res.status(403).json({ success: false, message: 'Akses admin lokal hanya tersedia dari komputer ini.' })
  const now = Date.now()
  // Bound memory and discard expired entries.
  for (const [ip, value] of attempts) if (value.expires <= now) attempts.delete(ip)
  for (const [token, value] of sessions) if (value.expires <= now) sessions.delete(token)
  if (attempts.size >= 10000 || sessions.size >= 1000) return res.status(429).json({ success: false })
  const attempt = attempts.get(req.ip) || { count: 0, expires: now + 15 * 60 * 1000 }
  if (attempt.count >= 5) return res.status(429).json({ success: false, message: 'Terlalu banyak percobaan. Tunggu 15 menit.' })
  const password = req.body?.password
  if (typeof password !== 'string' || password.length > 256 || !timingSafeEqual(hash, scryptSync(password, salt, 64))) {
    attempt.count++; attempts.set(req.ip, attempt)
    return res.status(401).json({ success: false, message: 'Password admin salah.' })
  }
  attempts.delete(req.ip)
  const token = randomBytes(32).toString('hex')
  sessions.set(token, { expires: now + TTL })
  cookie(res, token)
  return res.json({ success: true })
}
function logout(req, res) { sessions.delete(tokenFrom(req)); cookie(res, '', 0); return res.json({ success: true }) }
module.exports = { auth, login, logout, validConfig }
