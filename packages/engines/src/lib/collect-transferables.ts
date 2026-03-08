/**
 * Recursively walks a response object and collects Transferable entries
 * (ArrayBuffer from typed arrays, raw ArrayBuffer).
 *
 * Depth-limited to 6 to cover the deepest nesting in this codebase:
 *   response.data.result[annotId][mode].data.data  (AnnotationAppearanceMap)
 */

const MAX_DEPTH = 6;

function walk(value: unknown, seen: Set<ArrayBuffer>, depth: number): void {
  if (depth > MAX_DEPTH || value == null || typeof value !== 'object') {
    return;
  }

  if (value instanceof ArrayBuffer) {
    seen.add(value);
    return;
  }

  // SharedArrayBuffer is not transferable — skip
  if (typeof SharedArrayBuffer !== 'undefined' && value instanceof SharedArrayBuffer) {
    return;
  }

  if (ArrayBuffer.isView(value)) {
    const buf = value.buffer;
    if (buf instanceof ArrayBuffer) {
      seen.add(buf);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], seen, depth + 1);
    }
    return;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    walk((value as Record<string, unknown>)[key], seen, depth + 1);
  }
}

export function collectTransferables(value: unknown): Transferable[] {
  const seen = new Set<ArrayBuffer>();
  walk(value, seen, 0);
  return Array.from(seen);
}
