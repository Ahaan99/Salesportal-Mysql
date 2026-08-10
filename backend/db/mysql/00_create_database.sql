-- Creates the salesportal database and dedicated app user
CREATE DATABASE IF NOT EXISTS salesportal
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

CREATE USER IF NOT EXISTS 'salesportal_app'@'localhost' IDENTIFIED BY 'Salesportal@App2026';
GRANT ALL PRIVILEGES ON salesportal.* TO 'salesportal_app'@'localhost';
FLUSH PRIVILEGES;
