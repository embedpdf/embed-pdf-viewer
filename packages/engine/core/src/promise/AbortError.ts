export class AbortError extends Error {
  override readonly name = 'AbortError';
  readonly reason: unknown;

  constructor(reason?: unknown) {
    super(reasonMessage(reason));
    this.reason = reason;
  }
}

export function isAbortError(value: unknown): value is AbortError {
  return value instanceof AbortError || (value as { name?: string } | null)?.name === 'AbortError';
}

function reasonMessage(reason: unknown): string {
  if (reason == null) return 'aborted';
  if (typeof reason === 'string') return reason;
  if (reason instanceof Error) return reason.message || 'aborted';
  try {
    return JSON.stringify(reason);
  } catch {
    return 'aborted';
  }
}
