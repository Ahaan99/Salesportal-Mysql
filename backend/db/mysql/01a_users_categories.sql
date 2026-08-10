-- Recruweb Sales Portal - MySQL 8 schema (chunk A: users, categories)
-- uuid -> CHAR(36) DEFAULT (uuid()); timestamptz -> DATETIME(3)

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id                 CHAR(36)     NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  email              VARCHAR(255) NOT NULL UNIQUE,
  password_hash      VARCHAR(255) NOT NULL,
  full_name          VARCHAR(160) NULL,
  role               ENUM('admin','client','field') NOT NULL DEFAULT 'client',
  email_confirmed_at DATETIME(3)  NULL,
  last_sign_in_at    DATETIME(3)  NULL,
  created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id         BIGINT       NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name       VARCHAR(200) NOT NULL,
  slug       VARCHAR(255) NOT NULL UNIQUE,
  parent_id  BIGINT       NULL,
  level      SMALLINT     NOT NULL DEFAULT 0,
  sort_order INT          NOT NULL DEFAULT 0,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_categories_parent (parent_id),
  INDEX idx_categories_level (level),
  CONSTRAINT fk_categories_parent FOREIGN KEY (parent_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
