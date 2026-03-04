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