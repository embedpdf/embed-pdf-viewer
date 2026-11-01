'use client';

/** A file a tool made, ready to save again: its name, size and a URL for its bytes. */
export interface SavedFile {
  readonly name: string;
  readonly size: number;
  readonly url: string;
  readonly bytes: Uint8Array;
}

/** Wrap bytes as a file the page can hand out (a PDF unless `type` says); revoke `url` when it goes. */
export function savedFile(bytes: Uint8Array, name: string, type = 'application/pdf'): SavedFile {
  const blob = new Blob([bytes as BlobPart], { type });
  return { name, size: bytes.byteLength, url: URL.createObjectURL(blob), bytes };
}

/** Ask the browser to save `file` under its name. */
export function saveFile(file: SavedFile): void {
  const link = document.createElement('a');
  link.href = file.url;
  link.download = file.name;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}

/**
 * Save bytes once, for a file that isn't kept on the page: its URL is freed after the browser has
 * had time to start the download.
 */
export function saveBytes(bytes: Uint8Array, name: string, type = 'application/pdf'): void {
  const file = savedFile(bytes, name, type);
  saveFile(file);
  window.setTimeout(() => URL.revokeObjectURL(file.url), 60_000);
}
