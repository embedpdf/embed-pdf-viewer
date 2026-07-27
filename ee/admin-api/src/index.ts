import { z } from 'zod';

const sha256Hex = /^[0-9a-f]{64}$/i;
const docIdPattern = /^[A-Za-z0-9_-]+$/;

export const adminWirePaths = {
  documents: '/v1/admin/documents',
  documentsInit: '/v1/admin/documents/init',
  document: (docId: string) => `/v1/admin/documents/${encodeURIComponent(docId)}`,
  documentCommit: (docId: string) => `/v1/admin/documents/${encodeURIComponent(docId)}/commit`,
  documentUploadDirect: (docId: string) =>
    `/v1/admin/documents/${encodeURIComponent(docId)}/upload-direct`,
  documentDownload: (docId: string) => `/v1/admin/documents/${encodeURIComponent(docId)}/download`,
  /** The warmed dashboard-tile artifact (WS2). 404 while `pending`/`locked`. */
  documentThumbnail: (docId: string) =>
    `/v1/admin/documents/${encodeURIComponent(docId)}/thumbnail`,
} as const;

export const DedupModeSchema = z.enum(['always-create', 'reuse-existing']);
export type DedupMode = z.infer<typeof DedupModeSchema>;

export const DocumentStateSchema = z.enum(['pending', 'ready', 'failed', 'deleting']);
export type DocumentState = z.infer<typeof DocumentStateSchema>;

export const AdminDocumentRecordSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  state: DocumentStateSchema,
  baseSha: z.string().nullable(),
  storageSizeBytes: z.number().nullable(),
  metadata: z.record(z.string(), z.unknown()).nullable(),
  idempotencyKey: z.string().nullable(),
  failureReason: z.string().nullable(),
  /** Dashboard tile lifecycle (WS2). Optional: pre-WS2 servers omit them. */
  thumbnailState: z.enum(['pending', 'ready', 'locked', 'failed']).optional(),
  thumbnailUrl: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  createdBy: z.string().nullable(),
});
export type AdminDocumentRecord = z.infer<typeof AdminDocumentRecordSchema>;

export const AdminDocumentInitRequestSchema = z.object({
  contentLength: z.number().finite().min(1),
  contentSha256: z.string().regex(sha256Hex),
  metadata: z.record(z.string(), z.unknown()).optional(),
  idempotencyKey: z.string().optional(),
  dedupMode: DedupModeSchema.optional(),
  docId: z.string().regex(docIdPattern).optional(),
  uploadTtlSec: z.number().finite().min(60).max(3600).optional(),
});
export type AdminDocumentInitRequest = z.infer<typeof AdminDocumentInitRequestSchema>;

export const AdminPresignedUploadSchema = z.object({
  url: z.string(),
  headers: z.record(z.string(), z.string()),
  method: z.literal('PUT'),
  expiresAt: z.number(),
});
export type AdminPresignedUpload = z.infer<typeof AdminPresignedUploadSchema>;

export const AdminInitUploadSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('presigned'),
    presigned: AdminPresignedUploadSchema,
    key: z.string(),
  }),
  z.object({
    kind: z.literal('direct'),
    url: z.string(),
    key: z.string(),
  }),
]);
export type AdminInitUpload = z.infer<typeof AdminInitUploadSchema>;

export const AdminDocumentInitResponseSchema = z.discriminatedUnion('tag', [
  z.object({
    tag: z.literal('created'),
    document: AdminDocumentRecordSchema,
    upload: AdminInitUploadSchema,
  }),
  z.object({
    tag: z.literal('resumed'),
    document: AdminDocumentRecordSchema,
    upload: AdminInitUploadSchema,
  }),
  z.object({
    tag: z.literal('deduped'),
    document: AdminDocumentRecordSchema,
  }),
]);
export type AdminDocumentInitResponse = z.infer<typeof AdminDocumentInitResponseSchema>;

export const AdminDocumentCommitRequestSchema = z.object({
  sha256: z.string().regex(sha256Hex),
});
export type AdminDocumentCommitRequest = z.infer<typeof AdminDocumentCommitRequestSchema>;

export const AdminDocumentCommitResponseSchema = z.object({
  document: AdminDocumentRecordSchema,
});
export type AdminDocumentCommitResponse = z.infer<typeof AdminDocumentCommitResponseSchema>;

export const AdminDocumentResponseSchema = z.object({
  document: AdminDocumentRecordSchema,
});
export type AdminDocumentResponse = z.infer<typeof AdminDocumentResponseSchema>;

export const AdminDocumentListResponseSchema = z.object({
  documents: z.array(AdminDocumentRecordSchema),
});
export type AdminDocumentListResponse = z.infer<typeof AdminDocumentListResponseSchema>;

export const AdminUploadDirectResponseSchema = z.object({
  sha256: z.string().regex(sha256Hex),
});
export type AdminUploadDirectResponse = z.infer<typeof AdminUploadDirectResponseSchema>;

export const AdminErrorPayloadSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});
export type AdminErrorPayload = z.infer<typeof AdminErrorPayloadSchema>;
