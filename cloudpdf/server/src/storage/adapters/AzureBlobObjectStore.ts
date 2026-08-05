/**
 * Azure Blob Storage object store.
 *
 * Auth: keyless-first. With no account key configured, data-plane ops
 * authenticate via `DefaultAzureCredential` (managed identity /
 * Workload Identity on Azure; `az login` / env locally), and presigned
 * URLs are **user-delegation SAS** — the adapter requests a short-lived
 * delegation key from Entra ID (`getUserDelegationKey`) and signs the
 * SAS with it. No account key lives anywhere.
 *
 * Keyed fallback: when `accountKey` is supplied (a SecretRef in prod,
 * resolved to a literal by `createObjectStore` before construction),
 * the adapter uses a `StorageSharedKeyCredential` for both data-plane
 * and account-key SAS. For environments that can't grant the AAD
 * data-plane role or run outside Azure.
 *
 * Presigned PUT: the client must send `x-ms-blob-type: BlockBlob`
 * (declared in the returned `headers`), which is how Azure's one-shot
 * Put Blob works. Single-PUT ceiling is ~4.7 GiB — beyond that the
 * upload falls to the through-origin `direct` flow.
 *
 * SHA-256: Azure stores Content-MD5, not sha256, so — like S3/GCS —
 * we compute sha256 on `put` and stash it in blob metadata. Azure
 * metadata names must be valid identifiers (no hyphens), so the key
 * is `xembedpdfsha256` here; that wire spelling is adapter-private.
 *
 * Lazy-load: `@azure/storage-blob` + `@azure/identity` import on first
 * use via `clientPromise`, never at module load (optionalDependencies).
 */

import { Readable } from 'node:stream';
import type {
  MaterializeOpts,
  MaterializeResult,
  ObjectBody,
  ObjectStat,
  ObjectStore,
  PresignedDownload,
  PresignedUpload,
  PresignUploadOpts,
} from '../ObjectStore';
import {
  computeSha256Hex,
  drainReadable,
  materializeViaRanges,
  streamingSha256,
} from './_internal';

// Type-only — does NOT trigger the runtime import (see ADAPTERS.md).
type BlobModule = typeof import('@azure/storage-blob');
type IdentityModule = typeof import('@azure/identity');
type ContainerClient = InstanceType<BlobModule['ContainerClient']>;
type BlobServiceClient = InstanceType<BlobModule['BlobServiceClient']>;
type StorageSharedKeyCredential = InstanceType<BlobModule['StorageSharedKeyCredential']>;
type UserDelegationKey = Awaited<ReturnType<BlobServiceClient['getUserDelegationKey']>>;

/** Azure blob metadata key (no hyphens allowed — must be a valid identifier). */
const AZURE_SHA256_METADATA_KEY = 'xembedpdfsha256';

export interface AzureBlobObjectStoreOptions {
  /** Required: container name. */
  container: string;
  /** Required: storage account name (e.g. `embedpdfprod`). */
  accountName: string;
  /** Optional custom endpoint; defaults to `https://<account>.blob.core.windows.net`. */
  endpoint?: string;
  /**
   * Optional account key (already resolved from a SecretRef by the
   * factory). Present → account-key SAS; absent → keyless
   * user-delegation SAS via DefaultAzureCredential.
   */
  accountKey?: string;
}

interface AzureClient {
  service: BlobServiceClient;
  container: ContainerClient;
  sharedKey: StorageSharedKeyCredential | null;
  sas: {
    generate: BlobModule['generateBlobSASQueryParameters'];
    BlobSASPermissions: BlobModule['BlobSASPermissions'];
    SASProtocol: BlobModule['SASProtocol'];
  };
}

export class AzureBlobObjectStore implements ObjectStore {
  readonly info: {
    kind: 'azure-blob';
    location: string;
    container: string;
    accountName: string;
    auth: 'account-key' | 'managed-identity';
  };
  private readonly opts: AzureBlobObjectStoreOptions;
  private readonly clientPromise: Promise<AzureClient>;
  /** Cached user-delegation key (keyless SAS). Refreshed before expiry. */
  private delegationKey: { key: UserDelegationKey; expiresOn: number } | null = null;

