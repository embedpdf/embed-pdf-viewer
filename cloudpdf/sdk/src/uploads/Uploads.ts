import { prepareUploadSource } from "./source.js";
import type { UploadCreateInput, UploadCreateResult, UploadProtocol } from "./types.js";

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

/** High-level, integrity-pinned `init -> transfer -> commit` workflow. */
export class Uploads<Document = unknown> {
    public constructor(private readonly protocol: UploadProtocol) {}

    public async create(input: UploadCreateInput): Promise<UploadCreateResult<Document>> {
        const source = await prepareUploadSource(input.source);
        const requestOptions = { abortSignal: input.signal };
        const init = (await this.protocol.init(
            {
                tenantId: input.tenantId,
                contentLength: source.size,
                contentSha256: source.sha256,
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

        input.onProgress?.(0, source.size);
        if (init.upload.kind === "presigned") {
            const body = await source.open();
            const response = await this.protocol.presigned(init.upload.presigned.url, {
                method: init.upload.presigned.method,
                // These are the exact signed headers. In particular, no SDK
                // Authorization header is added to an object-store request.
                headers: init.upload.presigned.headers,
                body,
                signal: input.signal,
                ...(isStreamBody(body) ? ({ duplex: "half" } as Record<string, unknown>) : {}),
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
            });
            if (!response.ok) {
                const detail = await response.text().catch(() => "");
                throw new Error(`proxy upload failed: ${response.status} ${response.statusText} ${detail}`.trim());
            }
        }
        input.onProgress?.(source.size, source.size);

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

function isStreamBody(body: BodyInit): boolean {
    return typeof body === "object" && body !== null && ("pipe" in body || "getReader" in body);
}
