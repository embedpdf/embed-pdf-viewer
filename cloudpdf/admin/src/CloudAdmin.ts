import { Documents } from './documents/Documents';
import { Tenants } from './tenants/Tenants';
import { HttpClient, type HttpClientOptions } from './transport/HttpClient';

export interface CloudAdminOptions extends HttpClientOptions {
  /** Reserved for future use. */
  userAgent?: string;
}

/**
 * A tenant-scoped view of the deployment: every call is addressed
 * under `/v1/tenants/{tenantId}/…`. With an API token the client may
 * open any tenant; with a tenant JWT the server enforces that the
 * path tenant equals the token's tenant.
 */
export class TenantClient {
  readonly documents: Documents;

  constructor(
    http: HttpClient,
    readonly tenantId: string,
  ) {
    this.documents = new Documents(http, tenantId);
  }
}

/**
 * Cloud-admin SDK root. Created with `createCloudAdmin(...)` holding
 * exactly one credential:
 *
 *   - `apiToken` — the deployment's root credential, valid everywhere.
 *   - `tenantToken` — a delegated tenant JWT, valid only under its own
 *     tenant subtree.
 *
 * `tenant(id)` returns the tenant-scoped client; future sub-clients
 * (`tenants` CRUD, `deployment`) mount here as the surfaces land.
 *
 * Never instantiate from the browser — there is no leak-protected
 * mode of operation here.
 */
export class CloudAdmin {
  /** The /v1/tenants collection — lifecycle, API-token only. */
  readonly tenants: Tenants;

  private readonly http: HttpClient;

  private constructor(http: HttpClient) {
    this.http = http;
    this.tenants = new Tenants(http);
  }

  /** Tenant-scoped view. Synchronous — pure URL addressing, no minting. */
  tenant(tenantId: string): TenantClient {
    return new TenantClient(this.http, tenantId);
  }

  static fromOptions(opts: CloudAdminOptions): CloudAdmin {
    const http = new HttpClient(opts);
    return new CloudAdmin(http);
  }
}

export function createCloudAdmin(opts: CloudAdminOptions): CloudAdmin {
  return CloudAdmin.fromOptions(opts);
}
