import {
  AdminTokenIssueResponseSchema,
  adminWirePaths,
  type AdminTenantScope,
} from '@cloudpdf/contract';

import { HttpClient } from '../transport/HttpClient';

export interface IssueDocTokenInput {
  /** Subject of the minted token — the end user's id in your system. */
  sub: string;
  docId: string;
  /** Doc capability scopes (`doc.open`, `doc.render`, …). */
  scope: string[];
  layerName?: string;
  userId?: string;
  displayName?: string;
  groupId?: string;
  groups?: string[];
  /** Token lifetime in seconds. */
  expiresIn: number;
}

export interface IssueTenantTokenInput {
  sub: string;
  scope: Array<AdminTenantScope | '*'>;
  /** Token lifetime in seconds. */
  expiresIn: number;
}

export interface IssuedToken {
  token: string;
  jti: string;
  /** Unix seconds. */
  expiresAt: number;
}

export interface RevokeTokenOptions {
  reason?: string;
  /** The token's `exp`, so the revocation row can be GC'd after it. */
  expiresAtSeconds?: number;
}

/**
 * `/v1/tenants/{tenantId}/tokens` — delegation. Issue exists only on
 * deployments that can sign (HS256 mode); revoke only where revocation
 * is enabled.
 */
export class TenantTokens {
  constructor(
    private readonly http: HttpClient,
    private readonly tenantId: string,
  ) {}

  /** Mint a doc-scoped viewer token. */
  async issueDoc(input: IssueDocTokenInput): Promise<IssuedToken> {
    return this.http.postJson(
      adminWirePaths.tokenIssue(this.tenantId),
      { kind: 'doc', ...input },
      (raw) => AdminTokenIssueResponseSchema.parse(raw),
    );
  }

  /**
   * Mint a tenant working credential. API-token clients only —
   * authority mints downward, so a tenant JWT cannot manufacture
   * fresh tenant authority.
   */
  async issueTenant(input: IssueTenantTokenInput): Promise<IssuedToken> {
    return this.http.postJson(
      adminWirePaths.tokenIssue(this.tenantId),
      { kind: 'tenant', ...input },
      (raw) => AdminTokenIssueResponseSchema.parse(raw),
    );
  }

  /** Revoke by jti; live sessions drop on their next heartbeat. */
  async revoke(jti: string, opts: RevokeTokenOptions = {}): Promise<void> {
    await this.http.postEmpty(adminWirePaths.tokenRevoke(this.tenantId, jti), opts);
  }
}
