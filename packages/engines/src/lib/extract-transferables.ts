/**
 * Recursively walks a response object and collects Transferable entries
 * (ArrayBuffer from typed arrays, raw ArrayBuffer, ImageBitmap).
 * Uses a Set to deduplicate — postMessage throws on duplicate transferables.
 *
 * Depth-limited to 6 to cover the deepest nesting in this codebase:
 *   response.data.result[annotId][mode].data.data  (AnnotationAppearanceMap)
 */
export function extractTransferables(obj: unknown, depth = 6): Transferable[] {
  const set = new Set<Transferable>();
  collect(obj, depth, set);
  return Array.from(set);
}

function collect(value: unknown, depth: number, set: Set<Transferable>): void {
  if (depth < 0 || value == null) return;

  if (value instanceof ArrayBuffer) {
    set.add(value);
    return;
  }

  if (ArrayBuffer.isView(value)) {
    set.add(value.buffer as ArrayBuffer);
    return;
  }

  if (typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      collect(value[i], depth - 1, set);
    }
    return;
  }

  for (const key in value as Record<string, unknown>) {
    collect((value as Record<string, unknown>)[key], depth - 1, set);
  }
}
