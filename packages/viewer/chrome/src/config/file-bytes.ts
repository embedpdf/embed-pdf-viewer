/**
 * A file the config hands the viewer, as its `data` or a `url` to fetch: the
 * app's fonts, its signature fonts, its stamp libraries. Same-origin or
 * CORS-enabled, fetched as given.
 */
export interface FileSource {
  readonly url?: string;
  readonly data?: Uint8Array | ArrayBuffer;
}

/** The bytes at `url`; rejects on a failed response. */
export async function fetchBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
}

/** A file's bytes: its `data`, or its `url` fetched. `what` names it when it has neither. */
export async function fileBytes(file: FileSource, what: string): Promise<Uint8Array> {
  if (file.data) return new Uint8Array(file.data);
  if (!file.url) throw new Error(`[embedpdf] ${what} has no url or data`);
  return fetchBytes(file.url);
}
