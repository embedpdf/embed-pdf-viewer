import { CloudPDFClient } from "../src/CloudPDFClient.js";

/** A fetch that answers every request with an empty grant list, and records where each went. */
function recordingFetch() {
    const calls: Array<{ url: string; authorization: string | null }> = [];
    const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url = input instanceof Request ? input.url : input.toString();
        calls.push({ url, authorization: new Headers(init?.headers).get("authorization") });
        return new Response(JSON.stringify({ grants: [], nextCursor: null }), {
            status: 200,
            headers: { "content-type": "application/json" },
        });
    });
    return { calls, fetch };
}

describe("CloudPDFClient's address", () => {
    it("is CloudPDF SaaS when given none", async () => {
        const { calls, fetch } = recordingFetch();
        const client = new CloudPDFClient({ token: "key", fetch });

        await client.grants.list({ tenantId: "tenant-1" });

        expect(calls[0]?.url).toBe("https://engine.cloudpdf.com/v1/tenants/tenant-1/grants");
    });

    it("is your own server when given baseUrl", async () => {
        const { calls, fetch } = recordingFetch();
        const client = new CloudPDFClient({ baseUrl: "https://pdf.example.com", token: "key", fetch });

        await client.grants.list({ tenantId: "tenant-1" });

        expect(calls[0]?.url).toBe("https://pdf.example.com/v1/tenants/tenant-1/grants");
    });

    it("sends a relative passthrough request, like a proxy upload, to SaaS with the token", async () => {
        const { calls, fetch } = recordingFetch();
        const client = new CloudPDFClient({ token: "key", fetch });

        await client.fetch("/v1/tenants/tenant-1/documents/doc-1/upload-proxy", { method: "POST" });

        expect(calls[0]).toEqual({
            url: "https://engine.cloudpdf.com/v1/tenants/tenant-1/documents/doc-1/upload-proxy",
            authorization: "Bearer key",
        });
    });
});
