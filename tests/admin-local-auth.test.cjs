const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const vm = require('node:vm')
function load(env) {
  const module = { exports: {} }
  vm.runInNewContext(fs.readFileSync(require.resolve('../services/admin-auth'), 'utf8'), { module, require, process: { env }, Date, Map, Set })
  return module.exports
}
function response() { return { code: 200, status(value) { this.code = value; return this }, json(body) { this.body = body; return this }, cookie() {} } }
const request = () => ({ body: { password: 'admin' }, headers: {}, hostname: 'localhost', socket: { remoteAddress: '127.0.0.1' }, ip: '127.0.0.1' })
test('requested short password is restricted to explicitly configured loopback development', () => {
  const auth = load({ ADMIN_PASSWORD: 'admin', ADMIN_ALLOW_LOCAL_PASSWORD: 'true' })
  const local = response(); auth.login(request(), local); assert.equal(local.code, 200)
  const remoteReq = request(); remoteReq.socket.remoteAddress = '192.168.1.50'
  const remote = response(); auth.login(remoteReq, remote); assert.equal(remote.code, 403)
  const proxyReq = request(); proxyReq.headers['x-forwarded-for'] = '192.168.1.50'
  const proxy = response(); auth.login(proxyReq, proxy); assert.equal(proxy.code, 403)
  const hostReq = request(); hostReq.hostname = 'external.example'
  const host = response(); auth.login(hostReq, host); assert.equal(host.code, 403)
})
test('short password remains invalid without opt-in and in production', () => {
  assert.equal(load({ ADMIN_PASSWORD: 'admin' }).validConfig, false)
  assert.equal(load({ ADMIN_PASSWORD: 'admin', ADMIN_ALLOW_LOCAL_PASSWORD: 'true', NODE_ENV: 'production' }).validConfig, false)
})
test('successful logins reset failure budget while repeated wrong passwords are limited', () => {
  const auth = load({ ADMIN_PASSWORD: 'admin', ADMIN_ALLOW_LOCAL_PASSWORD: 'true' })
  for (let i = 0; i < 8; i++) { const res = response(); auth.login(request(), res); assert.equal(res.code, 200) }
  for (let i = 0; i < 4; i++) { const req = request(); req.body.password = 'wrong'; const res = response(); auth.login(req, res); assert.equal(res.code, 401) }
  const reset = response(); auth.login(request(), reset); assert.equal(reset.code, 200)
  for (let i = 0; i < 5; i++) { const req = request(); req.body.password = 'wrong'; const res = response(); auth.login(req, res); assert.equal(res.code, 401) }
  const blocked = response(); auth.login(request(), blocked); assert.equal(blocked.code, 429)
})
