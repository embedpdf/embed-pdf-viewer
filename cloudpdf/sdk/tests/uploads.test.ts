import { createHash } from "node:crypto";

import { Uploads } from "../src/uploads/Uploads.js";
import type { UploadProtocol } from "../src/uploads/types.js";

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
        const result = await new Uploads(protocol).create({ tenantId: "tenant-1", source: bytes });

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

        await new Uploads(protocol).create({ tenantId: "tenant-1", source: bytes });

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

        const result = await new Uploads(protocol).create({ tenantId: "tenant-1", source: bytes });

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

        await expect(new Uploads(protocol).create({ tenantId: "tenant-1", source: bytes })).rejects.toThrow(
            /presigned upload failed/,
        );
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

        await new Uploads(protocol).create({ tenantId: "tenant-1", source: bytes, signal: controller.signal });

        expect(vi.mocked(protocol.init).mock.calls[0]![1].abortSignal).toBe(controller.signal);
        expect(vi.mocked(protocol.presigned).mock.calls[0]![1].signal).toBe(controller.signal);
        expect(vi.mocked(protocol.commit).mock.calls[0]![1].abortSignal).toBe(controller.signal);
    });
});
