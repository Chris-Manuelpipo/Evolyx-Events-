-- src/db/migrate-roles.js (exécute ce SQL via psql ou dans migrate.js)
-- ── TABLE : event_members ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS event_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  organizer_id  UUID NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  role          VARCHAR(20) NOT NULL DEFAULT 'STAFF'
                CHECK (role IN ('OWNER','ADMIN','STAFF','COMPTABLE','MARKETER')),
  invited_by    UUID REFERENCES organizers(id),
  joined_at     TIMESTAMPTZ DEFAULT NOW(),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (event_id, organizer_id)
);

-- ── TABLE : invitations ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id      UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  email         VARCHAR(255) NOT NULL,
  role          VARCHAR(20) NOT NULL DEFAULT 'STAFF'
                CHECK (role IN ('ADMIN','STAFF','COMPTABLE','MARKETER')),
  token         VARCHAR(64) UNIQUE NOT NULL,
  invited_by    UUID NOT NULL REFERENCES organizers(id),
  accepted_at   TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_members_event ON event_members(event_id);
CREATE INDEX IF NOT EXISTS idx_event_members_organizer ON event_members(organizer_id);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

-- Migrer les événements existants : l'organisateur devient OWNER automatiquement
INSERT INTO event_members (event_id, organizer_id, role)
SELECT e.id, e.organizer_id, 'OWNER'
FROM events e
ON CONFLICT (event_id, organizer_id) DO NOTHING;