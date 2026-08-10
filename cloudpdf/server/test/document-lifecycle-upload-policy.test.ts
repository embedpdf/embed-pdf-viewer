import { describe, expect, test, vi } from 'vitest';

import type { DocumentsRepo, DocumentRow } from '../src/db/repos/documents.repo';
import type { TenantsRepo } from '../src/db/repos/tenants.repo';
import { DocumentLifecycleService } from '../src/services/DocumentLifecycleService';
import type { ObjectStoreWithInfo, PresignedUpload } from '../src/storage/ObjectStore';

const doc: DocumentRow = {
  id: 'doc-policy',
  tenantId: 'tenant-policy',
  state: 'pending',
  baseSha: null,
  storageSizeBytes: null,
  expectedSha256: 'a'.repeat(64),
  expectedSizeBytes: 123,
  uploadKind: null,
  uploadExpiresAt: null,
  security: {
    encryptionState: 'unknown',
    encryptionRequiresPassword: null,
    securityHandlerRevision: null,
    pdfPermissionsBits: null,
    pdfPermissionsAllAllowed: null,
    pdfOpenedAs: null,
    securityProbedAt: null,
  },
  docVersion: 1,
  metadata: null,
  idempotencyKey: null,
  failureReason: null,
  thumbnailState: 'pending',
  thumbnailKey: null,
  createdAt: 1,
  updatedAt: 1,
  createdBy: 'test',
};

function fixture(opts: {
  presigned: PresignedUpload | null;
  policy?: 'fallback-only' | 'allowed' | 'disabled';
}) {
  const setUploadIntent = vi.fn(async (input: { kind: 'presigned' | 'proxy' }) => ({
    ...doc,
    uploadKind: input.kind,
  }));
  const documents = {
    requireOwned: vi.fn(async () => doc),
    setUploadIntent,
  } as unknown as DocumentsRepo;
  const presignUpload = vi.fn(async () => opts.presigned);
  const storage = {
    info: { kind: opts.presigned ? 's3' : 'fs' },
    presignUpload,
  } as unknown as ObjectStoreWithInfo;
  const lifecycle = new DocumentLifecycleService({
    documents,
    tenants: {} as TenantsRepo,
    storage,
    uploadProxyPolicy: opts.policy,
  });
  return { lifecycle, presignUpload, setUploadIntent };
}

const signed: PresignedUpload = {
  url: 'https://objects.example/upload',
  headers: { 'Content-Type': 'application/pdf' },
  method: 'PUT',
  expiresAt: Date.now() + 60_000,
};

describe('DocumentLifecycleService upload policy', () => {
  test('auto prefers presigned and persists that choice', async () => {
    const fx = fixture({ presigned: signed });
    const upload = await fx.lifecycle.issueUpload(
      doc.id,
      doc.tenantId,
      123,
      () => '/upload-proxy',
    );

    expect(upload.kind).toBe('presigned');
    expect(fx.setUploadIntent).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'presigned' }),
    );
  });

  test('fallback-only rejects an explicit proxy when presigning is available', async () => {
    const fx = fixture({ presigned: signed });
    await expect(
      fx.lifecycle.issueUpload(doc.id, doc.tenantId, 123, () => '/upload-proxy', {
        preference: 'proxy',
      }),
    ).rejects.toMatchObject({ code: 'InvalidArg', status: 400 });
    expect(fx.setUploadIntent).not.toHaveBeenCalled();
  });

  test('allowed permits an explicit proxy while auto still prefers presigned', async () => {
    const fx = fixture({ presigned: signed, policy: 'allowed' });
    const upload = await fx.lifecycle.issueUpload(
      doc.id,
      doc.tenantId,
      123,
      () => '/upload-proxy',
      { preference: 'proxy' },
    );

    expect(upload.kind).toBe('proxy');
    expect(fx.presignUpload).not.toHaveBeenCalled();
    expect(fx.setUploadIntent).toHaveBeenCalledWith(expect.objectContaining({ kind: 'proxy' }));
  });

  test('disabled fails closed when storage cannot presign', async () => {
    const fx = fixture({ presigned: null, policy: 'disabled' });
    await expect(
      fx.lifecycle.issueUpload(doc.id, doc.tenantId, 123, () => '/upload-proxy'),
    ).rejects.toMatchObject({ code: 'InvalidArg', status: 400 });
    expect(fx.setUploadIntent).not.toHaveBeenCalled();
  });
});
