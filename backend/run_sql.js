const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  user: process.env.DB_USER || 'postgres',
  host: process.env.DB_HOST || 'localhost',
  database: process.env.DB_NAME || 'SLRWs',
  password: process.env.DB_PASSWORD || 'Miswa1211',
  port: process.env.DB_PORT || 5432,
});

async function run() {
  const sqlPath = path.join(__dirname, 'sql', 'add_reading_schedule.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');
  try {
    const res = await pool.query(sql);
    console.log('Successfully executed SQL script.', res);
  } catch (err) {
    console.error('Error executing SQL script:', err);
  } finally {
    pool.end();
  }
}

run();
