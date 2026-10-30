import { UploadError, upload } from "../src/upload.js";

/** An upload token as tokens.issue makes one; upload() reads only its payload. */
function uploadToken(claims: Record<string, unknown> = {}): string {
    const payload = Buffer.from(
        JSON.stringify({
            sub: "user-381",
            tenant_id: "fernquill",
            jti: "jti-1",
            upload: { folder_id: null, max_files: 1 },
            ...claims,
        }),
    ).toString("base64url");
    return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`;
}

const file = new File([new Uint8Array([37, 80, 68, 70])], "Support agreement.pdf", { type: "application/pdf" });

interface Call {
    url: string;
    init: RequestInit;
}

/** CloudPDF and storage behind one fetch: init hands out a presigned URL. */
function stubCloudPDF(initStatus = 200): Call[] {
    const calls: Call[] = [];
    vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string, init: RequestInit): Promise<Response> => {
            calls.push({ url, init });
            if (url.endsWith("/documents/init")) {
                if (initStatus !== 200) {
                    return Response.json(
                        { error: { code: "Forbidden", message: "this upload token uploads at most 1 file" } },
                        { status: initStatus },
                    );
                }
                return Response.json({
                    tag: "created",
                    document: { id: "doc-1" },
                    upload: {
                        kind: "presigned",
                        presigned: {
                            url: "https://objects.example/doc-1.pdf",
                            method: "PUT",
                            headers: { "Content-Type": "application/pdf", "Content-Length": "4" },
                        },
                    },
                });
            }
            if (url.startsWith("https://objects.example/")) return new Response(null, { status: 200 });
            return Response.json({ document: { id: "doc-1", state: "ready", name: "Support agreement.pdf" } });
        }),
    );
    return calls;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("upload() from the browser", () => {
    it("runs init, the storage PUT and commit with the token, on CloudPDF SaaS", async () => {
        const calls = stubCloudPDF();
        const token = uploadToken();

        const result = await upload(file, { token });

        expect(result).toEqual({
            tag: "created",
            document: { id: "doc-1", state: "ready", name: "Support agreement.pdf" },
        });
        expect(calls.map((call) => call.url)).toEqual([
            "https://engine.cloudpdf.com/v1/tenants/fernquill/documents/init",
            "https://objects.example/doc-1.pdf",
            "https://engine.cloudpdf.com/v1/tenants/fernquill/documents/doc-1/commit",
        ]);
        const [init, put, commit] = calls as [Call, Call, Call];
        expect(new Headers(init.init.headers).get("Authorization")).toBe(`Bearer ${token}`);
        expect(JSON.parse(String(init.init.body))).toMatchObject({
            contentLength: 4,
            name: "Support agreement.pdf",
        });
        expect(JSON.parse(String(init.init.body))).not.toHaveProperty("tenantId");
        // Storage gets the signed headers, and never the token.
        expect(new Headers(put.init.headers).has("Authorization")).toBe(false);
        expect(put.init.body).toBe(file);
        expect(new Headers(commit.init.headers).get("Authorization")).toBe(`Bearer ${token}`);
    });

    it("uses your own server when given baseUrl, and your name over the file's", async () => {
        const calls = stubCloudPDF();

        await upload(file, { token: uploadToken(), baseUrl: "https://pdf.fernquill.example//", name: "Contract.pdf" });

        expect(calls[0]!.url).toBe("https://pdf.fernquill.example/v1/tenants/fernquill/documents/init");
        expect(JSON.parse(String(calls[0]!.init.body)).name).toBe("Contract.pdf");
    });

    it("refuses a token that isn't an upload token", async () => {
        stubCloudPDF();
        const docToken = uploadToken({ upload: undefined, doc_id: "doc-1" });

        await expect(upload(file, { token: docToken })).rejects.toThrow(/must be an upload token/);
        await expect(upload(file, { token: "not-a-jwt" })).rejects.toThrow(/must be an upload token/);
    });

    it("turns CloudPDF's refusal into an UploadError", async () => {
        stubCloudPDF(403);

        const failure = await upload(file, { token: uploadToken() }).catch((error: unknown) => error);

        expect(failure).toBeInstanceOf(UploadError);
        expect(failure).toMatchObject({
            status: 403,
            code: "Forbidden",
            message: "this upload token uploads at most 1 file",
        });
    });
});

/** Enough of XMLHttpRequest to watch what upload() asks of it. */
class FakeXhr {
    public static last: FakeXhr | undefined;
    public static progress: number[] = [];
    public method = "";
    public url = "";
    public headers: Record<string, string> = {};
    public status = 0;
    public statusText = "";
    public responseText = "";
    public upload: { onprogress?: (event: { loaded: number }) => void } = {};
    public onload?: () => void;
    public onerror?: () => void;
    public onabort?: () => void;

    public open(method: string, url: string): void {
        this.method = method;
        this.url = url;
        FakeXhr.last = this;
    }

    public setRequestHeader(name: string, value: string): void {
        this.headers[name] = value;
    }

    public send(): void {
        queueMicrotask(() => {
            for (const loaded of FakeXhr.progress) this.upload.onprogress?.({ loaded });
            this.status = 200;
            this.onload?.();
        });
    }

    public abort(): void {
        this.onabort?.();
    }
}

describe("upload() with XHR", () => {
    beforeEach(() => {
        FakeXhr.last = undefined;
        FakeXhr.progress = [1, 3];
        vi.stubGlobal("XMLHttpRequest", FakeXhr);
    });

    it("reports progress as the file goes, and leaves Content-Length to the browser", async () => {
        stubCloudPDF();
        const seen: Array<[number, number]> = [];

        await upload(file, { token: uploadToken(), onProgress: (loaded, total) => seen.push([loaded, total]) });

        expect(seen).toEqual([
            [0, 4],
            [1, 4],
            [3, 4],
            [4, 4],
        ]);
        expect(FakeXhr.last).toMatchObject({ method: "PUT", url: "https://objects.example/doc-1.pdf" });
        expect(FakeXhr.last!.headers).toEqual({ "Content-Type": "application/pdf" });
    });

    it("stops when the signal aborts", async () => {
        stubCloudPDF();
        const controller = new AbortController();
        vi.stubGlobal(
            "XMLHttpRequest",
            class extends FakeXhr {
                public override send(): void {
                    controller.abort();
                }
            },
        );

        await expect(upload(file, { token: uploadToken(), signal: controller.signal })).rejects.toMatchObject({
            name: "AbortError",
        });
    });
});
