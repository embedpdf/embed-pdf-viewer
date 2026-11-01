import { createHash } from "node:crypto";
import { createServer, type IncomingHttpHeaders } from "node:http";
import type { AddressInfo } from "node:net";

import { CloudPDFClient } from "../src/CloudPDFClient.js";
import { prepareUploadSource } from "../src/uploads/source.js";
import type { UploadProtocol } from "../src/uploads/types.js";
import { Uploads } from "../src/uploads/Uploads.js";

const bytes = new Uint8Array([1, 2, 3, 4]);
const sha256 = createHash("sha256").update(bytes).digest("hex");

function protocolWith(initResponse: unknown): UploadProtocol {
    return {
        init: vi.fn(async (): Promise<unknown> => initResponse),
        commit: vi.fn(async (): Promise<unknown> => ({ document: { id: "doc-1", state: "ready" } })),
        proxy: vi.fn(async (): Promise<Response> => new Response(null, { status: 200 })),
        presigned: vi.fn(async (): Promise<Response> => new Response(null, { status: 200 })),
    };
}

describe("Uploads.create", () => {
    it("returns a deduped document without transfer or commit", async () => {
        const protocol = protocolWith({ tag: "deduped", document: { id: "doc-existing" } });
        const result = await new Uploads(protocol, prepareUploadSource).create({ tenantId: "tenant-1", source: bytes });

        expect(result).toEqual({ tag: "deduped", document: { id: "doc-existing" } });
        expect(protocol.presigned).not.toHaveBeenCalled();
        expect(protocol.proxy).not.toHaveBeenCalled();
        expect(protocol.commit).not.toHaveBeenCalled();
    });

    it("uses exact presigned headers without adding CloudPDF authorization", async () => {
        const protocol = protocolWith({
            tag: "created",
            document: { id: "doc-1" },
            upload: {
                kind: "presigned",
                presigned: {
                    url: "https://objects.example/upload",
                    method: "PUT",
                    headers: { "Content-Type": "application/pdf", "x-signed": "yes" },
                },
            },
        });

        await new Uploads(protocol, prepareUploadSource).create({ tenantId: "tenant-1", source: bytes });

        const [, init] = vi.mocked(protocol.presigned).mock.calls[0]!;
        expect(init.headers).toEqual({ "Content-Type": "application/pdf", "x-signed": "yes" });
        expect(new Headers(init.headers).has("Authorization")).toBe(false);
        expect(protocol.commit).toHaveBeenCalledWith(
            { tenantId: "tenant-1", id: "doc-1", sha256 },
            { abortSignal: undefined },
        );
    });

    it("uses authenticated protocol proxy and commits only after it succeeds", async () => {
        const protocol = protocolWith({
            tag: "resumed",
            document: { id: "doc-1" },
            upload: { kind: "proxy", url: "/v1/tenants/tenant-1/documents/doc-1/upload-proxy" },
        });

        const result = await new Uploads(protocol, prepareUploadSource).create({ tenantId: "tenant-1", source: bytes });

        expect(result.tag).toBe("resumed");
        const [, form, options] = vi.mocked(protocol.proxy).mock.calls[0]!;
        expect(form.get("file")).toBeInstanceOf(Blob);
        expect(options.maxRetries).toBe(0);
        expect(protocol.commit).toHaveBeenCalledOnce();
    });

    it("does not commit after a failed transfer", async () => {
        const protocol = protocolWith({
            tag: "created",
            document: { id: "doc-1" },
            upload: {
                kind: "presigned",
                presigned: { url: "https://objects.example/upload", method: "PUT", headers: {} },
            },
        });
        vi.mocked(protocol.presigned).mockResolvedValue(new Response("no", { status: 500 }));

        await expect(
            new Uploads(protocol, prepareUploadSource).create({ tenantId: "tenant-1", source: bytes }),
        ).rejects.toThrow(/presigned upload failed/);
        expect(protocol.commit).not.toHaveBeenCalled();
    });

    it("threads the abort signal through init, transfer, and commit", async () => {
        const protocol = protocolWith({
            tag: "created",
            document: { id: "doc-1" },
            upload: {
                kind: "presigned",
                presigned: { url: "https://objects.example/upload", method: "PUT", headers: {} },
            },
        });
        const controller = new AbortController();

        await new Uploads(protocol, prepareUploadSource).create({
            tenantId: "tenant-1",
            source: bytes,
            signal: controller.signal,
        });

        expect(vi.mocked(protocol.init).mock.calls[0]![1].abortSignal).toBe(controller.signal);
        expect(vi.mocked(protocol.presigned).mock.calls[0]![1].signal).toBe(controller.signal);
        expect(vi.mocked(protocol.commit).mock.calls[0]![1].abortSignal).toBe(controller.signal);
    });
});