  constructor(opts: AzureBlobObjectStoreOptions) {
    if (!opts.container) throw new Error('AzureBlobObjectStore requires container');
    if (!opts.accountName) throw new Error('AzureBlobObjectStore requires accountName');
    this.opts = opts;
    const base = opts.endpoint ?? `https://${opts.accountName}.blob.core.windows.net`;
    this.info = {
      kind: 'azure-blob',
      location: `${base}/${opts.container}`,
      container: opts.container,
      accountName: opts.accountName,
      auth: opts.accountKey ? 'account-key' : 'managed-identity',
    };
    this.clientPromise = this.createClient();
  }

  private async createClient(): Promise<AzureClient> {
    const blob = (await import('@azure/storage-blob')) as BlobModule;
    const base = this.opts.endpoint ?? `https://${this.opts.accountName}.blob.core.windows.net`;

    let service: BlobServiceClient;
    let sharedKey: StorageSharedKeyCredential | null = null;
    if (this.opts.accountKey) {
      sharedKey = new blob.StorageSharedKeyCredential(this.opts.accountName, this.opts.accountKey);
      service = new blob.BlobServiceClient(base, sharedKey);
    } else {
      const identity = (await import('@azure/identity')) as IdentityModule;
      service = new blob.BlobServiceClient(base, new identity.DefaultAzureCredential());
    }
    return {
      service,
      container: service.getContainerClient(this.opts.container),
      sharedKey,
      sas: {
        generate: blob.generateBlobSASQueryParameters,
        BlobSASPermissions: blob.BlobSASPermissions,
        SASProtocol: blob.SASProtocol,
      },
    };
  }

  async exists(key: string): Promise<boolean> {
    const { container } = await this.clientPromise;
    return container.getBlockBlobClient(key).exists();
  }

