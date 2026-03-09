-- Saved designs table for SysCrack canvas save/share.
-- Run this in the Supabase SQL editor.

CREATE TABLE saved_designs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL DEFAULT 'Untitled Design',
  template      TEXT,
  archetype     TEXT,
  canvas_state  JSONB NOT NULL,
  is_public     BOOLEAN NOT NULL DEFAULT false,
  share_token   TEXT UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_saved_designs_user    ON saved_designs(user_id);
CREATE INDEX idx_saved_designs_token   ON saved_designs(share_token) WHERE share_token IS NOT NULL;
CREATE INDEX idx_saved_designs_public  ON saved_designs(is_public) WHERE is_public = true;

ALTER TABLE saved_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own designs"
  ON saved_designs FOR ALL
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can read public designs"
  ON saved_designs FOR SELECT
  USING (is_public = true);
