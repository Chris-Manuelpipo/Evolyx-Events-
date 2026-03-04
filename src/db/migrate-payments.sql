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