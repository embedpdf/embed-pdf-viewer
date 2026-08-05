import { AdminErrorPayloadSchema, type AdminErrorPayload } from '@cloudpdf/admin-api';

/**
 * Error thrown by every @cloudpdf/admin call on a non-2xx HTTP response.
 * Carries the wire `code` for typed handling and the original HTTP
 * status for fallback diagnostics.
 */
export class AdminError extends Error {
  readonly code: string;
  readonly status: number;
  readonly body?: AdminErrorPayload;

  constructor(opts: { code: string; status: number; message: string; body?: AdminErrorPayload }) {
    super(opts.message);
    this.name = 'AdminError';
    this.code = opts.code;
    this.status = opts.status;
    this.body = opts.body;
  }

  static async fromResponse(res: Response): Promise<AdminError> {
    let body: AdminErrorPayload | undefined;
    let text = '';
    try {
      text = await res.text();
      if (text) {
        const parsed = AdminErrorPayloadSchema.safeParse(JSON.parse(text));
        if (parsed.success) body = parsed.data;
      }
    } catch {
      // body wasn't JSON; carry the raw text in `message` below.
    }
    const code = body?.error?.code ?? `HTTP_${res.status}`;
    const message = body?.error?.message ?? (text || `${res.status} ${res.statusText}`);
    return new AdminError({ code, status: res.status, message, body });
  }
}
