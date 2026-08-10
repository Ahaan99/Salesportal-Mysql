-- Chunk E: chat_threads, chat_messages, kyc_submissions, kyc_documents

CREATE TABLE IF NOT EXISTS chat_threads (
  id                     CHAR(36)     NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  participant_id         CHAR(36)     NOT NULL UNIQUE,
  participant_name       VARCHAR(160) NOT NULL,
  participant_role       ENUM('client','field') NOT NULL,
  last_message           TEXT         NULL,
  last_message_at        DATETIME(3)  NULL,
  unread_for_admin       INT          NOT NULL DEFAULT 0,
  unread_for_participant INT          NOT NULL DEFAULT 0,
  created_at             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at             DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_chat_threads_role (participant_role),
  INDEX idx_chat_threads_last_message_at (last_message_at DESC),
  CONSTRAINT fk_chat_threads_participant FOREIGN KEY (participant_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS chat_messages (
  id          CHAR(36)    NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  thread_id   CHAR(36)    NOT NULL,
  sender_id   CHAR(36)    NULL,
  sender_role ENUM('participant','admin') NOT NULL,
  body        TEXT        NOT NULL,
  status      ENUM('sent','delivered','read') NOT NULL DEFAULT 'sent',
  created_at  DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_chat_messages_thread (thread_id, created_at),
  INDEX idx_chat_messages_status (thread_id, sender_role, status),
  CONSTRAINT fk_chat_messages_thread FOREIGN KEY (thread_id) REFERENCES chat_threads(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_messages_sender FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kyc_submissions (
  id               CHAR(36)    NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  user_id          CHAR(36)    NOT NULL UNIQUE,
  user_role        ENUM('field','client') NOT NULL,
  status           ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft',
  submitted_at     DATETIME(3) NULL,
  reviewed_at      DATETIME(3) NULL,
  reviewed_by      CHAR(36)    NULL,
  rejection_reason TEXT        NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_kyc_submissions_status (status),
  CONSTRAINT fk_kyc_submissions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS kyc_documents (
  id            CHAR(36)     NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  submission_id CHAR(36)     NOT NULL,
  user_id       CHAR(36)     NOT NULL,
  doc_type      ENUM('pan','driving_license','passport','voter_id','gst','bank_statement','shop_photo') NOT NULL,
  storage_path  VARCHAR(500) NOT NULL,
  file_name     VARCHAR(300) NOT NULL,
  file_size     BIGINT       NOT NULL,
  mime_type     VARCHAR(120) NOT NULL,
  uploaded_at   DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_kyc_documents_sub_type (submission_id, doc_type),
  INDEX idx_kyc_documents_user (user_id),
  CONSTRAINT fk_kyc_documents_submission FOREIGN KEY (submission_id) REFERENCES kyc_submissions(id) ON DELETE CASCADE,
  CONSTRAINT fk_kyc_documents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
