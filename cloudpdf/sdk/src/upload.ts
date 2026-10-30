/**
 * `@cloudpdf/sdk/upload`: a browser uploads a PDF straight to CloudPDF with
 * an upload token from your server (`tokens.issue` with kind `upload`). It
 * imports nothing from Node and nothing of the generated client, so a page
 * loads only this.
 */
import type * as CloudPDF from "./api/index.js";
import { CloudPDFEnvironment } from "./environments.js";
import { isBlobSource, prepareBlobSource } from "./uploads/blob-source.js";
import type {
    PreparedUploadSource,
    PresignedTransfer,
    UploadProtocol,
    UploadRequestOptions,
    UploadSource,
} from "./uploads/types.js";
import { Uploads } from "./uploads/Uploads.js";

export interface UploadOptions {
    /** The upload token from your server. */
    token: string;
    /** What the dashboard shows. Defaults to the file's name. */
    name?: string;
    /** Called with the bytes sent so far, as they go, and the file's size. */
    onProgress?: (loaded: number, total: number) => void;
    /** Stops the upload. */
    signal?: AbortSignal;
    /** Your own CloudPDF server. Defaults to CloudPDF SaaS. */
    baseUrl?: string;
}

export interface UploadResult {
    tag: "created" | "resumed" | "deduped";
    document: CloudPDF.DocumentsCommit200Response.Document;
}

/** An upload CloudPDF refused: `status` is the HTTP status, `code` CloudPDF's error code. */
export class UploadError extends Error {
    public readonly status: number;
    public readonly code: string | undefined;

    public constructor(status: number, message: string, code?: string) {
        super(message);
        this.name = "UploadError";
        this.status = status;
        this.code = code;
    }
}

/** Uploads a PDF from the browser with an upload token, and returns the document. */
export async function upload(file: Blob, options: UploadOptions): Promise<UploadResult> {
    const baseUrl = (options.baseUrl ?? CloudPDFEnvironment.Saas).replace(/\/+$/, "");
    const uploads = new Uploads<CloudPDF.DocumentsCommit200Response.Document>(
        tokenProtocol(baseUrl, options.token),
        prepareInBrowser,
    );
    return uploads.create({
        tenantId: tenantOf(options.token),
        source: file,
        name: options.name ?? nameOf(file),
        signal: options.signal,
        onProgress: options.onProgress,
    });
}

/** The three steps over HTTP, each carrying the upload token. */
function tokenProtocol(baseUrl: string, token: string): UploadProtocol {
    const tenantPath = (tenantId: unknown): string =>
        `${baseUrl}/v1/tenants/${encodeURIComponent(String(tenantId))}/documents`;
    const authorization = { Authorization: `Bearer ${token}` };
    return {
        init: async ({ tenantId, ...body }, options): Promise<unknown> =>
            json(`${tenantPath(tenantId)}/init`, authorization, body, options),
        commit: async ({ tenantId, id, ...body }, options): Promise<unknown> =>
            json(`${tenantPath(tenantId)}/${encodeURIComponent(String(id))}/commit`, authorization, body, options),
        proxy: async (url, form, options): Promise<Response> =>
            send(`${baseUrl}${url}`, {
                method: "POST",
                headers: authorization,
                body: form,
                signal: options.abortSignal,
                onProgress: options.onProgress,
            }),
        presigned: async (url, transfer): Promise<Response> => send(url, transfer),
    };
}

async function json(
    url: string,
    headers: Record<string, string>,
    body: Record<string, unknown>,
    options: UploadRequestOptions,
): Promise<unknown> {
    const response = await fetch(url, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(withoutUndefined(body)),
        signal: options.abortSignal,
    });
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) throw uploadErrorOf(response.status, payload);
    return payload;
}

/**
 * Sends the file with XHR, which reports upload progress; `fetch` can't.
 * Without XHR (a worker, a test), `fetch` sends it and progress jumps from
 * start to end.
 */
function send(
    url: string,
    transfer: Pick<PresignedTransfer, "headers" | "body" | "signal" | "onProgress"> & { method: string },
): Promise<Response> {
    if (typeof XMLHttpRequest === "undefined") {
        return fetch(url, {
            method: transfer.method,
            headers: transfer.headers,
            body: transfer.body,
            signal: transfer.signal,
        });
    }
    return new Promise<Response>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const abort = (): void => xhr.abort();
        if (transfer.signal?.aborted) {
            reject(abortError());
            return;
        }
        transfer.signal?.addEventListener("abort", abort, { once: true });
        const settle = (): void => transfer.signal?.removeEventListener("abort", abort);

        xhr.open(transfer.method, url);
        for (const [name, value] of Object.entries(transfer.headers)) {
            // The browser sets Content-Length itself, from the file, and
            // refuses a page that tries.
            if (name.toLowerCase() !== "content-length") xhr.setRequestHeader(name, value);
        }
        const onProgress = transfer.onProgress;
        if (onProgress) xhr.upload.onprogress = (event): void => onProgress(event.loaded);
        xhr.onload = (): void => {
            settle();
            const empty = xhr.status === 204 || xhr.status === 205 || xhr.status === 304;
            resolve(new Response(empty ? null : xhr.responseText, { status: xhr.status, statusText: xhr.statusText }));
        };
        xhr.onerror = (): void => {
            settle();
            reject(new TypeError(`upload to ${new URL(url).host} failed: network error`));
        };
        xhr.onabort = (): void => {
            settle();
            reject(abortError());
        };
        xhr.send(transfer.body as XMLHttpRequestBodyInit);
    });
}

async function prepareInBrowser(source: UploadSource): Promise<PreparedUploadSource> {
    if (!isBlobSource(source)) throw new Error("upload() takes a File or a Blob");
    return prepareBlobSource(source);
}

/**
 * The tenant the token belongs to, read from its payload to build the URL.
 * CloudPDF checks the token itself; this only routes the request.
 */
function tenantOf(token: string): string {
    const payload = token.split(".")[1];
    let claims: { tenant_id?: unknown; upload?: unknown } | undefined;
    try {
        const base64 = (payload ?? "").replace(/-/g, "+").replace(/_/g, "/");
        const bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
        claims = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        claims = undefined;
    }
    if (!claims || typeof claims.tenant_id !== "string" || typeof claims.upload !== "object") {
        throw new Error("upload(): `token` must be an upload token (tokens.issue with kind 'upload')");
    }
    return claims.tenant_id;
}

function nameOf(file: Blob): string | undefined {
    const name = (file as { name?: unknown }).name;
    return typeof name === "string" && name.length > 0 ? name : undefined;
}

function uploadErrorOf(status: number, payload: unknown): UploadError {
    const error = (payload as { error?: unknown } | undefined)?.error;
    if (typeof error === "string") return new UploadError(status, error);
    const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
    return new UploadError(
        status,
        typeof message === "string" ? message : `CloudPDF answered ${status}`,
        typeof code === "string" ? code : undefined,
    );
}

function abortError(): Error {
    return typeof DOMException === "function"
        ? new DOMException("The upload was stopped", "AbortError")
        : Object.assign(new Error("The upload was stopped"), { name: "AbortError" });
}

function withoutUndefined(body: Record<string, unknown>): Record<string, unknown> {
    return Object.fromEntries(Object.entries(body).filter(([, value]) => value !== undefined));
}
