import type { PrepareUploadSource, UploadCreateInput, UploadCreateResult, UploadProtocol } from "./types.js";

interface InitResponse {
    tag: "created" | "resumed" | "deduped";
    document: unknown;
    upload?:
        | {
              kind: "presigned";
              presigned: {
                  url: string;
                  headers: Record<string, string>;
                  method: "PUT";
              };
          }
        | { kind: "proxy"; url: string };
}

interface CommitResponse<Document> {
    document: Document;
}

/**
 * High-level, integrity-pinned `init -> transfer -> commit` workflow. The
 * protocol says how each step reaches CloudPDF (with an API key on a server,
 * with an upload token in a browser), and `prepare` how a source is read.
 */
export class Uploads<Document = unknown> {
    public constructor(
        private readonly protocol: UploadProtocol,
        private readonly prepare: PrepareUploadSource,
    ) {}

    public async create(input: UploadCreateInput): Promise<UploadCreateResult<Document>> {
        const source = await this.prepare(input.source);
        const requestOptions = { abortSignal: input.signal };
        const init = (await this.protocol.init(
            {
                tenantId: input.tenantId,
                contentLength: source.size,
                contentSha256: source.sha256,
                name: input.name,
                folderId: input.folderId,
                metadata: input.metadata,
                idempotencyKey: input.idempotencyKey,
                dedupMode: input.dedupMode,
                docId: input.docId,
                uploadTtlSec: input.uploadTtlSec,
                uploadPreference: input.uploadPreference,
            },
            requestOptions,
        )) as InitResponse;

        if (init.tag === "deduped") {
            input.onProgress?.(source.size, source.size);
            return { tag: init.tag, document: init.document as Document };
        }
        if (!init.upload) throw new Error("CloudPDF init response omitted upload access");

        const onProgress = input.onProgress;
        const progress = onProgress
            ? (loaded: number): void => onProgress(Math.min(loaded, source.size), source.size)
            : undefined;
        progress?.(0);
        if (init.upload.kind === "presigned") {
            const response = await this.protocol.presigned(init.upload.presigned.url, {
                method: init.upload.presigned.method,
                // These are the exact signed headers. In particular, no SDK
                // Authorization header is added to an object-store request.
                headers: init.upload.presigned.headers,
                body: await source.open(),
                size: source.size,
                signal: input.signal,
                onProgress: progress,
            });
            if (!response.ok) {
                const detail = await response.text().catch(() => "");
                throw new Error(`presigned upload failed: ${response.status} ${response.statusText} ${detail}`.trim());
            }
        } else {
            const form = new FormData();
            form.append("file", await source.openProxyBlob(), source.filename);
            const response = await this.protocol.proxy(init.upload.url, form, {
                abortSignal: input.signal,
                maxRetries: 0,
                onProgress: progress,
            });
            if (!response.ok) {
                const detail = await response.text().catch(() => "");
                throw new Error(`proxy upload failed: ${response.status} ${response.statusText} ${detail}`.trim());
            }
        }
        progress?.(source.size);

        const committed = (await this.protocol.commit(
            {
                tenantId: input.tenantId,
                id: (init.document as { id: string }).id,
                sha256: source.sha256,
            },
            requestOptions,
        )) as CommitResponse<Document>;
        return { tag: init.tag, document: committed.document };
    }
}
