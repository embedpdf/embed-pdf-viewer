import { createHmac } from 'node:crypto';
import type { Kysely } from 'kysely';
import type { Database as Schema, DocumentPdfOpenedAs } from '../schema';

export interface PasswordVerificationFacts {
  openedAs: DocumentPdfOpenedAs;
  pdfPermissionsBits: number;
  pdfPermissionsAllAllowed: boolean;
  securityHandlerRevision: number | null;
}

export interface PasswordVerificationRow extends PasswordVerificationFacts {
  tenantId: string;
  docId: string;
  baseSha: string;
  securityFingerprint: string;
  hmacKeyId: string;
  verifiedAt: number;
  expiresAt: number;
}

export interface PasswordProofInput {
  tenantId: string;
  docId: string;
  baseSha: string;
  securityFingerprint: string;
  password: string;
}

export class PdfPasswordVerificationsRepo {
  constructor(
    private readonly db: Kysely<Schema>,
    private readonly opts: {
      hmacSecret: string;
      hmacKeyId?: string;
      ttlMs?: number;
    },
  ) {}

  async findValid(
    input: PasswordProofInput,
    now = Date.now(),
  ): Promise<PasswordVerificationRow | null> {
    const proof = this.passwordProof(input);
    const row = await this.db
      .selectFrom('pdf_password_verifications')
      .selectAll()
      .where('tenant_id', '=', input.tenantId)
      .where('doc_id', '=', input.docId)
      .where('base_sha', '=', input.baseSha)
      .where('security_fingerprint', '=', input.securityFingerprint)
      .where('password_proof', '=', proof)
      .where('hmac_key_id', '=', this.hmacKeyId())
      .where('expires_at', '>', now)
      .executeTakeFirst();
    return row
      ? {
          tenantId: row.tenant_id,
          docId: row.doc_id,
          baseSha: row.base_sha,
          securityFingerprint: row.security_fingerprint,
          hmacKeyId: row.hmac_key_id,
          openedAs: row.opened_as,
          pdfPermissionsBits: row.pdf_permissions_bits,
          pdfPermissionsAllAllowed: Boolean(row.pdf_permissions_all_allowed),
          securityHandlerRevision: row.security_handler_revision,
          verifiedAt: row.verified_at,
          expiresAt: row.expires_at,
        }
      : null;
  }

  /**
   * Distinct `opened_as` values among the non-expired verifications for a
   * document (selected by doc, not by password). Used to decide whether
   * both the user and owner passwords are already known — in which case a
   * cache-miss password is provably wrong and can be rejected without the
   * worker. Mirrors {@link findValid}'s expiry / hmac-key filters.
   */
  async knownOpenedAs(
    input: {
      tenantId: string;
      docId: string;
      baseSha: string;
      securityFingerprint: string;
    },
    now = Date.now(),
  ): Promise<Set<DocumentPdfOpenedAs>> {
    const rows = await this.db
      .selectFrom('pdf_password_verifications')
      .select('opened_as')
      .distinct()
      .where('tenant_id', '=', input.tenantId)
      .where('doc_id', '=', input.docId)
      .where('base_sha', '=', input.baseSha)
      .where('security_fingerprint', '=', input.securityFingerprint)
      .where('hmac_key_id', '=', this.hmacKeyId())
      .where('expires_at', '>', now)
      .execute();
    return new Set(rows.map((r) => r.opened_as));
  }

  async upsert(
    input: PasswordProofInput,
    facts: PasswordVerificationFacts,
  ): Promise<PasswordVerificationRow> {
    const now = Date.now();
    const expiresAt = now + (this.opts.ttlMs ?? 24 * 60 * 60 * 1000);
    const row = {
      tenant_id: input.tenantId,
      doc_id: input.docId,
      base_sha: input.baseSha,
      security_fingerprint: input.securityFingerprint,
      password_proof: this.passwordProof(input),
      hmac_key_id: this.hmacKeyId(),
      opened_as: facts.openedAs,
      pdf_permissions_bits: facts.pdfPermissionsBits,
      pdf_permissions_all_allowed: facts.pdfPermissionsAllAllowed ? 1 : 0,
      security_handler_revision: facts.securityHandlerRevision,
      verified_at: now,
      expires_at: expiresAt,
    };

    await this.db
      .insertInto('pdf_password_verifications')
      .values(row)
      .onConflict((oc) =>
        oc
          .columns(['tenant_id', 'doc_id', 'base_sha', 'security_fingerprint', 'password_proof'])
          .doUpdateSet({
            hmac_key_id: row.hmac_key_id,
            opened_as: row.opened_as,
            pdf_permissions_bits: row.pdf_permissions_bits,
            pdf_permissions_all_allowed: row.pdf_permissions_all_allowed,
            security_handler_revision: row.security_handler_revision,
            verified_at: row.verified_at,
            expires_at: row.expires_at,
          }),
      )
      .execute();

    return {
      tenantId: input.tenantId,
      docId: input.docId,
      baseSha: input.baseSha,
      securityFingerprint: input.securityFingerprint,
      hmacKeyId: row.hmac_key_id,
      openedAs: facts.openedAs,
      pdfPermissionsBits: facts.pdfPermissionsBits,
      pdfPermissionsAllAllowed: facts.pdfPermissionsAllAllowed,
      securityHandlerRevision: facts.securityHandlerRevision,
      verifiedAt: now,
      expiresAt,
    };
  }

  private passwordProof(input: PasswordProofInput): string {
    return createHmac('sha256', this.opts.hmacSecret)
      .update(input.tenantId)
      .update('\0')
      .update(input.docId)
      .update('\0')
      .update(input.baseSha)
      .update('\0')
      .update(input.securityFingerprint)
      .update('\0')
      .update(input.password)
      .digest('hex');
  }

  private hmacKeyId(): string {
    return this.opts.hmacKeyId ?? 'epdf-check-password-permissions-v3';
  }
}
