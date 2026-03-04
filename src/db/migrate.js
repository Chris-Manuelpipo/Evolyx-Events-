const { pool } = require("./index");

const migration = `

  -- Extensions
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";

  -- =============================================
  -- ORGANISATEURS
  -- =============================================
  CREATE TABLE IF NOT EXISTS organizers (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255)  NOT NULL UNIQUE,
    password    VARCHAR(255)  NOT NULL,
    name        VARCHAR(255)  NOT NULL,
    phone       VARCHAR(50),
    org_name    VARCHAR(255),
    org_slug    VARCHAR(255)  UNIQUE,
    logo_url    TEXT,
    currency    VARCHAR(10)   NOT NULL DEFAULT 'XAF',
    timezone    VARCHAR(100)  NOT NULL DEFAULT 'Africa/Douala',
    country     VARCHAR(10)   NOT NULL DEFAULT 'CM',
    is_verified BOOLEAN       NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );

  -- =============================================
  -- ÉVÉNEMENTS
  -- =============================================
  CREATE TABLE IF NOT EXISTS events (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    organizer_id  UUID          NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
    title         VARCHAR(255)  NOT NULL,
    slug          VARCHAR(255)  NOT NULL UNIQUE,
    description   TEXT,
    cover_url     TEXT,
    location_type VARCHAR(20)   NOT NULL DEFAULT 'PHYSICAL'
                  CHECK (location_type IN ('PHYSICAL','ONLINE','HYBRID')),
    address       VARCHAR(255),
    district      VARCHAR(255),
    city          VARCHAR(100),
    country       VARCHAR(10)   DEFAULT 'CM',
    online_url    TEXT,
    start_date    TIMESTAMPTZ   NOT NULL,
    end_date      TIMESTAMPTZ   NOT NULL,
    timezone      VARCHAR(100)  NOT NULL DEFAULT 'Africa/Douala',
    capacity      INTEGER,
    status        VARCHAR(20)   NOT NULL DEFAULT 'DRAFT'
                  CHECK (status IN ('DRAFT','PUBLISHED','CANCELLED','COMPLETED')),
    is_public     BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );

  -- =============================================
  -- TYPES DE BILLETS
  -- =============================================
  CREATE TABLE IF NOT EXISTS ticket_types (
    id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id    UUID          NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    name        VARCHAR(255)  NOT NULL,
    description TEXT,
    price       NUMERIC(12,2) NOT NULL DEFAULT 0,
    currency    VARCHAR(10)   NOT NULL DEFAULT 'XAF',
    quantity    INTEGER,
    sold        INTEGER       NOT NULL DEFAULT 0,
    sale_start  TIMESTAMPTZ,
    sale_end    TIMESTAMPTZ,
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    sort_order  INTEGER       NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );

  -- =============================================
  -- CODES PROMO
  -- =============================================
  CREATE TABLE IF NOT EXISTS promo_codes (
    id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id       UUID          NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    code           VARCHAR(50)   NOT NULL,
    discount_type  VARCHAR(20)   NOT NULL DEFAULT 'PERCENTAGE'
                   CHECK (discount_type IN ('PERCENTAGE','FIXED')),
    discount_value NUMERIC(12,2) NOT NULL,
    max_uses       INTEGER,
    used_count     INTEGER       NOT NULL DEFAULT 0,
    expires_at     TIMESTAMPTZ,
    is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    UNIQUE(event_id, code)
  );

  -- =============================================
  -- INSCRIPTIONS
  -- =============================================
  CREATE TABLE IF NOT EXISTS registrations (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id        UUID          NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    ticket_type_id  UUID          NOT NULL REFERENCES ticket_types(id),
    promo_code_id   UUID          REFERENCES promo_codes(id),
    first_name      VARCHAR(255)  NOT NULL,
    last_name       VARCHAR(255)  NOT NULL,
    email           VARCHAR(255)  NOT NULL,
    phone           VARCHAR(50),
    ticket_code     VARCHAR(50)   NOT NULL UNIQUE,
    ticket_url      TEXT,
    status          VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','CONFIRMED','CANCELLED','REFUNDED','MANUAL')),
    payment_method  VARCHAR(20)
                    CHECK (payment_method IN ('STRIPE','CINETPAY','MANUAL','FREE')),
    payment_ref     VARCHAR(255),
    amount_paid     NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    paid_at         TIMESTAMPTZ,
    checked_in      BOOLEAN       NOT NULL DEFAULT FALSE,
    checked_in_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );

  -- =============================================
  -- PAIEMENTS
  -- =============================================
  CREATE TABLE IF NOT EXISTS payments (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id UUID          NOT NULL REFERENCES registrations(id),
    amount          NUMERIC(12,2) NOT NULL,
    currency        VARCHAR(10)   NOT NULL DEFAULT 'XAF',
    method          VARCHAR(20)   NOT NULL,
    provider        VARCHAR(50)   NOT NULL,
    provider_ref    VARCHAR(255),
    status          VARCHAR(20)   NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING','SUCCESS','FAILED','REFUNDED')),
    metadata        JSONB,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
  );

  -- =============================================
  -- INDEX
  -- =============================================
  CREATE INDEX IF NOT EXISTS idx_events_organizer     ON events(organizer_id);
  CREATE INDEX IF NOT EXISTS idx_events_status        ON events(status);
  CREATE INDEX IF NOT EXISTS idx_events_slug          ON events(slug);
  CREATE INDEX IF NOT EXISTS idx_tickets_event        ON ticket_types(event_id);
  CREATE INDEX IF NOT EXISTS idx_registrations_event  ON registrations(event_id);
  CREATE INDEX IF NOT EXISTS idx_registrations_email  ON registrations(email);
  CREATE INDEX IF NOT EXISTS idx_registrations_code   ON registrations(ticket_code);
  CREATE INDEX IF NOT EXISTS idx_payments_reg         ON payments(registration_id);


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

  -- src/db/migrate-payments.sql

  -- TABLE : transactions
  CREATE TABLE IF NOT EXISTS transactions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    registration_id   UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    event_id          UUID NOT NULL REFERENCES events(id),
    organizer_id      UUID NOT NULL REFERENCES organizers(id),
    provider          VARCHAR(20) NOT NULL DEFAULT 'CINETPAY'
                      CHECK (provider IN ('CINETPAY','STRIPE','MANUAL','FREE')),
    transaction_id    VARCHAR(255) UNIQUE,
    payment_token     VARCHAR(255),
    amount            DECIMAL(12,2) NOT NULL,
    currency          VARCHAR(10) DEFAULT 'XAF',
    status            VARCHAR(20) DEFAULT 'PENDING'
                      CHECK (status IN ('PENDING','SUCCESS','FAILED','CANCELLED','REFUNDED')),
    payment_method    VARCHAR(50),
    phone_number      VARCHAR(20),
    metadata          JSONB DEFAULT '{}',
    webhook_received_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
  );

  CREATE INDEX IF NOT EXISTS idx_transactions_registration ON transactions(registration_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_txid         ON transactions(transaction_id);
  CREATE INDEX IF NOT EXISTS idx_transactions_status       ON transactions(status);

  -- Colonnes supplémentaires sur registrations
  ALTER TABLE registrations ADD COLUMN IF NOT EXISTS platform_fee DECIMAL(12,2) DEFAULT 0;
  ALTER TABLE registrations ADD COLUMN IF NOT EXISTS net_amount   DECIMAL(12,2) DEFAULT 0;
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log("🔄 Exécution des migrations...");
    await client.query(migration);
    console.log("✅ Tables créées avec succès");
  } catch (err) {
    console.error("❌ Erreur migration :", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();