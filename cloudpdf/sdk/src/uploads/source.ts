import { hex, isBlobSource, prepareBlobSource } from "./blob-source.js";
import type { PreparedUploadSource, ReopenableUploadSource, UploadSource } from "./types.js";

/** Every source `uploads.create` takes, on a server: bytes, Blobs, files on disk and reopenable streams. */
export async function prepareUploadSource(source: UploadSource): Promise<PreparedUploadSource> {
    if (isReopenable(source)) {
        return {
            size: source.size,
            sha256: normalizeSha(source.sha256),
            filename: source.filename ?? "document.pdf",
            contentType: source.contentType ?? "application/pdf",
            open: async (): Promise<BodyInit> => source.open(),
            openProxyBlob: async (): Promise<Blob> => {
                if (!source.openProxyBlob) {
                    throw new Error(
                        "the server selected proxy upload, but this reopenable source does not provide openProxyBlob()",
                    );
                }
                return source.openProxyBlob();
            },
        };
    }

    if (isPathSource(source)) return preparePath(source.path);

    if (isBlobSource(source)) return prepareBlobSource(source, sha256Bytes);
    throw new Error("upload source must be bytes, a Blob, { path } or a reopenable source");
}

async function preparePath(path: string): Promise<PreparedUploadSource> {
    const [{ createReadStream }, { readFile, stat }, { createHash }] = await Promise.all([
        import("node:fs"),
        import("node:fs/promises"),
        import("node:crypto"),
    ]);
    const info = await stat(path);
    if (!info.isFile()) throw new Error(`upload source is not a file: ${path}`);

    const hash = createHash("sha256");
    for await (const chunk of createReadStream(path)) hash.update(chunk);

    return {
        size: info.size,
        sha256: hash.digest("hex"),
        filename: path.split(/[\\/]/).pop() || "document.pdf",
        contentType: "application/pdf",
        open: async (): Promise<BodyInit> => createReadStream(path) as unknown as BodyInit,
        // The proxy route is deliberately bounded. Presigned mode remains
        // streaming; the uncommon filesystem fallback materializes one Blob.
        openProxyBlob: async (): Promise<Blob> =>
            new Blob([new Uint8Array(await readFile(path))], { type: "application/pdf" }),
    };
}

/** Web Crypto where there is one; Node 18 has no global `crypto`, so `node:crypto` there. */
async function sha256Bytes(bytes: Uint8Array): Promise<string> {
    if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
        return hex(new Uint8Array(digest));
    }
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(bytes).digest("hex");
}

function isPathSource(source: UploadSource): source is { path: string } {
    return typeof source === "object" && source !== null && "path" in source;
}

function isReopenable(source: UploadSource): source is ReopenableUploadSource {
    return typeof source === "object" && source !== null && "open" in source && "size" in source && "sha256" in source;
}

function normalizeSha(value: string): string {
    const normalized = value.toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(normalized)) {
        throw new Error("reopenable upload source sha256 must be 64 lowercase or uppercase hex characters");
    }
    return normalized;
}
