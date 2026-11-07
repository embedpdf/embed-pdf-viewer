/**
 * The pages a Print dialog's range names, as people type them: page numbers counted from 1, and
 * ranges of them, separated by commas ("1-3, 5"). They come out in the document's order, each
 * once, as the browser's own print dialog prints them. `null` when the text names no page, or a
 * page the document doesn't have.
 */
export function pagesInRange(text: string, pageCount: number): number[] | null {
  const parts = text
    // The comma, and the commas Chinese, Japanese and Arabic keyboards type.
    .split(/[,，、،]/)
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) return null;
  const pages = new Set<number>();
  for (const part of parts) {
    // A hyphen or an en dash, which some keyboards type for "to".
    const match = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(part);
    if (!match) return null;
    const first = Number(match[1]);
    const last = match[2] === undefined ? first : Number(match[2]);
    if (first < 1 || first > last || last > pageCount) return null;
    for (let page = first; page <= last; page += 1) pages.add(page);
  }
  return [...pages].sort((a, b) => a - b);
}
