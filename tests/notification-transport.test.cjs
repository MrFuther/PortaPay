const { test } = require('node:test')
const assert = require('node:assert/strict')
const notifications = require('../services/notification')
test('Discord delivery uses stable nonce and suppresses mentions; blocked DM stays retryable', async () => {
  const previous = notifications.discordClient
  const sent = []
  try {
    notifications.discordClient = { users: { fetch: async () => ({ send: async payload => { sent.push(payload) } }) } }
    const args = { platform: 'DISCORD', platform_id: 'test-only', embed: { description: 'test' }, deliveryKey: 'test-delivery' }
    assert.equal(await notifications.sendDirectMessage(args), true)
    assert.equal(await notifications.sendDirectMessage(args), true)
    assert.equal(sent[0].nonce, sent[1].nonce)
    assert.equal(sent[0].enforceNonce, true)
    assert.deepEqual(sent[0].allowedMentions, { parse: [] })
    notifications.discordClient.users.fetch = async () => { throw Object.assign(new Error('private diagnostic'), { code: 50007 }) }
    await assert.rejects(notifications.sendDirectMessage({ ...args, throwOnError: true }), /DM diblokir/)
  } finally { notifications.discordClient = previous }
})
test('Telegram payment notifications send plain text', async () => {
  const previous = notifications.telegramBot
  let options
  try {
    notifications.telegramBot = { telegram: { sendMessage: async (id, text, value) => { options = value } } }
    assert.equal(await notifications.sendDirectMessage({ platform: 'TELEGRAM', platform_id: 'test-only', content: '_unescaped description_', plainText: true }), true)
    assert.deepEqual(options, {})
  } finally { notifications.telegramBot = previous }
})
