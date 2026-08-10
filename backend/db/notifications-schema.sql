-- ═══════════════════════════════════════════════════════════════════════
--  Notifications Schema
--  Run in Supabase SQL editor or via psql
-- ═══════════════════════════════════════════════════════════════════════

-- ── In-app notifications ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID         REFERENCES auth.users(id) ON DELETE CASCADE,
  user_role    TEXT,        -- used for role-broadcast when user_id is NULL
  type         TEXT         NOT NULL,
  title        TEXT         NOT NULL,
  message      TEXT         NOT NULL,
  read         BOOLEAN      NOT NULL DEFAULT false,
  metadata     JSONB,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_id   ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread    ON public.notifications(user_id, read) WHERE user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_created   ON public.notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_role      ON public.notifications(user_role) WHERE user_id IS NULL;

-- ── Per-user notification preferences ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.notification_settings (
  user_id          UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email_enabled    BOOLEAN      NOT NULL DEFAULT true,
  sms_enabled      BOOLEAN      NOT NULL DEFAULT false,
  whatsapp_enabled BOOLEAN      NOT NULL DEFAULT false,
  push_enabled     BOOLEAN      NOT NULL DEFAULT false,
  -- Web Push subscription
  push_endpoint    TEXT,
  push_p256dh      TEXT,
  push_auth        TEXT,
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ── RLS ───────────────────────────────────────────────────────────────
ALTER TABLE public.notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_own_notifications"   ON public.notifications;
DROP POLICY IF EXISTS "users_own_notif_settings"  ON public.notification_settings;

-- Users can read their own notifications OR role-broadcasts that target their role
-- (role-based select is handled in code via supabaseAdmin which bypasses RLS)
CREATE POLICY "users_own_notifications" ON public.notifications
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_notif_settings" ON public.notification_settings
  FOR ALL USING (auth.uid() = user_id);
