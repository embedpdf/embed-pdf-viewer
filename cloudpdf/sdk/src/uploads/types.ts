export type UploadPreference = "auto" | "presigned" | "proxy";
export type DedupMode = "always-create" | "reuse-existing";

/**
 * A source that can be opened again after its hash is known. This is the
 * escape hatch for streams: init needs the final SHA before transfer starts,
 * so a one-shot unknown stream cannot implement the protocol safely.
 */
export interface ReopenableUploadSource {
    size: number;
    sha256: string;
    filename?: string;
    contentType?: string;
    open(): BodyInit | Promise<BodyInit>;
    /** Required only if the server selects the multipart proxy fallback. */
    openProxyBlob?(): Blob | Promise<Blob>;
}

export type UploadSource = Uint8Array | ArrayBuffer | Blob | { path: string } | ReopenableUploadSource;

export interface UploadCreateInput {
    tenantId: string;
    source: UploadSource;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
    dedupMode?: DedupMode;
    docId?: string;
    uploadTtlSec?: number;
    /** `auto` prefers a presigned object-store PUT and is recommended. */
    uploadPreference?: UploadPreference;
    signal?: AbortSignal;
    onProgress?: (loaded: number, total: number) => void;
}

export interface UploadCreateResult<Document = unknown> {
    tag: "created" | "resumed" | "deduped";
    document: Document;
}

export interface UploadRequestOptions {
    abortSignal?: AbortSignal;
    maxRetries?: number;
}

export interface UploadProtocol {
    init(request: Record<string, unknown>, options: UploadRequestOptions): Promise<unknown>;
    commit(request: Record<string, unknown>, options: UploadRequestOptions): Promise<unknown>;
    proxy(url: string, form: FormData, options: UploadRequestOptions): Promise<Response>;
    presigned(url: string, init: RequestInit): Promise<Response>;
}
