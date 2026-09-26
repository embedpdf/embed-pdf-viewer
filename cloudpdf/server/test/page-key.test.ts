import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { encodePageKey, toPageRef } from '@embedpdf/engine-core/runtime';
import {
  buildHostFixture,
  docToken,
  seedDocument,
  tearDownHostFixture,
  type HostFixture,
} from './_helpers/host-app-fixture';

/**
 * The `:pageKey` route parameter: every per-page leaf addresses its page by
 * the encoded `PageRef` (`obj:N`) — the page-plane sibling of `:annotKey`.
 * A well-formed key of an unknown page is a 404 (the page registry's
 * verdict); a key that is not a page key at all is a 400 (never reaches the
 * engine).
 */
describe('page keys', () => {
  let fx: HostFixture;
  const tenantId = 'tenant-page-key';
  const docId = 'docpagekey1';
  const layerName = 'alice';

  beforeAll(async () => {
    fx = await buildHostFixture();
    await seedDocument(fx, tenantId, docId);
  });

  afterAll(async () => {
    await tearDownHostFixture(fx);
  });

  const textUrl = (pageKey: string) =>
    `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/text/pages/${encodeURIComponent(
      pageKey,
    )}/data`;
  const headers = () => ({ Authorization: `Bearer ${docToken(tenantId, docId, layerName)}` });

  test('obj:N addresses the page the layout lists under that object number', async () => {
    const res = await fetch(textUrl(encodePageKey(toPageRef(2))), { headers: headers() });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { text: string };
    expect(body.text).toContain(`${docId} page 2`);
  });

  test('a well-formed key of an unknown page answers 404', async () => {
    const res = await fetch(textUrl('obj:999'), { headers: headers() });
    expect(res.status).toBe(404);
  });

  test.each(['12', 'obj:0', 'obj:-1', 'obj:1.5', 'name:x', 'nm:1', 'obj:'])(
    'a malformed key %j answers 400 without touching the engine',
    async (pageKey) => {
      const res = await fetch(textUrl(pageKey), { headers: headers() });
      expect(res.status).toBe(400);
      expect(await res.text()).toContain('not a valid page key');
    },
  );
});
