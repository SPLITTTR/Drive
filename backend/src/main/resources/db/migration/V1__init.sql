-- V1: metadata + sharing (NO Postgres ENUMs; use TEXT + CHECK)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS app_user (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_user_id TEXT NOT NULL UNIQUE,
  email         TEXT NULL,
  display_name  TEXT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS item (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  parent_id     UUID NULL REFERENCES item(id),          -- no cascade; we delete manually
  type          TEXT NOT NULL,
  name          TEXT NOT NULL,

  -- file-only fields (folders keep these NULL)
  mime_type     TEXT NULL,
  size_bytes    BIGINT NULL,
  s3_key        TEXT NULL,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enforce allowed values (replaces Postgres ENUM)
ALTER TABLE item
  ADD CONSTRAINT item_type_check CHECK (type IN ('FOLDER', 'FILE'));

-- Optional: ensure folder/file shape
ALTER TABLE item
  ADD CONSTRAINT item_file_shape_check CHECK (
    (type = 'FOLDER' AND s3_key IS NULL AND size_bytes IS NULL AND mime_type IS NULL)
    OR
    (type = 'FILE' AND s3_key IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_item_owner_parent ON item(owner_user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_item_parent ON item(parent_id);
CREATE INDEX IF NOT EXISTS idx_item_name_lower ON item((lower(name)));

CREATE TABLE IF NOT EXISTS item_share (
  item_id             UUID NOT NULL REFERENCES item(id) ON DELETE CASCADE,
  shared_with_user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role                TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, shared_with_user_id)
);

ALTER TABLE item_share
  ADD CONSTRAINT item_share_role_check CHECK (role IN ('VIEWER', 'EDITOR', 'OWNER'));

CREATE INDEX IF NOT EXISTS idx_item_share_shared_with ON item_share(shared_with_user_id);
