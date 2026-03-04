const MAX_DEPTH = 6;

function walk(value: unknown, seen: Set<ArrayBuffer>, depth: number): void {
  if (depth > MAX_DEPTH || value == null || typeof value !== 'object') {
    return;
  }

  if (value instanceof ArrayBuffer) {
    seen.add(value);
    return;
  }

  if (ArrayBuffer.isView(value)) {
    if (value.buffer instanceof ArrayBuffer) {
      seen.add(value.buffer);
    }
    return;
  }

  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      walk(value[i], seen, depth + 1);
    }
    return;
  }

  const obj = value as Record<string, unknown>;
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      walk(obj[key], seen, depth + 1);
    }
  }
}

export function collectTransferables(value: unknown): ArrayBuffer[] {
  const seen = new Set<ArrayBuffer>();
  walk(value, seen, 0);
  return Array.from(seen);
}
