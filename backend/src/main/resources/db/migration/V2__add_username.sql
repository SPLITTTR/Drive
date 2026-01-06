-- V2: add username to app_user for sharing by username
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS username TEXT NULL;

-- case-insensitive uniqueness (lower(username)) is ideal; use plain UNIQUE for simplicity
CREATE UNIQUE INDEX IF NOT EXISTS ux_app_user_username ON app_user(username);
