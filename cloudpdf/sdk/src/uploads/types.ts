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

/** A source read once for its size and hash, ready to send. */
export interface PreparedUploadSource {
    size: number;
    sha256: string;
    filename: string;
    contentType: string;
    open(): Promise<BodyInit>;
    openProxyBlob(): Promise<Blob>;
}

/** Turns what the caller passed into a {@link PreparedUploadSource}. */
export type PrepareUploadSource = (source: UploadSource) => Promise<PreparedUploadSource>;

export interface UploadCreateInput {
    tenantId: string;
    source: UploadSource;
    /** Defaults to the document id. */
    name?: string;
    /** A folder id, or `root` (the default) for the top level. */
    folderId?: string;
    metadata?: Record<string, unknown>;
    idempotencyKey?: string;
    dedupMode?: DedupMode;
    docId?: string;
    uploadTtlSec?: number;
    /** `auto` prefers a presigned object-store PUT and is recommended. */
    uploadPreference?: UploadPreference;
    signal?: AbortSignal;
    /** Called with the bytes sent so far, as they go, and the file's size. */
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

/** The file's trip to object storage, with exactly the signed method and headers. */
export interface PresignedTransfer {
    method: "PUT";
    headers: Record<string, string>;
    body: BodyInit;
    /** The file's size in bytes. */
    size: number;
    signal?: AbortSignal;
    /** Called with the bytes sent so far, when the transport can tell. */
    onProgress?: (loaded: number) => void;
}

export interface UploadProtocol {
    init(request: Record<string, unknown>, options: UploadRequestOptions): Promise<unknown>;
    commit(request: Record<string, unknown>, options: UploadRequestOptions): Promise<unknown>;
    proxy(
        url: string,
        form: FormData,
        options: UploadRequestOptions & { onProgress?: (loaded: number) => void },
    ): Promise<Response>;
    presigned(url: string, transfer: PresignedTransfer): Promise<Response>;
}
