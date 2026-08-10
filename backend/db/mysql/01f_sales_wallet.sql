-- Chunk F: sales_submissions, officer_wallets, payout_requests

CREATE TABLE IF NOT EXISTS sales_submissions (
  id               CHAR(36)      NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  officer_id       CHAR(36)      NOT NULL,
  officer_name     VARCHAR(160)  NOT NULL,
  product_id       CHAR(36)      NULL,
  product_name     VARCHAR(255)  NOT NULL,
  customer_name    VARCHAR(160)  NOT NULL,
  customer_company VARCHAR(160)  NULL,
  customer_phone   VARCHAR(32)   NULL,
  city             VARCHAR(100)  NULL,
  state            VARCHAR(100)  NULL,
  qty              INT           NOT NULL,
  unit_price       DECIMAL(12,2) NOT NULL,
  total_amount     DECIMAL(14,2) NOT NULL,
  commission_rate  DECIMAL(5,4)  NOT NULL DEFAULT 0.0800,
  invoice_ref      VARCHAR(200)  NULL,
  payment_mode     ENUM('cash','upi','bank_transfer','cheque','other') NULL,
  payment_ref      VARCHAR(200)  NULL,
  remarks          TEXT          NULL,
  status           ENUM('pending','approved','rejected','hold','clarification') NOT NULL DEFAULT 'pending',
  admin_note       TEXT          NULL,
  reviewed_by      CHAR(36)      NULL,
  reviewed_at      DATETIME(3)   NULL,
  order_id         CHAR(36)      NULL,
  created_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_sales_sub_officer (officer_id, created_at DESC),
  INDEX idx_sales_sub_status (status, created_at ASC),
  INDEX idx_sales_sub_product (product_id),
  CONSTRAINT fk_sales_sub_officer FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_sales_sub_product FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  CONSTRAINT fk_sales_sub_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS officer_wallets (
  officer_id       CHAR(36)      NOT NULL PRIMARY KEY,
  pending_amount   DECIMAL(14,2) NOT NULL DEFAULT 0,
  available_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  withdrawn_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
  total_earned     DECIMAL(14,2) NOT NULL DEFAULT 0,
  updated_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_officer_wallets_user FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payout_requests (
  id              CHAR(36)      NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  officer_id      CHAR(36)      NOT NULL,
  amount          DECIMAL(14,2) NOT NULL,
  bank_name       VARCHAR(160)  NULL,
  bank_account    VARCHAR(64)   NULL,
  bank_ifsc       VARCHAR(32)   NULL,
  upi_id          VARCHAR(120)  NULL,
  remarks         TEXT          NULL,
  status          ENUM('pending','processing','paid','rejected') NOT NULL DEFAULT 'pending',
  admin_note      TEXT          NULL,
  reviewed_by     CHAR(36)      NULL,
  reviewed_at     DATETIME(3)   NULL,
  paid_at         DATETIME(3)   NULL,
  transaction_ref VARCHAR(200)  NULL,
  created_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_payout_requests_officer (officer_id, created_at DESC),
  INDEX idx_payout_requests_status (status, created_at DESC),
  CONSTRAINT fk_payout_requests_officer FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
