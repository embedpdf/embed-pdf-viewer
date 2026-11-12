/**
 * `embedpdf.wasm` from the module graph: `@embedpdf/engine-runtime-wasm32/wasm-inline` holds the
 * binary gzipped and base64-encoded, and this turns that string back into its bytes.
 *
 * Two builds carry the string. The portable entry (`src/portable.ts`) always does. The default
 * entry does where its export map says `development` (`@embedpdf/engine/dev-wasm`), for a dev
 * server that prebundles the package without `embedpdf.wasm` (see `prebundledDevWasm` in
 * `src/worker-files.ts`); a production build resolves that subpath to a module that holds
 * nothing, so it never carries the binary twice.
 */

/** The wasm bytes of the packed string: base64 decode, gunzip. */
export async function unpackInlineWasm(packed: string): Promise<ArrayBuffer> {
  return inflate(decodeBase64(packed));
}

function decodeBase64(text: string): Uint8Array {
  // atob, not a data: URL fetch — a strict `connect-src` can block the latter.
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function inflate(packed: Uint8Array): Promise<ArrayBuffer> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error(
      '[embedpdf] the inline WebAssembly needs DecompressionStream (Chrome 80, Firefox 113, ' +
        'Safari 16.4). Self-host `embedpdf.wasm` and pass `assetsUrl` or `wasmUrl` instead.',
    );
  }
  const stream = new Blob([packed as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}
