// Cloud SQL(PostgreSQL) 연결 풀. contractmanager 패턴을 그대로 따른다.
const { Pool } = require('pg')

const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false,
})

pool.on('error', (err) => {
  console.error('[db] pool error', err.message)
})

module.exports = { pool }
