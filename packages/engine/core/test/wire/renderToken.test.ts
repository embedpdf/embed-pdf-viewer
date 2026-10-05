import { describe, expect, test } from 'vitest';

import { unflatten } from '../../src/wire/flatten';
import { renderImageOptionsToToken } from '../../src/wire/renderOptionsCodec';
import { PageRenderQuerySchema } from '../../src/wire/schemas';
import { decodeRenderToken } from '../../src/wire/tokens';

const options = { format: 'webp', viewport: { kind: 'width', width: 720 } } as const;
const versions = { contentVersion: 3 };

describe('the page render token', () => {
  test('names the pixels: a priority changes no part of it', () => {
    const token = renderImageOptionsToToken(options, versions);
    expect(renderImageOptionsToToken({ ...options, priority: 5000 }, versions)).toBe(token);
    // The server's strict query schema reads it back.
    expect(PageRenderQuerySchema.parse(unflatten(decodeRenderToken(token))).options).toEqual({
      ...options,
      includeAnnotations: false,
    });
  });
});
