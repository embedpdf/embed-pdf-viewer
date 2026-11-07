import type { PreparedUploadSource } from "./types.js";

/** Hashes bytes to lowercase hex SHA-256. */
export type Sha256 = (bytes: Uint8Array) => Promise<string>;

/**
 * SHA-256 with Web Crypto: every browser, and Node 19 and later. This module
 * imports nothing from Node, so the browser entry can bundle it.
 */
export async function webCryptoSha256(bytes: Uint8Array): Promise<string> {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) throw new Error("hashing an upload needs Web Crypto (crypto.subtle)");
    const digest = await subtle.digest("SHA-256", new Uint8Array(bytes));
    return hex(new Uint8Array(digest));
}

/** A Blob, File or bytes as an upload source: hashed once, then sent as that same Blob. */
export async function prepareBlobSource(
    source: Uint8Array | ArrayBuffer | Blob,
    sha256: Sha256 = webCryptoSha256,
): Promise<PreparedUploadSource> {
    const blob = toBlob(source);
    return {
        size: blob.size,
        sha256: await sha256(new Uint8Array(await blob.arrayBuffer())),
        filename: fileNameOf(blob) ?? "document.pdf",
        contentType: blob.type || "application/pdf",
        open: async (): Promise<BodyInit> => blob,
        openProxyBlob: async (): Promise<Blob> => blob,
    };
}

export function isBlobSource(source: unknown): source is Uint8Array | ArrayBuffer | Blob {
    return source instanceof Blob || source instanceof Uint8Array || source instanceof ArrayBuffer;
}

export function hex(bytes: Uint8Array): string {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function toBlob(source: Uint8Array | ArrayBuffer | Blob): Blob {
    if (source instanceof Blob) return source;
    const bytes = source instanceof Uint8Array ? new Uint8Array(source) : new Uint8Array(source.slice(0));
    return new Blob([bytes], { type: "application/pdf" });
}

/** A `File`'s name. Blobs have none, and Node 18 has no `File` global to test against. */
function fileNameOf(blob: Blob): string | undefined {
    const name = (blob as { name?: unknown }).name;
    return typeof name === "string" && name.length > 0 ? name : undefined;
}
