/**
 * The demo API surface — what the dashboard's own helper server (`/api/*`)
 * speaks. Deliberately separate from the CloudPDF wire types: everything under
 * `/api` is *this demo's* admin console standing in for the customer backend
 * that would mint tokens in production. Everything under `/v1` is the real
 * product, and the browser only ever reaches it with doc-scoped tokens minted
 * here.
 */

export type DocumentState = 'pending' | 'ready' | 'failed' | 'deleting';
export type ThumbnailState = 'pending' | 'ready' | 'locked' | 'failed';

export interface DemoDocument {
  id: string;
  state: DocumentState;
  /** From upload metadata; falls back to the id when a file arrived unnamed. */
  name: string;
  sizeBytes: number | null;
  createdAt: number;
  /** WS2 warms this at commit; `locked` means the PDF needs a password. */
  thumbnailState: ThumbnailState;
  /** Count of live shares the demo has minted for this document. */
  shareCount: number;
}

/**
 * A minted doc-scoped token plus the identity it speaks for — the demo's
 * stand-in for "a row in your app's sharing table". Persisted server-side so a
 * page reload doesn't strand the viewer with a token nobody remembers issuing.
 */
export interface Share {
  id: string;
  docId: string;
  /** Display label for the person: "Alice". */
  name: string;
  /** The role preset this was created from, or 'custom'. */
  role: string;
  layerName: string;
  scope: string[];
  identity: ShareIdentity;
  token: string;
  createdAt: number;
  expiresAt: number;
}

export interface ShareIdentity {
  user_id?: string;
  group_id?: string;
  groups?: string[];
  display_name?: string;
}

export interface CreateShareInput {
  docId: string;
  name: string;
  role: string;
  layerName: string;
  scope: string[];
  identity: ShareIdentity;
  ttlSeconds: number;
  /** Reuse the live share created under this key instead of minting again. */
  idempotencyKey?: string;
}

export interface DemoConfig {
  tenantId: string;
  /** Origin of the @cloudpdf/server deployment, for display. */
  originBaseUrl: string;
  dataRoot: string;
  cdn: { kind: string; info: Record<string, unknown> };
}

export interface UploadResult {
  document: DemoDocument;
  tag: 'created' | 'deduped';
}