  async stat(key: string): Promise<ObjectStat | null> {
    const { container } = await this.clientPromise;
    try {
      const props = await container.getBlockBlobClient(key).getProperties();
      return {
        size: props.contentLength ?? 0,
        etag: (props.etag ?? '').replace(/"/g, ''),
      };
    } catch (err) {
      if (isAzureNotFound(err)) return null;
      throw err;
    }
  }

  async put(
    key: string,
    body: ObjectBody,
    opts: { contentLength: number; contentType?: string },
  ): Promise<{ sha256: string }> {
    const bytes = body instanceof Uint8Array ? body : await drainReadable(body as Readable);
    if (bytes.byteLength !== opts.contentLength) {
      throw new Error(
        `AzureBlobObjectStore.put: declared contentLength=${opts.contentLength} but got ${bytes.byteLength}`,
      );
    }
    const sha256 = computeSha256Hex(bytes);
    const { container } = await this.clientPromise;
    const buf = Buffer.from(bytes);
    await container.getBlockBlobClient(key).upload(buf, buf.byteLength, {
      blobHTTPHeaders: { blobContentType: opts.contentType ?? 'application/pdf' },
      metadata: { [AZURE_SHA256_METADATA_KEY]: sha256 },
    });
    return { sha256 };
  }

  async get(key: string): Promise<Uint8Array | null> {
    const { container } = await this.clientPromise;
    try {
      const buf = await container.getBlockBlobClient(key).downloadToBuffer();
      return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    } catch (err) {
      if (isAzureNotFound(err)) return null;
      throw err;
    }
  }

  async getSha256(key: string): Promise<string | null> {
    const { container } = await this.clientPromise;
    const blob = container.getBlockBlobClient(key);
    try {
      const props = await blob.getProperties();
      const fromMeta = props.metadata?.[AZURE_SHA256_METADATA_KEY];
      if (fromMeta) return fromMeta;
      const dl = await blob.download();
      return await streamingSha256(dl.readableStreamBody as Readable);
    } catch (err) {
      if (isAzureNotFound(err)) return null;
      throw err;
    }
  }

  async presignUpload(
    key: string,
    ttlSec: number,
    opts: PresignUploadOpts,
  ): Promise<PresignedUpload | null> {
    const { url, expiresAt } = await this.signedUrl(key, ttlSec, 'w');
    return {
      url,
      method: 'PUT',
      headers: {
        // Azure one-shot Put Blob requires the blob-type header.
        'x-ms-blob-type': 'BlockBlob',
        'Content-Type': opts.contentType,
        'Content-Length': String(opts.contentLength),
        ...(opts.contentMd5Base64 ? { 'Content-MD5': opts.contentMd5Base64 } : {}),
      },
      expiresAt,
    };
  }

  async presignDownload(key: string, ttlSec: number): Promise<PresignedDownload | null> {
    const { url, expiresAt } = await this.signedUrl(key, ttlSec, 'r');
    return { url, expiresAt };
  }

  async delete(key: string): Promise<boolean> {
    const { container } = await this.clientPromise;
    const r = await container.getBlockBlobClient(key).deleteIfExists();
    return r.succeeded;
  }

  async materializeLocal(
    key: string,
    destPath: string,
    opts: MaterializeOpts,
  ): Promise<MaterializeResult> {
    const { container } = await this.clientPromise;
    const blob = container.getBlockBlobClient(key);
    const props = await blob.getProperties();
    const size = props.contentLength ?? 0;
    const knownSha256 = props.metadata?.[AZURE_SHA256_METADATA_KEY] ?? null;

    return materializeViaRanges(
      destPath,
      {
        size,
        knownSha256,
        // Azure download(offset, count): count is the byte length, so
        // [start, end] inclusive → count = end - start + 1.
        fetchRange: async (start, end) => {
          const dl = await blob.download(start, end - start + 1);
          return dl.readableStreamBody as Readable;
        },
      },
      opts,
      'AzureBlobObjectStore',
    );
  }

  async deletePrefix(prefix: string): Promise<{ deleted: number }> {
    const { container } = await this.clientPromise;
    let deleted = 0;
    // listBlobsFlat is an async iterator; delete as we go. Azure has no
    // bulk-delete-by-prefix, so this is one DELETE per blob.
    for await (const item of container.listBlobsFlat({ prefix })) {
      const r = await container.getBlockBlobClient(item.name).deleteIfExists();
      if (r.succeeded) deleted++;
    }
    return { deleted };
  }

  /**
   * Mint a SAS-signed URL for `key`. Account-key SAS when a key is
   * configured; otherwise keyless user-delegation SAS.
   */
  private async signedUrl(
    key: string,
    ttlSec: number,
    permission: 'r' | 'w',
  ): Promise<{ url: string; expiresAt: number }> {
    const client = await this.clientPromise;
    const blob = client.container.getBlockBlobClient(key);
    // 5-minute backdate absorbs client/server clock skew.
    const startsOn = new Date(Date.now() - 5 * 60 * 1000);
    const expiresOn = new Date(Date.now() + ttlSec * 1000);
    const permissions = client.sas.BlobSASPermissions.parse(permission);
    const common = {
      containerName: this.opts.container,
      blobName: key,
      permissions,
      startsOn,
      expiresOn,
      protocol: client.sas.SASProtocol.Https,
    };

    let sas: string;
    if (client.sharedKey) {
      sas = client.sas.generate(common, client.sharedKey).toString();
    } else {
      const udk = await this.userDelegationKey(client, expiresOn);
      sas = client.sas.generate(common, udk, this.opts.accountName).toString();
    }
    return { url: `${blob.url}?${sas}`, expiresAt: expiresOn.getTime() };
  }

  /**
   * Cached user-delegation key. The key itself is an AAD round-trip
   * (and capped at 7 days), so we cache it and refresh once we're
   * within 5 minutes of the cached key's expiry or it can't cover the
   * requested SAS lifetime.
   */
  private async userDelegationKey(
    client: AzureClient,
    sasExpiresOn: Date,
  ): Promise<UserDelegationKey> {
    const now = Date.now();
    const needsRefresh =
      !this.delegationKey ||
      this.delegationKey.expiresOn - 5 * 60 * 1000 < now ||
      this.delegationKey.expiresOn < sasExpiresOn.getTime();
    if (needsRefresh) {
      // Request a key that comfortably outlives this SAS, capped at
      // Azure's 7-day ceiling.
      const keyStart = new Date(now - 5 * 60 * 1000);
      const sevenDays = now + 7 * 24 * 60 * 60 * 1000;
      const keyExpiry = new Date(Math.min(sevenDays, sasExpiresOn.getTime() + 60 * 60 * 1000));
      const key = await client.service.getUserDelegationKey(keyStart, keyExpiry);
      this.delegationKey = { key, expiresOn: keyExpiry.getTime() };
    }
    return this.delegationKey!.key;
  }
}

function isAzureNotFound(err: unknown): boolean {
  const e = err as { statusCode?: number; code?: string; details?: { errorCode?: string } } | null;
  if (!e) return false;
  if (e.statusCode === 404) return true;
  if (e.code === 'BlobNotFound' || e.code === 'ContainerNotFound') return true;
  if (e.details?.errorCode === 'BlobNotFound') return true;
  return false;
}
