import {
  AdminTenantCreateResponseSchema,
  AdminTenantListResponseSchema,
  AdminTenantResponseSchema,
  adminWirePaths,
  type AdminTenantRecord,
} from '@cloudpdf/contract';

import { HttpClient } from '../transport/HttpClient';

export interface TenantCreateInput {
  id: string;
  /** Display name; defaults to the id. */
  name?: string;
}

export interface TenantCreateResult {
  tenant: AdminTenantRecord;
  /** False when the tenant already existed — create is ensure-style. */
  created: boolean;
}

export interface TenantListOptions {
  /** Page size, 1..200 (server default 100). */
  limit?: number;
  /** Opaque continuation token from a previous page's `nextCursor`. */
  cursor?: string;
}

export interface TenantListPage {
  tenants: AdminTenantRecord[];
  /** Cursor for the next page; `null` on the last page. */
  nextCursor: string | null;
}

/**
 * The `/v1/tenants` collection — tenant lifecycle. API-token only; a
 * client constructed with a tenant JWT gets 403s here.
 */
export class Tenants {
  constructor(private readonly http: HttpClient) {}

  /** Ensure-style create: `created` is false when the tenant already existed. */
  async create(input: TenantCreateInput): Promise<TenantCreateResult> {
    return this.http.postJson(adminWirePaths.tenants, input, (raw) =>
      AdminTenantCreateResponseSchema.parse(raw),
    );
  }

  async get(tenantId: string): Promise<AdminTenantRecord> {
    const response = await this.http.getJson(adminWirePaths.tenant(tenantId), (raw) =>
      AdminTenantResponseSchema.parse(raw),
    );
    return response.tenant;
  }

  /** One page of tenants, newest first. */
  async list(opts: TenantListOptions = {}): Promise<TenantListPage> {
    const params = new URLSearchParams();
    if (opts.limit !== undefined) params.set('limit', String(opts.limit));
    if (opts.cursor !== undefined) params.set('cursor', opts.cursor);
    const base = adminWirePaths.tenants;
    const path = params.size > 0 ? `${base}?${params}` : base;
    const response = await this.http.getJson(path, (raw) =>
      AdminTenantListResponseSchema.parse(raw),
    );
    return { tenants: response.tenants, nextCursor: response.nextCursor ?? null };
  }

  /** Every tenant, newest first, fetching pages as they are consumed. */
  async *iterate(opts: Omit<TenantListOptions, 'cursor'> = {}): AsyncGenerator<AdminTenantRecord> {
    let cursor: string | undefined;
    do {
      const page = await this.list({ ...opts, cursor });
      for (const tenant of page.tenants) yield tenant;
      cursor = page.nextCursor ?? undefined;
    } while (cursor !== undefined);
  }

  /** Destroys the tenant and everything in its namespace. Irreversible. */
  async delete(tenantId: string): Promise<void> {
    await this.http.deleteEmpty(adminWirePaths.tenant(tenantId));
  }
}
