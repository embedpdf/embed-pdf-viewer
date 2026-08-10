import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';

import { CloudPDFClient } from '../src/Client';

const BASE_URL = 'https://pagination.test';
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

function queryOf(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

describe('generated cursor pagination', () => {
  test('documents iteration follows nextCursor and preserves filters', async () => {
    const queries: Array<Record<string, string>> = [];
    server.use(
      http.get(`${BASE_URL}/v1/tenants/tenant-1/documents`, ({ request }) => {
        const query = queryOf(request);
        queries.push(query);
        return HttpResponse.json(
          query.cursor
            ? { documents: [{ id: 'doc-2' }], nextCursor: null }
            : { documents: [{ id: 'doc-1' }], nextCursor: 'documents-page-2' },
        );
      }),
    );
    const client = new CloudPDFClient({ token: 'test', environment: BASE_URL });

    const ids: string[] = [];
    const page = await client.documents.list({ tenantId: 'tenant-1', limit: 2, state: 'ready' });
    for await (const document of page) ids.push(document.id);

    expect(ids).toEqual(['doc-1', 'doc-2']);
    expect(queries).toEqual([
      { limit: '2', state: 'ready' },
      { limit: '2', cursor: 'documents-page-2', state: 'ready' },
    ]);
  });

  test('shares iteration follows nextCursor and preserves the document filter', async () => {
    const queries: Array<Record<string, string>> = [];
    server.use(
      http.get(`${BASE_URL}/v1/tenants/tenant-1/shares`, ({ request }) => {
        const query = queryOf(request);
        queries.push(query);
        return HttpResponse.json(
          query.cursor
            ? { shares: [{ id: 'share-2' }], nextCursor: null }
            : { shares: [{ id: 'share-1' }], nextCursor: 'shares-page-2' },
        );
      }),
    );
    const client = new CloudPDFClient({ token: 'test', environment: BASE_URL });

    const ids: string[] = [];
    const page = await client.shares.list({ tenantId: 'tenant-1', limit: 2, docId: 'doc-1' });
    for await (const share of page) ids.push(share.id);

    expect(ids).toEqual(['share-1', 'share-2']);
    expect(queries).toEqual([
      { limit: '2', docId: 'doc-1' },
      { limit: '2', cursor: 'shares-page-2', docId: 'doc-1' },
    ]);
  });

  test('tenants iteration drains every generated page', async () => {
    const queries: Array<Record<string, string>> = [];
    server.use(
      http.get(`${BASE_URL}/v1/tenants`, ({ request }) => {
        const query = queryOf(request);
        queries.push(query);
        return HttpResponse.json(
          query.cursor
            ? { tenants: [{ id: 'tenant-2' }], nextCursor: null }
            : { tenants: [{ id: 'tenant-1' }], nextCursor: 'tenants-page-2' },
        );
      }),
    );
    const client = new CloudPDFClient({ token: 'test', environment: BASE_URL });

    const ids: string[] = [];
    const page = await client.tenants.list({ limit: 2 });
    for await (const tenant of page) ids.push(tenant.id);

    expect(ids).toEqual(['tenant-1', 'tenant-2']);
    expect(queries).toEqual([{ limit: '2' }, { limit: '2', cursor: 'tenants-page-2' }]);
  });
});
