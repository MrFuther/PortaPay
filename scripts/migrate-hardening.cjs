require('dotenv').config({ quiet: true })
const sequelize = require('../db')
const S = require('sequelize')
const migration = require('../db/migrations/20261015000000-harden-escrow')
const name = '20261015000000-harden-escrow.js'
;(async () => {
  try {
    const q = sequelize.getQueryInterface()
    await sequelize.query('CREATE TABLE IF NOT EXISTS "SequelizeMeta" (name VARCHAR(255) PRIMARY KEY NOT NULL)')
    const [existing] = await sequelize.query('SELECT name FROM "SequelizeMeta" WHERE name = :name', { replacements: { name } })
    if (existing.length) { console.log('Hardening migration already applied.'); return }
    await migration.up(q, S)
    await sequelize.query('INSERT INTO "SequelizeMeta" (name) VALUES (:name)', { replacements: { name } })
    console.log('Additive hardening migration applied. Historical balances and transaction statuses were not changed.')
  } finally { await sequelize.close() }
})().catch(error => { console.error(error.message); process.exitCode = 1 })
