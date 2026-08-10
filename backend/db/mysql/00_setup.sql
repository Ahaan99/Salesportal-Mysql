-- ============================================================
-- Recruweb Salesportal - one-time MySQL setup
-- Run as root:  mysql -u root -p < backend/db/mysql/00_setup.sql
-- Then import: mysql -u root -p salesportal < backend/db/mysql/salesportal_full.sql
-- ============================================================

CREATE DATABASE IF NOT EXISTS salesportal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

-- App user (matches backend/.env.example defaults)
CREATE USER IF NOT EXISTS 'salesportal_app'@'localhost' IDENTIFIED BY 'Salesportal@App2026';
CREATE USER IF NOT EXISTS 'salesportal_app'@'127.0.0.1' IDENTIFIED BY 'Salesportal@App2026';

GRANT ALL PRIVILEGES ON salesportal.* TO 'salesportal_app'@'localhost';
GRANT ALL PRIVILEGES ON salesportal.* TO 'salesportal_app'@'127.0.0.1';

FLUSH PRIVILEGES;
