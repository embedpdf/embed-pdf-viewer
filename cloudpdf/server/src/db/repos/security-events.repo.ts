import type { Kysely } from 'kysely';

import type { Database as Schema } from '../schema';

/**
 * Share-grant lifecycle rides the same trail as token issuance — a
 * grant is standing authority (its id travels in the `jti` column as
 * the credential identifier of the share family). Exchange itself is
 * deliberately NOT an event kind: it is usage, metered per tenant,
 * and would drown the trail. Tenant suspension is here because it
 * gates every credential in the namespace.
 */
export type SecurityEventKind =
  | 'token.issued'
  | 'token.revoked'
  | 'share.created'
  | 'share.updated'
  | 'share.revoked'
  | 'tenant.suspended'
  | 'tenant.resumed';

export interface SecurityEventInput {
  tenantId: string;
  kind: SecurityEventKind;
  jti?: string;
  docId?: string;
  scope: ReadonlyArray<string>;
  /** Who acted: a tenant token's `sub`, or the literal `api-token`. */
  actor: string;
  via: 'api-token' | 'tenant-jwt';
  reason?: string;
  /** Epoch ms the affected token expires, when known. */
  expiresAt?: number;
}

export interface SecurityEventRow {
  id: number;
  tenantId: string;
  kind: string;
  jti: string | null;
  docId: string | null;
  scope: string[];
  actor: string;
  via: string;
  reason: string | null;
  expiresAt: number | null;
  createdAt: number;
}

/**
 * Append-only history of the auth control plane. See the 020 migration
 * header for why this is neither audit_log nor revoked_jtis. Writes
 * happen on the token issue/revoke paths; reads are operator tooling
 * and tests.
 */
export class SecurityEventsRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async append(input: SecurityEventInput): Promise<void> {
    await this.db
      .insertInto('security_events')
      .values({
        tenant_id: input.tenantId,
        kind: input.kind,
        jti: input.jti ?? null,
        doc_id: input.docId ?? null,
        scope_json: JSON.stringify(input.scope),
        actor: input.actor,
        via: input.via,
        reason: input.reason ?? null,
        expires_at: input.expiresAt ?? null,
        created_at: Date.now(),
      })
      .execute();
  }

  async listForTenant(
    tenantId: string,
    opts: { limit?: number } = {},
  ): Promise<SecurityEventRow[]> {
    let q = this.db
      .selectFrom('security_events')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('created_at', 'desc')
      .orderBy('id', 'desc');
    if (opts.limit) q = q.limit(opts.limit);
    const rows = await q.execute();
    return rows.map((r) => ({
      id: r.id,
      tenantId: r.tenant_id,
      kind: r.kind,
      jti: r.jti,
      docId: r.doc_id,
      scope: JSON.parse(r.scope_json) as string[],
      actor: r.actor,
      via: r.via,
      reason: r.reason,
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));
  }
}
