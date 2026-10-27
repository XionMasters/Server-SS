-- Bloqueo persistente de usuarios desde el panel admin (F14).
-- NULL = activo; con fecha = bloqueado desde ese momento.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ NULL;
