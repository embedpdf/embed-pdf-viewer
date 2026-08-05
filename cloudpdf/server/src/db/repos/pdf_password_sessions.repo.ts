import type { Kysely } from 'kysely';
import type { Database as Schema, DocumentPdfOpenedAs, PdfPasswordSessionsTable } from '../schema';
import type { KmsKeyring } from '../../security';
import {
  decryptPasswordSession,
  encryptPasswordSession,
  type EncryptedPasswordSession,
  type PasswordSessionBinding,
  type PasswordSessionServerSecret,
} from '../../security/password-session';

export interface PasswordSessionFacts {
  openedAs: DocumentPdfOpenedAs;
  pdfPermissionsBits: number;
  pdfPermissionsAllAllowed: boolean;
  securityHandlerRevision: number | null;
}

export interface PasswordSessionRow extends PasswordSessionFacts {
  tenantId: string;
  docId: string;
  layerName: string;
  sub: string;
  jwtJti: string;
  baseSha: string;
  securityFingerprint: string;
  activeExpiresAt: number;
  renewableUntil: number;
  createdAt: number;
  updatedAt: number;
}

export interface PasswordSessionCreateInput {
  binding: PasswordSessionBinding;
  password: string;
  unlockKey: string;
  facts: PasswordSessionFacts;
  activeExpiresAt: number;
  renewableUntil: number;
}

export class PdfPasswordSessionsRepo {
  constructor(
    private readonly db: Kysely<Schema>,
    private readonly opts: {
      keyring: KmsKeyring;
      serverSecrets: ReadonlyArray<PasswordSessionServerSecret>;
    },
  ) {}

