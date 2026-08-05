import { Documents } from './documents/Documents';
import { HttpClient, type HttpClientOptions } from './transport/HttpClient';

export interface CloudAdminOptions extends HttpClientOptions {
  /** Reserved for future use. */
  userAgent?: string;
}

/**
 * Cloud-admin SDK root. Created with `createCloudAdmin(...)`. Hosts
 * resource sub-clients (`documents`, future: `tokens`, `bases`, ...).
 *
 * Carries a *tenant-scoped admin* credential. Never instantiate from
 * the browser — there is no leak-protected mode of operation here.
 */
export class CloudAdmin {
  readonly documents: Documents;

  private constructor(http: HttpClient) {
    this.documents = new Documents(http);
  }

  static fromOptions(opts: CloudAdminOptions): CloudAdmin {
    const http = new HttpClient(opts);
    return new CloudAdmin(http);
  }
}

export function createCloudAdmin(opts: CloudAdminOptions): CloudAdmin {
  return CloudAdmin.fromOptions(opts);
}
