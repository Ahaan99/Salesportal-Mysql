// MySQL connection pool (replaces Supabase Postgres).
// All timestamps are stored as UTC DATETIME(3); dateStrings=false so mysql2
// returns JS Dates, which we serialize to ISO strings in the query layer.
const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE || "salesportal",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  timezone: "Z", // interpret/store DATETIME as UTC
  charset: "utf8mb4_unicode_ci",
  supportBigNumbers: true,
  decimalNumbers: true, // DECIMAL -> JS number (matches supabase-js numeric behavior in this app)
});

module.exports = { pool };
