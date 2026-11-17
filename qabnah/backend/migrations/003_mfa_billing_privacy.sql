-- Admin MFA (TOTP), recovery codes, refresh-token MFA flag, document expiry reminders, subscription billing, account deletion.
ALTER TABLE users ADD COLUMN totp_secret_enc text;          -- AES-256-GCM encrypted base32 secret
ALTER TABLE users ADD COLUMN totp_enabled_at timestamptz;
ALTER TABLE users ADD COLUMN totp_last_step bigint;         -- replay protection
ALTER TABLE users ADD COLUMN deleted_at timestamptz;

CREATE TABLE mfa_recovery_codes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash  text NOT NULL,
  used_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mfa_recovery_codes_user ON mfa_recovery_codes (user_id);

ALTER TABLE refresh_tokens ADD COLUMN mfa boolean NOT NULL DEFAULT false;

ALTER TABLE captain_documents ADD COLUMN expiry_notified_at timestamptz;

ALTER TABLE merchant_subscriptions ADD COLUMN last_billed_at timestamptz;
CREATE UNIQUE INDEX merchant_subscriptions_one_active ON merchant_subscriptions (merchant_id) WHERE status = 'active';

-- New permission for account erasure handling by staff is not needed: users delete their own accounts.
