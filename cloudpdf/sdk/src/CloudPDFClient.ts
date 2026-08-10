import { CloudPDFClient as GeneratedCloudPDFClient } from "./Client.js";
import type * as CloudPDF from "./api/index.js";
import { Uploads } from "./uploads/Uploads.js";

export declare namespace CloudPDFClient {
    type GeneratedOptions = GeneratedCloudPDFClient.Options;
    type Endpoint = GeneratedOptions["environment"];
    export type Options = Omit<GeneratedOptions, "environment" | "baseUrl"> &
        (
            | { baseUrl: NonNullable<GeneratedOptions["baseUrl"]>; environment?: Endpoint }
            | { environment: Endpoint; baseUrl?: GeneratedOptions["baseUrl"] }
        );
    export type RequestOptions = GeneratedCloudPDFClient.RequestOptions;
}

/** Generated protocol client plus CloudPDF's handwritten workflow layer. */
export class CloudPDFClient extends GeneratedCloudPDFClient {
    public readonly uploads: Uploads<CloudPDF.DocumentsCommit200Response.Document>;

    public constructor(options: CloudPDFClient.Options) {
        // Self-hosted CloudPDF has no universal environment URL. Let callers
        // provide the familiar `baseUrl` alone while still satisfying Fern's
        // generated client's internal environment slot.
        super({ ...options, environment: options.environment ?? options.baseUrl } as GeneratedCloudPDFClient.Options);
        const rawFetch = options.fetch ?? globalThis.fetch?.bind(globalThis);
        if (!rawFetch) throw new Error("CloudPDFClient requires a fetch implementation");

        this.uploads = new Uploads({
            init: async (request, requestOptions): Promise<unknown> =>
                this.documents.init(request as never, requestOptions),
            commit: async (request, requestOptions): Promise<unknown> =>
                this.documents.commit(request as never, requestOptions),
            proxy: async (url, form, requestOptions): Promise<Response> =>
                this.fetch(
                    url,
                    { method: "POST", body: form },
                    {
                        abortSignal: requestOptions.abortSignal,
                        maxRetries: requestOptions.maxRetries,
                    },
                ),
            presigned: async (url, init): Promise<Response> => rawFetch(url, init),
        });
    }
}
