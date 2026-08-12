-- Chunk I: join_applications — real storage for the public "Join as seller" form
-- (replaces the fake hardcoded application numbers in the frontend).

CREATE TABLE IF NOT EXISTS join_applications (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  code       VARCHAR(16)  NOT NULL UNIQUE,          -- e.g. FSO-2611 / IND-1042
  category   ENUM('field','independent') NOT NULL,
  name       VARCHAR(200) NOT NULL,
  phone      VARCHAR(32)  NOT NULL,
  city       VARCHAR(200) NOT NULL,
  status     ENUM('pending','contacted','approved','rejected') NOT NULL DEFAULT 'pending',
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_join_apps_status (status, created_at DESC),
  INDEX idx_join_apps_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