  async findActive(
    binding: PasswordSessionBinding,
    now = Date.now(),
  ): Promise<PasswordSessionRow | null> {
    const row = await this.baseQuery(binding)
      .where('active_expires_at', '>', now)
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  async findRenewable(
    binding: PasswordSessionBinding,
    now = Date.now(),
  ): Promise<PasswordSessionRow | null> {
    const row = await this.baseQuery(binding).where('renewable_until', '>', now).executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  /**
   * Drop the session bound to this token (immediate downgrade). Deletes
   * by the same identity columns `baseQuery` selects on, so it removes
   * the at-most-one row for the binding. Idempotent: a missing row is a
   * no-op.
   */
  async revoke(binding: PasswordSessionBinding): Promise<void> {
    await this.db
      .deleteFrom('pdf_password_sessions')
      .where('tenant_id', '=', binding.tenantId)
      .where('doc_id', '=', binding.docId)
      .where('layer_name', '=', binding.layerName)
      .where('sub', '=', binding.sub)
      .where('jwt_jti', '=', binding.jwtJti)
      .where('base_sha', '=', binding.baseSha)
      .where('security_fingerprint', '=', binding.securityFingerprint)
      .execute();
  }

  async decryptActivePassword(
    binding: PasswordSessionBinding,
    unlockKey: string,
    now = Date.now(),
  ): Promise<string | null> {
    const row = await this.baseQuery(binding)
      .where('active_expires_at', '>', now)
      .executeTakeFirst();
    if (!row) return null;
    const serverSecret = this.serverSecret(row.server_secret_id);
    return decryptPasswordSession({
      encrypted: encryptedFromRow(row),
      unlockKey,
      binding,
      serverSecret,
      keyring: this.opts.keyring,
    });
  }

  async upsertFromPassword(input: PasswordSessionCreateInput): Promise<PasswordSessionRow> {
    const now = Date.now();
    const serverSecret = this.currentServerSecret();
    const encrypted = await encryptPasswordSession({
      password: input.password,
      unlockKey: input.unlockKey,
      binding: input.binding,
      serverSecret,
      keyring: this.opts.keyring,
    });
    const row = {
      tenant_id: input.binding.tenantId,
      doc_id: input.binding.docId,
      layer_name: input.binding.layerName,
      sub: input.binding.sub,
      jwt_jti: input.binding.jwtJti,
      base_sha: input.binding.baseSha,
      security_fingerprint: input.binding.securityFingerprint,
      opened_as: input.facts.openedAs,
      pdf_permissions_bits: input.facts.pdfPermissionsBits,
      pdf_permissions_all_allowed: input.facts.pdfPermissionsAllAllowed ? 1 : 0,
      security_handler_revision: input.facts.securityHandlerRevision,
      active_expires_at: input.activeExpiresAt,
      renewable_until: input.renewableUntil,
      created_at: now,
      updated_at: now,
      server_secret_id: encrypted.serverSecretId,
      kms_provider_id: encrypted.kmsProviderId,
      kms_key_id: encrypted.kmsKeyId,
      crypto_version: encrypted.cryptoVersion,
      wrapped_data_key: encrypted.wrappedDataKey,
      row_salt: encrypted.rowSalt,
      nonce: encrypted.nonce,
      ciphertext: encrypted.ciphertext,
      auth_tag: encrypted.authTag,
    };

    await this.db
      .insertInto('pdf_password_sessions')
      .values(row)
      .onConflict((oc) =>
        oc
          .columns([
            'tenant_id',
            'doc_id',
            'layer_name',
            'sub',
            'jwt_jti',
            'base_sha',
            'security_fingerprint',
          ])
          .doUpdateSet({
            opened_as: row.opened_as,
            pdf_permissions_bits: row.pdf_permissions_bits,
            pdf_permissions_all_allowed: row.pdf_permissions_all_allowed,
            security_handler_revision: row.security_handler_revision,
            active_expires_at: row.active_expires_at,
            renewable_until: row.renewable_until,
            updated_at: row.updated_at,
            server_secret_id: row.server_secret_id,
            kms_provider_id: row.kms_provider_id,
            kms_key_id: row.kms_key_id,
            crypto_version: row.crypto_version,
            wrapped_data_key: row.wrapped_data_key,
            row_salt: row.row_salt,
            nonce: row.nonce,
            ciphertext: row.ciphertext,
            auth_tag: row.auth_tag,
          }),
      )
      .execute();

    return {
      ...input.binding,
      tenantId: input.binding.tenantId,
      docId: input.binding.docId,
      layerName: input.binding.layerName,
      jwtJti: input.binding.jwtJti,
      openedAs: input.facts.openedAs,
      pdfPermissionsBits: input.facts.pdfPermissionsBits,
      pdfPermissionsAllAllowed: input.facts.pdfPermissionsAllAllowed,
      securityHandlerRevision: input.facts.securityHandlerRevision,
      activeExpiresAt: input.activeExpiresAt,
      renewableUntil: input.renewableUntil,
      createdAt: now,
      updatedAt: now,
    };
  }

  async renew(
    binding: PasswordSessionBinding,
    activeExpiresAt: number,
    renewableUntil: number,
    now = Date.now(),
  ): Promise<PasswordSessionRow | null> {
    await this.db
      .updateTable('pdf_password_sessions')
      .set({
        active_expires_at: activeExpiresAt,
        renewable_until: renewableUntil,
        updated_at: now,
      })
      .where('tenant_id', '=', binding.tenantId)
      .where('doc_id', '=', binding.docId)
      .where('layer_name', '=', binding.layerName)
      .where('sub', '=', binding.sub)
      .where('jwt_jti', '=', binding.jwtJti)
      .where('base_sha', '=', binding.baseSha)
      .where('security_fingerprint', '=', binding.securityFingerprint)
      .where('renewable_until', '>', now)
      .execute();
    return this.findActive(binding, now);
  }

  private baseQuery(binding: PasswordSessionBinding) {
    return this.db
      .selectFrom('pdf_password_sessions')
      .selectAll()
      .where('tenant_id', '=', binding.tenantId)
      .where('doc_id', '=', binding.docId)
      .where('layer_name', '=', binding.layerName)
      .where('sub', '=', binding.sub)
      .where('jwt_jti', '=', binding.jwtJti)
      .where('base_sha', '=', binding.baseSha)
      .where('security_fingerprint', '=', binding.securityFingerprint);
  }

  private currentServerSecret(): PasswordSessionServerSecret {
    const first = this.opts.serverSecrets[0];
    if (!first) throw new Error('pdf password sessions require a server secret');
    return first;
  }

  private serverSecret(id: string): PasswordSessionServerSecret {
    const found = this.opts.serverSecrets.find((secret) => secret.id === id);
    if (!found) throw new Error(`unknown pdf password session server secret: ${id}`);
    return found;
  }
}

function encryptedFromRow(row: PdfPasswordSessionsTable): EncryptedPasswordSession {
  return {
    cryptoVersion: row.crypto_version as EncryptedPasswordSession['cryptoVersion'],
    serverSecretId: row.server_secret_id,
    kmsProviderId: row.kms_provider_id as EncryptedPasswordSession['kmsProviderId'],
    kmsKeyId: row.kms_key_id,
    wrappedDataKey: Buffer.from(row.wrapped_data_key),
    rowSalt: Buffer.from(row.row_salt),
    nonce: Buffer.from(row.nonce),
    ciphertext: Buffer.from(row.ciphertext),
    authTag: Buffer.from(row.auth_tag),
  };
}

function mapRow(row: PdfPasswordSessionsTable): PasswordSessionRow {
  return {
    tenantId: row.tenant_id,
    docId: row.doc_id,
    layerName: row.layer_name,
    sub: row.sub,
    jwtJti: row.jwt_jti,
    baseSha: row.base_sha,
    securityFingerprint: row.security_fingerprint,
    openedAs: row.opened_as,
    pdfPermissionsBits: row.pdf_permissions_bits,
    pdfPermissionsAllAllowed: Boolean(row.pdf_permissions_all_allowed),
    securityHandlerRevision: row.security_handler_revision,
    activeExpiresAt: row.active_expires_at,
    renewableUntil: row.renewable_until,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
