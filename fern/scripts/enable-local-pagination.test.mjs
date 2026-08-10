import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { PATCH_MARKER, enableLocalPagination } from './enable-local-pagination.mjs';

test('enables the pinned Fern local-workspace pagination gate', () => {
  const source =
    'before,generatePaginatedClients:Ne?.paginationEnabled??!1,after,generatePaginatedClients:!0';
  const patched = enableLocalPagination(source);

  assert.match(patched, new RegExp(PATCH_MARKER));
  assert.equal(patched.includes('Ne?.paginationEnabled??!1'), false);
  assert.equal(enableLocalPagination(patched), patched);
});

test('fails closed when the Fern bundle shape changes', () => {
  assert.throws(() => enableLocalPagination('generatePaginatedClients:false'), {
    message: 'Fern CLI pagination gate changed: expected exactly one match, found 0',
  });
  assert.throws(
    () =>
      enableLocalPagination(
        'generatePaginatedClients:A?.paginationEnabled??!1,generatePaginatedClients:B?.paginationEnabled??!1',
      ),
    { message: 'Fern CLI pagination gate changed: expected exactly one match, found 2' },
  );
});

test('the SDK workflow enables pagination immediately after installing Fern', () => {
  const workflow = readFileSync(
    new URL('../../.github/workflows/sdk-generate.yml', import.meta.url),
    'utf8',
  );
  assert.match(
    workflow,
    /npm install -g fern-api@5\.91\.0\n\s+node fern\/scripts\/enable-local-pagination\.mjs/,
  );
});
