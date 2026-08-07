export type {
  DedupMode,
  AdminDocumentRecord as DocumentRecord,
  DocumentState,
  AdminDocumentInitResponse as InitResponse,
  AdminInitUpload as InitResponseUpload,
  AdminDocumentCommitResponse as CommitResponse,
  AdminDocumentListResponse as ListResponse,
  AdminDocumentResponse as DocumentResponse,
  AdminErrorPayload,
} from '@cloudpdf/contract';

export type InitResponseCreatedOrResumed = Extract<
  import('@cloudpdf/contract').AdminDocumentInitResponse,
  { tag: 'created' | 'resumed' }
>;

export type InitResponseDeduped = Extract<
  import('@cloudpdf/contract').AdminDocumentInitResponse,
  { tag: 'deduped' }
>;
