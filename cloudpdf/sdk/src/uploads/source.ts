import type { ReopenableUploadSource, UploadSource } from "./types.js";

export interface PreparedUploadSource {
    size: number;
    sha256: string;
    filename: string;
    contentType: string;
    open(): Promise<BodyInit>;
    openProxyBlob(): Promise<Blob>;
}

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

    const blob = toBlob(source);
    return {
        size: blob.size,
        sha256: await sha256Bytes(new Uint8Array(await blob.arrayBuffer())),
        filename: "document.pdf",
        contentType: blob.type || "application/pdf",
        open: async (): Promise<BodyInit> => blob,
        openProxyBlob: async (): Promise<Blob> => blob,
    };
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

async function sha256Bytes(bytes: Uint8Array): Promise<string> {
    if (globalThis.crypto?.subtle) {
        const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
        return hex(new Uint8Array(digest));
    }
    const { createHash } = await import("node:crypto");
    return createHash("sha256").update(bytes).digest("hex");
}

function toBlob(source: Uint8Array | ArrayBuffer | Blob): Blob {
    if (source instanceof Blob) return source;
    const bytes = source instanceof Uint8Array ? new Uint8Array(source) : new Uint8Array(source.slice(0));
    return new Blob([bytes], { type: "application/pdf" });
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

function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