describe("upload progress", () => {
    it("passes the transport's progress on, within the file's size", async () => {
        const protocol = protocolWith({
            tag: "created",
            document: { id: "doc-1" },
            upload: {
                kind: "presigned",
                presigned: { url: "https://objects.example/upload", method: "PUT", headers: {} },
            },
        });
        vi.mocked(protocol.presigned).mockImplementation(async (_url, transfer) => {
            transfer.onProgress?.(2);
            transfer.onProgress?.(99);
            return new Response(null, { status: 200 });
        });
        const seen: Array<[number, number]> = [];

        await new Uploads(protocol, prepareUploadSource).create({
            tenantId: "tenant-1",
            source: bytes,
            onProgress: (loaded, total) => seen.push([loaded, total]),
        });

        expect(seen).toEqual([
            [0, 4],
            [2, 4],
            [4, 4],
            [4, 4],
        ]);
    });

    it("counts the bytes fetch sends to storage, and keeps the signed Content-Length", async () => {
        const file = new Uint8Array(300_000).fill(7);
        const stored: { headers?: IncomingHttpHeaders; bytes?: number } = {};
        const server = createServer((req, res) => {
            const chunks: Buffer[] = [];
            req.on("data", (chunk: Buffer) => chunks.push(chunk));
            req.on("end", () => {
                const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
                res.setHeader("Content-Type", "application/json");
                if (req.url === "/v1/tenants/tenant-1/documents/init") {
                    res.end(
                        JSON.stringify({
                            tag: "created",
                            document: { id: "doc-1" },
                            upload: {
                                kind: "presigned",
                                presigned: {
                                    url: `${base}/storage/doc-1.pdf`,
                                    method: "PUT",
                                    headers: {
                                        "Content-Type": "application/pdf",
                                        "Content-Length": String(file.byteLength),
                                    },
                                },
                            },
                        }),
                    );
                } else if (req.url === "/storage/doc-1.pdf") {
                    stored.headers = req.headers;
                    stored.bytes = Buffer.concat(chunks).byteLength;
                    res.end();
                } else {
                    res.end(JSON.stringify({ document: { id: "doc-1", state: "ready" } }));
                }
            });
        });
        await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
        try {
            const client = new CloudPDFClient({
                token: "key",
                baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
            });
            const seen: number[] = [];

            await client.uploads.create({
                tenantId: "tenant-1",
                source: new Blob([file]),
                onProgress: (loaded) => seen.push(loaded),
            });

            expect(stored.bytes).toBe(file.byteLength);
            expect(stored.headers?.["content-length"]).toBe(String(file.byteLength));
            expect(stored.headers?.["transfer-encoding"]).toBeUndefined();
            expect(stored.headers?.authorization).toBeUndefined();
            // Start, at least one step in between, and the end.
            expect(seen[0]).toBe(0);
            expect(seen.some((loaded) => loaded > 0 && loaded < file.byteLength)).toBe(true);
            expect(seen.at(-1)).toBe(file.byteLength);
        } finally {
            await new Promise<void>((resolve) => server.close(() => resolve()));
        }
    });
});
