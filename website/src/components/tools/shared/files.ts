/**
 * Plain helpers every tool uses: what a dropped file is, and how a file's name, size and pages
 * read. No engine and no DOM, so they're tested on their own.
 */

/**
 * Whether the bytes are a PDF: `%PDF-` within the first 1 KB, where readers look for it. A file's
 * name and type say what it claims to be, so they're not asked.
 */
export function looksLikePdf(bytes: Uint8Array): boolean {
  const head = bytes.subarray(0, 1024);
  for (let index = 0; index + 5 <= head.length; index++) {
    if (
      head[index] === 0x25 && // %
      head[index + 1] === 0x50 && // P
      head[index + 2] === 0x44 && // D
      head[index + 3] === 0x46 && // F
      head[index + 4] === 0x2d // -
    ) {
      return true;
    }
  }
  return false;
}

/** A file's name without `.pdf`: a bookmark's title, and where the merged name starts from. */
export function baseName(name: string): string {
  const trimmed = name
    .trim()
    .replace(/\.pdf$/i, '')
    .trim();
  return trimmed || 'Untitled';
}

/** A size the way a file manager shows it: `840 KB`, `2.3 MB`. */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${Math.round(kilobytes)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
}

/** `1 page`, `12 pages`. */
export function pageCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'page' : 'pages'}`;
}
