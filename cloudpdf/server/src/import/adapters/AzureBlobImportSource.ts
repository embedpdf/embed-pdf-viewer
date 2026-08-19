/**
 * Azure Blob import source — reads one blob from an operator-
 * registered connection. Read-only, keyless: authority is
 * `DefaultAzureCredential` (managed identity / Workload Identity /
 * az-login), never the request. Reading needs no SAS minting, which
 * is why this adapter is far simpler than the Azure DESTINATION
 * adapter.
 *
 * `revision` maps to the blob VERSION ID (versioning must be enabled
 * on the account); snapshots are a different addressing scheme and
 * are not supported. The served version id is reported back as
 * `resolvedRevision` when the account provides one.
 *
 * Lazy-load per ADAPTERS.md.
 */
import type { Readable } from 'node:stream';

import type { AzureBlobImportConnection } from '../config/ImportConnectionSchema';
import type { ImportPolicy } from '../config/ImportPolicySchema';
import {
  ImportSourceError,
  type ImportSource,
  type ImportSourceInfo,
  type ImportSourceOpen,
} from '../ImportSource';

// Type-only — does NOT trigger the runtime import (see ADAPTERS.md).
type BlobModule = typeof import('@azure/storage-blob');
type IdentityModule = typeof import('@azure/identity');
type BlobClient = InstanceType<BlobModule['BlobClient']>;

export interface AzureBlobImportSourceOptions {
  connection: AzureBlobImportConnection;
  key: string;
  revision?: string | undefined;
  policy: ImportPolicy;
}

export class AzureBlobImportSource implements ImportSource {
  readonly info: ImportSourceInfo;
  private readonly blobPromise: Promise<BlobClient>;

  constructor(private readonly opts: AzureBlobImportSourceOptions) {
    const conn = opts.connection;
    const base = conn.endpoint ?? `https://${conn.accountName}.blob.core.windows.net`;
    this.info = {
      kind: 'azure-blob',
      location: `${base}/${conn.container}/${opts.key}`,
      connectionId: conn.id,
    };
    this.blobPromise = this.createBlobClient();
  }

  private async createBlobClient(): Promise<BlobClient> {
    const [blob, identity] = await Promise.all([
      import('@azure/storage-blob') as Promise<BlobModule>,
      import('@azure/identity') as Promise<IdentityModule>,
    ]);
    const conn = this.opts.connection;
    const base = conn.endpoint ?? `https://${conn.accountName}.blob.core.windows.net`;
    const service = new blob.BlobServiceClient(base, new identity.DefaultAzureCredential());
    let client = service.getContainerClient(conn.container).getBlobClient(this.opts.key);
    if (this.opts.revision !== undefined) client = client.withVersion(this.opts.revision);
    return client;
  }

  async open(opts: { signal: AbortSignal }): Promise<ImportSourceOpen> {
    if (opts.signal.aborted) {
      throw new ImportSourceError(
        'upstream',
        'import timed out or was aborted before contacting the source',
        true,
      );
    }
    const blob = await this.blobPromise;
    let res;
    try {
      res = await blob.download(0, undefined, { abortSignal: opts.signal });
    } catch (err) {
      throw mapAzureImportError(err, this.info.location, opts.signal);
    }
    const contentLength = res.contentLength;
    const body = res.readableStreamBody as Readable | undefined;
    if (!body || typeof contentLength !== 'number' || !Number.isFinite(contentLength)) {
      throw new ImportSourceError(
        'unsupported',
        `Azure download at ${this.info.location} returned no readable body with a declared length`,
        false,
      );
    }
    if (contentLength < 1) {
      body.destroy();
      throw new ImportSourceError(
        'unsupported',
        `source object at ${this.info.location} is empty; imports require at least one byte`,
        false,
      );
    }
    if (contentLength > this.opts.policy.maxBytes) {
      body.destroy();
      throw new ImportSourceError(
        'too_large',
        `source declares ${contentLength} bytes; this deployment caps imports at ${this.opts.policy.maxBytes}`,
        false,
      );
    }
    return {
      body,
      contentLength,
      ...(res.contentType ? { contentType: res.contentType } : {}),
      ...(res.versionId ? { resolvedRevision: res.versionId } : {}),
    };
  }
}

function mapAzureImportError(
  err: unknown,
  location: string,
  signal: AbortSignal,
): ImportSourceError {
  if (signal.aborted) {
    return new ImportSourceError(
      'upstream',
      'import timed out or was aborted while contacting the source',
      true,
    );
  }
  const e = err as { statusCode?: number; code?: string; details?: { errorCode?: string } } | null;
  const status = e?.statusCode ?? 0;
  const code = e?.code ?? e?.details?.errorCode ?? '';
  if (status === 404 || code === 'BlobNotFound' || code === 'ContainerNotFound') {
    return new ImportSourceError('not_found', `source object not found at ${location}`, false);
  }
  if (status === 401 || status === 403) {
    return new ImportSourceError(
      'denied',
      `source refused access (HTTP ${status}) at ${location}`,
      false,
    );
  }
  if (code === 'BlobArchived' || code === 'ArchiveTierNotSupported') {
    return new ImportSourceError(
      'unsupported',
      `source object at ${location} is archived and not directly readable`,
      false,
    );
  }
  if (status >= 400 && status < 500) {
    return new ImportSourceError(
      'unsupported',
      `source responded HTTP ${status} at ${location}`,
      false,
    );
  }
  return new ImportSourceError(
    'upstream',
    `could not fetch from source: ${code || 'network error'}`,
    true,
  );
}
