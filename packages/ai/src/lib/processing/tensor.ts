/**
 * Find an input name from the session by matching hint strings.
 */
export function inputNameByHint(
  inputNames: string[],
  hints: string[],
  fallbackIndex: number,
): string {
  const lower = inputNames.map((n) => n.toLowerCase());
  const idx = lower.findIndex((name) => hints.some((h) => name.includes(h)));
  return idx !== -1 ? inputNames[idx] : (inputNames[fallbackIndex] ?? inputNames[0]);
}

/**
 * Detect the ORT type from metadata string.
 */
export function ortTypeFromMetadata(typeString: string): string {
  const lower = String(typeString || '').toLowerCase();
  if (lower.includes('int64')) return 'int64';
  if (lower.includes('int32')) return 'int32';
  if (lower.includes('bool')) return 'bool';
  return 'float32';
}
