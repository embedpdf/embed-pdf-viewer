/** `%PDF`, which a PDF has in its first 1024 bytes, as PDFium looks for it. */
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46];

/** Whether bytes are a PDF's, by its header: a web page or an image a URL gave instead isn't. */
export function isPdf(bytes: Uint8Array): boolean {
  const end = Math.min(bytes.length - PDF_HEADER.length, 1024);
  for (let start = 0; start <= end; start++) {
    if (PDF_HEADER.every((byte, index) => bytes[start + index] === byte)) return true;
  }
  return false;
}
