-- Chunk H: stock_adjustments (inventory audit trail) + company_profiles (vendor business profile)
-- MySQL translation of the Supabase tables added for the vendor inventory/profile features.

CREATE TABLE IF NOT EXISTS stock_adjustments (
  id              CHAR(36)     NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  owner_id        CHAR(36)     NOT NULL,
  product_id      CHAR(36)     NULL,
  product_name    VARCHAR(255) NOT NULL,              -- snapshot: survives product deletion
  type            ENUM('restock','correction','damage','sale') NOT NULL,
  delta           INT          NOT NULL,
  resulting_stock INT          NOT NULL,
  note            TEXT         NOT NULL,
  created_at      DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_stock_adj_owner (owner_id, created_at DESC),
  INDEX idx_stock_adj_product (product_id),
  CONSTRAINT fk_stock_adj_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_stock_adj_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT chk_stock_adj_delta CHECK (delta <> 0),
  CONSTRAINT chk_stock_adj_resulting CHECK (resulting_stock >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS company_profiles (
  owner_id       CHAR(36)     NOT NULL PRIMARY KEY,
  company_name   VARCHAR(200) NOT NULL DEFAULT '',
  legal_name     VARCHAR(200) NOT NULL DEFAULT '',
  tagline        VARCHAR(200) NOT NULL DEFAULT '',
  about          TEXT         NULL,
  contact_name   VARCHAR(200) NOT NULL DEFAULT '',
  email          VARCHAR(200) NOT NULL DEFAULT '',
  phone          VARCHAR(32)  NOT NULL DEFAULT '',
  website        VARCHAR(200) NOT NULL DEFAULT '',
  gstin          VARCHAR(20)  NOT NULL DEFAULT '',
  pan            VARCHAR(12)  NOT NULL DEFAULT '',
  address_line   VARCHAR(255) NOT NULL DEFAULT '',
  city           VARCHAR(100) NOT NULL DEFAULT '',
  state          VARCHAR(100) NOT NULL DEFAULT '',
  pincode        VARCHAR(8)   NOT NULL DEFAULT '',
  bank_name      VARCHAR(160) NOT NULL DEFAULT '',
  account_number VARCHAR(24)  NOT NULL DEFAULT '',
  ifsc           VARCHAR(16)  NOT NULL DEFAULT '',
  categories     JSON         NOT NULL DEFAULT (JSON_ARRAY()),
  updated_at     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_company_profiles_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
