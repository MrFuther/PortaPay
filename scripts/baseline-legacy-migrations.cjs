// The old app used sync() instead of migration history. Verify the legacy schema
// before recording its equivalent migrations; never recreate existing tables.
require('dotenv').config({ quiet: true })
const sequelize = require('../db')
const S = require('sequelize')
const names = ['20260503134200-init-schema.js', '20260805000000-add-amount-with-code.js', '20260901000000-create-withdrawals.js']
;(async () => {
  try {
    const expected = {}
    const capture = {
      async createTable(name, columns) { expected[name] = columns },
      async addColumn(name, key, column) { expected[name][key] = column }
    }
    for (const name of names) await require(`../db/migrations/${name}`).up(capture, S)
    const q = sequelize.getQueryInterface()
    for (const [table, fields] of Object.entries(expected)) {
      const actual = await q.describeTable(table)
      const indexes = await q.showIndex(table)
      for (const [key, field] of Object.entries(fields)) {
        const column = actual[key]
        if (!column || (field.primaryKey && !column.primaryKey) || (field.allowNull === false && column.allowNull)) throw new Error(`Legacy schema mismatch: ${table}.${key}`)
        if (field.unique && !indexes.some(index => index.unique && index.fields.length === 1 && index.fields[0].attribute === key)) throw new Error(`Missing unique constraint: ${table}.${key}`)
        const typeKey = field.type.key || field.type.constructor.key
        if (typeKey === 'UUID' && column.type !== 'UUID') throw new Error(`Expected UUID: ${table}.${key}`)
        if (typeKey === 'DECIMAL' && !/^NUMERIC|^DECIMAL/.test(column.type)) throw new Error(`Expected decimal: ${table}.${key}`)
        if (field.type.values?.length && !field.type.values.every(v => column.special?.includes(v))) throw new Error(`Enum mismatch: ${table}.${key}`)
      }
    }
    await sequelize.transaction(async transaction => {
      for (const name of names) await sequelize.query('INSERT INTO "SequelizeMeta" (name) VALUES (:name) ON CONFLICT DO NOTHING', { replacements: { name }, transaction })
    })
    console.log('Verified existing legacy tables/columns/constraints and recorded migration baseline. No business data changed.')
  } finally { await sequelize.close() }
})().catch(error => { console.error(error.message); process.exitCode = 1 })
