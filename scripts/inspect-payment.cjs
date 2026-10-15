require('dotenv').config({ quiet: true })
const { Client } = require('pg')
const client = new Client({ host: process.env.DB_HOST, port: process.env.DB_PORT, user: process.env.DB_USER, password: process.env.DB_PASS, database: process.env.DB_NAME, connectionTimeoutMillis: 5000 })
;(async () => {
  try {
    await client.connect()
    await client.query('BEGIN READ ONLY')
    const result = await client.query(`SELECT id,status,amount,fee,amount_with_code,unique_code,"createdAt","updatedAt", ("createdAt" >= NOW() - INTERVAL '2 hours') AS matches_time_window FROM "Transactions" WHERE id = $1`, ['9dc634f7-e9b3-4633-a31b-700192ca51fe'])
    console.log(JSON.stringify(result.rows, null, 2))
    await client.query('ROLLBACK')
  } catch (error) { console.error(error.code || error.name, error.message); process.exitCode = 1 }
  finally { await client.end() }
})()
