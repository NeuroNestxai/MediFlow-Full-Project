-- =============================================================================
-- MediFlow AI — Security hardening 02: pgcrypto + Vault primitives for civil_id
-- Migration: 20260811152614_sec_02_civil_id_crypto_primitives
--            (ADDITIVE, IDEMPOTENT)
--
-- Requirement 4: civil_id is stored encrypted (pgcrypto pgp_sym) with a key held
-- in Supabase Vault (free-tier). The key never appears in a query result or in
-- any grantable function. Only the definer/owner and the admin-gated wrappers
-- (see migration sec_03) can reach these primitives.
--
-- NOTE: On a fresh environment this creates a NEW random key. Do not re-key an
-- environment that already holds encrypted civil_id values, or existing
-- ciphertext becomes undecryptable. The guard below makes it a no-op if present.
-- =============================================================================

begin;

do $$
begin
  if not exists (select 1 from vault.secrets where name = 'civil_id_encryption_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'civil_id_encryption_key',
      'pgcrypto pgp_sym key for encrypting patients.civil_id. Managed via private.* functions only.'
    );
  end if;
end $$;

create or replace function private.civil_id_key()
returns text language sql stable security definer set search_path to '' as $$
  select decrypted_secret from vault.decrypted_secrets
  where name = 'civil_id_encryption_key' limit 1;
$$;

create or replace function private.encrypt_civil_id(p_plaintext text)
returns bytea language sql volatile security definer set search_path to '' as $$
  select case
    when p_plaintext is null or btrim(p_plaintext) = '' then null
    else extensions.pgp_sym_encrypt(btrim(p_plaintext), private.civil_id_key())
  end;
$$;

create or replace function private.decrypt_civil_id(p_ciphertext bytea)
returns text language sql stable security definer set search_path to '' as $$
  select case
    when p_ciphertext is null then null
    else extensions.pgp_sym_decrypt(p_ciphertext, private.civil_id_key())
  end;
$$;

revoke all on function private.civil_id_key()          from public, anon, authenticated;
revoke all on function private.encrypt_civil_id(text)  from public, anon, authenticated;
revoke all on function private.decrypt_civil_id(bytea) from public, anon, authenticated;

comment on function private.civil_id_key() is 'Reads the civil_id Vault key. Definer-only; never grant to API roles.';
comment on function private.encrypt_civil_id(text) is 'Encrypts a civil_id with the Vault key (pgcrypto pgp_sym).';
comment on function private.decrypt_civil_id(bytea) is 'Decrypts a civil_id ciphertext. Reached only via admin-gated wrappers.';

commit;
