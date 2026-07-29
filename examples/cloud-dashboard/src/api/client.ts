import type { CreateShareInput, DemoConfig, DemoDocument, Share, UploadResult } from './types';

/**
 * Typed calls into the demo's admin helper. One thin module so screens never
 * hand-roll fetch/JSON/error handling, and so the whole `/api` surface is
 * legible in one file.
 */

async function json<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  const text = await res.text();
  const body = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  config: () => json<DemoConfig>('/api/config'),

  documents: {
    list: (tenantId: string) =>
      json<{ documents: DemoDocument[] }>(
        `/api/documents?tenantId=${encodeURIComponent(tenantId)}`,
      ).then((r) => r.documents),

    upload: (tenantId: string, file: File, onProgress?: (fraction: number) => void) =>
      new Promise<UploadResult>((resolve, reject) => {
        // XHR rather than fetch: upload progress is the one thing fetch still
        // can't report, and a dashboard that swallows a 40 MB upload in silence
        // feels broken.
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `/api/documents?tenantId=${encodeURIComponent(tenantId)}`);
        xhr.setRequestHeader('x-file-name', encodeURIComponent(file.name));
        xhr.setRequestHeader('Content-Type', 'application/pdf');
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
        };
        xhr.onload = () => {
          const parsed = xhr.responseText ? JSON.parse(xhr.responseText) : null;
          if (xhr.status >= 200 && xhr.status < 300) resolve(parsed as UploadResult);
          else reject(new Error(parsed?.error?.message ?? `upload failed: ${xhr.status}`));
        };
        xhr.onerror = () => reject(new Error('upload failed: network error'));
        xhr.send(file);
      }),

    remove: (tenantId: string, docId: string) =>
      json<{ ok: true }>(
        `/api/documents/${encodeURIComponent(docId)}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      ),

    /** Warmed page-1 tile (WS2). Proxied because the browser holds no admin token. */
    thumbnailUrl: (tenantId: string, docId: string) =>
      `/api/documents/${encodeURIComponent(docId)}/thumbnail?tenantId=${encodeURIComponent(tenantId)}`,

    downloadUrl: (tenantId: string, docId: string) =>
      `/api/documents/${encodeURIComponent(docId)}/download?tenantId=${encodeURIComponent(tenantId)}`,
  },

  shares: {
    list: (tenantId: string, docId?: string) =>
      json<{ shares: Share[] }>(
        `/api/shares?tenantId=${encodeURIComponent(tenantId)}${docId ? `&docId=${encodeURIComponent(docId)}` : ''}`,
      ).then((r) => r.shares),

    create: (tenantId: string, input: CreateShareInput) =>
      json<{ share: Share }>(`/api/shares?tenantId=${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      }).then((r) => r.share),

    remove: (tenantId: string, shareId: string) =>
      json<{ ok: true }>(
        `/api/shares/${encodeURIComponent(shareId)}?tenantId=${encodeURIComponent(tenantId)}`,
        { method: 'DELETE' },
      ),
  },
};
