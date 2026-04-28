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
  try {
    const res = await pool.query("SELECT table_type FROM information_schema.tables WHERE table_name='zones'");
    console.log('Type of zones:', res.rows);
  } catch (err) {
    console.error('Error:', err);
  } finally {
    pool.end();
  }
}
run();
