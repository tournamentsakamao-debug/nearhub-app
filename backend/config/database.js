// Database Connection - WORKING CONFIG
const mysql = require('mysql2');
require('dotenv').config();

// Create connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'nearhub_db',
  port: process.env.DB_PORT || 3306,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

// Test connection
pool.getConnection((err, connection) => {
  if (err) {
    console.error('❌ Database connection FAILED:');
    console.error('Error:', err.message);
    console.error('\n⚠️  Please check:');
    console.error('1. MySQL server is running');
    console.error('2. Database credentials in .env file');
    console.error('3. Database "nearhub_db" exists\n');
    process.exit(1);
  }
  console.log('✅ Database connected successfully');
  console.log(`📍 Connected to: ${process.env.DB_NAME || 'nearhub_db'}`);
  connection.release();
});

// Export promise-based pool
const promisePool = pool.promise();

module.exports = promisePool;

