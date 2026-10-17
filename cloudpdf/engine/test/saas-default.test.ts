import { describe, expect, test } from 'vitest';

import { CLOUDPDF_SAAS_URL, cloudEngine } from '../src/index';

/**
 * An engine that names no server connects to CloudPDF SaaS; one that names its own connects
 * there. Only the address is checked: the stub answers every request with a 404.
 */
function recordingFetch() {
  const urls: string[] = [];
  const fetch: typeof globalThis.fetch = async (input) => {
    urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    return new Response(JSON.stringify({ code: 'not_found', message: 'no such document' }), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    });
  };
  return { urls, fetch };
}

describe('where a cloud engine connects', () => {
  test('CloudPDF SaaS, when it names no server', async () => {
    const { urls, fetch } = recordingFetch();
    const engine = cloudEngine({ fetch });
    await engine.open({ kind: 'id', id: 'doc-1' }).catch(() => undefined);
    expect(CLOUDPDF_SAAS_URL).toBe('https://engine.cloudpdf.com');
    expect(urls[0]).toMatch(/^https:\/\/engine\.cloudpdf\.com\/v1\/docs\/doc-1\//);
  });

  test('its own server, when it names one', async () => {
    const { urls, fetch } = recordingFetch();
    const engine = cloudEngine({ baseUrl: 'https://pdf.example.com/', fetch });
    await engine.open({ kind: 'id', id: 'doc-1' }).catch(() => undefined);
    expect(urls[0]).toMatch(/^https:\/\/pdf\.example\.com\/v1\/docs\/doc-1\//);
  });
});
