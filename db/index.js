/**
 * db/index.js — PostgreSQL connection pool
 */
require('dotenv').config();

const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

pool.on('error', (err) => console.error('DB pool error:', err));

async function connectDB() {
  const client = await pool.connect();
  console.log('PostgreSQL connected');
  client.release();
}

function query(text, params) {
  return pool.query(text, params);
}

module.exports = { connectDB, query, pool };
