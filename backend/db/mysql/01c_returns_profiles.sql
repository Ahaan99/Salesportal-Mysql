-- Chunk C: returns, refunds, profiles, commissions, notifications, notification_settings

CREATE TABLE IF NOT EXISTS returns (
  id            CHAR(36)      NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  order_id      CHAR(36)      NOT NULL,
  client_id     CHAR(36)      NOT NULL,
  reason        TEXT          NOT NULL,
  reason_code   ENUM('defective','not-as-described','changed-mind','damaged','other') NOT NULL,
  return_qty    INT           NOT NULL,
  refund_amount DECIMAL(12,2) NOT NULL,
  status        ENUM('pending','approved','rejected','shipped','completed') NOT NULL DEFAULT 'pending',
  notes         TEXT          NULL,
  created_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_returns_client_created (client_id, created_at DESC),
  INDEX idx_returns_status (status),
  CONSTRAINT fk_returns_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_returns_client FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS refunds (
  id             CHAR(36)      NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  return_id      CHAR(36)      NOT NULL,
  order_id       CHAR(36)      NOT NULL,
  client_id      CHAR(36)      NOT NULL,
  amount         DECIMAL(12,2) NOT NULL,
  refund_method  ENUM('original-payment','wallet','bank-transfer') NOT NULL DEFAULT 'original-payment',
  status         ENUM('pending','processing','completed','failed') NOT NULL DEFAULT 'pending',
  failure_reason TEXT          NULL,
  processed_at   DATETIME(3)   NULL,
  created_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at     DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_refunds_client_created (client_id, created_at DESC),
  INDEX idx_refunds_return (return_id),
  INDEX idx_refunds_status (status),
  CONSTRAINT fk_refunds_return FOREIGN KEY (return_id) REFERENCES returns(id) ON DELETE CASCADE,
  CONSTRAINT fk_refunds_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_refunds_client FOREIGN KEY (client_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS profiles (
  user_id         CHAR(36)      NOT NULL PRIMARY KEY,
  full_name       VARCHAR(160)  NOT NULL,
  phone           VARCHAR(32)   NULL,
  city            VARCHAR(100)  NULL,
  state           VARCHAR(100)  NULL,
  region          ENUM('North','South','East','West') NULL,
  address         TEXT          NULL,
  photo_url       TEXT          NULL,
  bank_name       VARCHAR(160)  NULL,
  bank_account    VARCHAR(64)   NULL,
  bank_ifsc       VARCHAR(32)   NULL,
  monthly_target  DECIMAL(12,2) NOT NULL DEFAULT 350000,
  seller_category ENUM('field','independent') NOT NULL DEFAULT 'field',
  joined_at       DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_profiles_region (region),
  INDEX idx_profiles_city (city),
  INDEX idx_profiles_seller_category (seller_category),
  CONSTRAINT fk_profiles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS commissions (
  id         CHAR(36)      NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  order_id   CHAR(36)      NOT NULL UNIQUE,
  officer_id CHAR(36)      NOT NULL,
  rate       DECIMAL(5,4)  NOT NULL DEFAULT 0.0800,
  amount     DECIMAL(12,2) NOT NULL,
  status     ENUM('pending','available','settled') NOT NULL DEFAULT 'pending',
  settled_at DATETIME(3)   NULL,
  created_at DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_commissions_officer (officer_id, status, created_at DESC),
  CONSTRAINT fk_commissions_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_commissions_officer FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notifications (
  id         CHAR(36)     NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  user_id    CHAR(36)     NULL,
  type       VARCHAR(40)  NOT NULL,
  title      VARCHAR(200) NOT NULL,
  body       TEXT         NULL,
  link       TEXT         NULL,
  `read`     TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_notifications_user (user_id, `read`, created_at DESC),
  CONSTRAINT fk_notifications_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id          CHAR(36)    NOT NULL PRIMARY KEY,
  email_enabled    TINYINT(1)  NOT NULL DEFAULT 1,
  sms_enabled      TINYINT(1)  NOT NULL DEFAULT 0,
  whatsapp_enabled TINYINT(1)  NOT NULL DEFAULT 0,
  push_enabled     TINYINT(1)  NOT NULL DEFAULT 0,
  push_endpoint    TEXT        NULL,
  push_p256dh      TEXT        NULL,
  push_auth        TEXT        NULL,
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_notif_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
