-- Chunk D: CRM tables (leads, lead_follow_ups, crm_tasks, meetings, lead_notes, visits)

CREATE TABLE IF NOT EXISTS leads (
  id                 CHAR(36)     NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  officer_id         CHAR(36)     NOT NULL,
  shop_name          VARCHAR(200) NOT NULL,
  owner_name         VARCHAR(160) NOT NULL,
  phone              VARCHAR(32)  NULL,
  area               VARCHAR(200) NULL,
  city               VARCHAR(100) NULL,
  state              VARCHAR(100) NULL,
  potential          ENUM('hot','warm','cold') NOT NULL DEFAULT 'warm',
  status             ENUM('new','contacted','interested','not_interested','converted','lost') NOT NULL DEFAULT 'new',
  suggested_products JSON         NOT NULL,
  last_contact_at    DATETIME(3)  NULL,
  notes              TEXT         NULL,
  created_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at         DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_leads_officer (officer_id, created_at DESC),
  INDEX idx_leads_status (status),
  INDEX idx_leads_potential (potential),
  CONSTRAINT fk_leads_officer FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_follow_ups (
  id           CHAR(36)    NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  lead_id      CHAR(36)    NOT NULL,
  officer_id   CHAR(36)    NOT NULL,
  type         ENUM('call','visit','whatsapp','email') NOT NULL DEFAULT 'call',
  scheduled_at DATETIME(3) NOT NULL,
  completed_at DATETIME(3) NULL,
  status       ENUM('pending','done','missed','cancelled') NOT NULL DEFAULT 'pending',
  notes        TEXT        NULL,
  created_at   DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_follow_ups_lead (lead_id, scheduled_at ASC),
  INDEX idx_follow_ups_officer (officer_id, scheduled_at ASC),
  INDEX idx_follow_ups_status (status, scheduled_at ASC),
  CONSTRAINT fk_follow_ups_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_follow_ups_officer FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_tasks (
  id          CHAR(36)     NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  officer_id  CHAR(36)     NOT NULL,
  lead_id     CHAR(36)     NULL,
  title       VARCHAR(300) NOT NULL,
  description TEXT         NULL,
  due_date    DATE         NULL,
  priority    ENUM('high','medium','low') NOT NULL DEFAULT 'medium',
  status      ENUM('pending','in_progress','done','cancelled') NOT NULL DEFAULT 'pending',
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_crm_tasks_officer (officer_id, due_date ASC),
  INDEX idx_crm_tasks_lead (lead_id),
  INDEX idx_crm_tasks_status (status),
  CONSTRAINT fk_crm_tasks_officer FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_tasks_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS meetings (
  id               CHAR(36)     NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  officer_id       CHAR(36)     NOT NULL,
  lead_id          CHAR(36)     NULL,
  title            VARCHAR(300) NOT NULL,
  customer_name    VARCHAR(160) NULL,
  location         VARCHAR(300) NULL,
  scheduled_at     DATETIME(3)  NOT NULL,
  duration_minutes INT          NOT NULL DEFAULT 30,
  status           ENUM('scheduled','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
  notes            TEXT         NULL,
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_meetings_officer (officer_id, scheduled_at ASC),
  INDEX idx_meetings_lead (lead_id),
  INDEX idx_meetings_status (status),
  CONSTRAINT fk_meetings_officer FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_meetings_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_notes (
  id         CHAR(36)    NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  lead_id    CHAR(36)    NOT NULL,
  officer_id CHAR(36)    NOT NULL,
  content    TEXT        NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_lead_notes_lead (lead_id, created_at DESC),
  INDEX idx_lead_notes_officer (officer_id),
  CONSTRAINT fk_lead_notes_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE CASCADE,
  CONSTRAINT fk_lead_notes_officer FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS visits (
  id         CHAR(36)    NOT NULL DEFAULT (uuid()) PRIMARY KEY,
  lead_id    CHAR(36)    NULL,
  officer_id CHAR(36)    NOT NULL,
  outcome    ENUM('ordered','interested','follow-up','not-interested') NOT NULL,
  note       TEXT        NULL,
  visited_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_visits_officer_day (officer_id, visited_at DESC),
  INDEX idx_visits_lead (lead_id),
  CONSTRAINT fk_visits_lead FOREIGN KEY (lead_id) REFERENCES leads(id) ON DELETE SET NULL,
  CONSTRAINT fk_visits_officer FOREIGN KEY (officer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
