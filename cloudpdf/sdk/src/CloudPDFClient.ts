import type * as CloudPDF from "./api/index.js";
import { CloudPDFClient as GeneratedCloudPDFClient } from "./Client.js";
import { CloudPDFEnvironment } from "./environments.js";
import { countingBody, isStreamBody } from "./uploads/progress.js";
import { prepareUploadSource } from "./uploads/source.js";
import { Uploads } from "./uploads/Uploads.js";

export declare namespace CloudPDFClient {
    /** CloudPDF SaaS unless `baseUrl` names your own server. */
    export type Options = GeneratedCloudPDFClient.Options;
    export type RequestOptions = GeneratedCloudPDFClient.RequestOptions;
}

/** Generated protocol client plus CloudPDF's handwritten workflow layer. */
export class CloudPDFClient extends GeneratedCloudPDFClient {
    public readonly uploads: Uploads<CloudPDF.DocumentsCommit200Response.Document>;

    public constructor(options: CloudPDFClient.Options = {}) {
        // Generated requests fall back to SaaS by themselves; the passthrough
        // `fetch` the uploads use doesn't, so the default is named here.
        super({ ...options, environment: options.environment ?? CloudPDFEnvironment.Saas });
        const rawFetch = options.fetch ?? globalThis.fetch?.bind(globalThis);
        if (!rawFetch) throw new Error("CloudPDFClient requires a fetch implementation");

        this.uploads = new Uploads(
            {
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
                presigned: async (url, transfer): Promise<Response> => {
                    // Counting what fetch reads is the progress a server can
                    // report. Either way, a stream body needs half duplex.
                    const body = transfer.onProgress ? countingBody(transfer.body, transfer.onProgress) : transfer.body;
                    return rawFetch(url, {
                        method: transfer.method,
                        headers: transfer.headers,
                        body,
                        signal: transfer.signal,
                        ...(isStreamBody(body) ? ({ duplex: "half" } as Record<string, unknown>) : {}),
                    });
                },
            },
            prepareUploadSource,
        );
    }
}
