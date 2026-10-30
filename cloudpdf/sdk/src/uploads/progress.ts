/** The most a counted body hands `fetch` at once, so progress moves in steps this size. */
const PIECE_BYTES = 64 * 1024;

/**
 * The body as a stream that reports the bytes `fetch` has taken from it so
 * far. `fetch` can't report upload progress itself; counting what it pulls,
 * a piece at a time and only when it asks for more, is the nearest a server
 * can get. A streamed body needs `duplex: "half"`.
 */
export function countingBody(body: BodyInit, onProgress: (loaded: number) => void): ReadableStream<Uint8Array> {
    const reader = toReadableStream(body).getReader();
    let pending: Uint8Array = new Uint8Array(0);
    let loaded = 0;
    return new ReadableStream<Uint8Array>(
        {
            async pull(controller): Promise<void> {
                if (pending.byteLength === 0) {
                    const next = await reader.read();
                    if (next.done) {
                        controller.close();
                        return;
                    }
                    pending = next.value;
                }
                const piece = pending.subarray(0, PIECE_BYTES);
                pending = pending.subarray(piece.byteLength);
                loaded += piece.byteLength;
                controller.enqueue(piece);
                onProgress(loaded);
            },
            async cancel(reason): Promise<void> {
                await reader.cancel(reason);
            },
        },
        // Pull only when fetch reads, so the count follows the upload.
        { highWaterMark: 0 },
    );
}

export function isStreamBody(body: BodyInit): boolean {
    return typeof body === "object" && body !== null && ("pipe" in body || "getReader" in body);
}

function toReadableStream(body: BodyInit): ReadableStream<Uint8Array> {
    if (body instanceof Blob) return body.stream();
    if (typeof body === "object" && body !== null && "getReader" in body) {
        return body as ReadableStream<Uint8Array>;
    }
    if (typeof body === "object" && body !== null && Symbol.asyncIterator in body) {
        // A Node stream, such as a file read with `{ path }`.
        const iterator = (body as AsyncIterable<Uint8Array>)[Symbol.asyncIterator]();
        return new ReadableStream<Uint8Array>({
            async pull(controller): Promise<void> {
                const next = await iterator.next();
                if (next.done) controller.close();
                else controller.enqueue(next.value);
            },
            async cancel(reason): Promise<void> {
                await iterator.return?.(reason);
            },
        });
    }
    if (body instanceof ArrayBuffer) return new Blob([body]).stream();
    if (body instanceof Uint8Array) return new Blob([new Uint8Array(body)]).stream();
    throw new Error("upload progress needs a Blob, bytes or a stream body");
}
