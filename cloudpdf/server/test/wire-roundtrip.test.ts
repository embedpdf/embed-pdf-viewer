import { describe, expect, test } from 'vitest';
import type { PageImageOptions } from '@embedpdf/engine-core/runtime';
import {
  decodeRenderToken,
  encodeRenderToken,
  flatten,
  PageRenderQuerySchema,
  renderImageOptionsToWire,
  unflatten,
} from '../../../packages/engine-core/src/wire';

/**
 * Design-proof tests. They exercise the full round trip:
 *
 *   SDK options ─► flatten ─► encodeRenderToken ─► URL ─► decodeRenderToken
 *               ─► unflatten ─► PageRenderQuerySchema.parse ─► SDK options
 *
 * If these pass, the entire render wire format is reachable through the
 * generic codec + schema. No bespoke per-option encoder or decoder is
 * required.
 */
describe('render wire round trip', () => {
  type Case = {
    name: string;
    options: PageImageOptions;
    versions: { contentVersion: number; annotationVersion?: number };
  };

  const cases: Case[] = [
    {
      name: 'minimal — versioned, no render options',
      options: { format: 'webp', includeAnnotations: false },
      versions: { contentVersion: 1 },
    },
    {
      name: 'width viewport with annotations on',
      options: {
        format: 'webp',
        viewport: { kind: 'width', width: 720 },
        includeAnnotations: true,
      },
      versions: { contentVersion: 2, annotationVersion: 5 },
    },
    {
      name: 'scale viewport with decimal',
      options: {
        format: 'png',
        viewport: { kind: 'scale', scale: 1.5 },
        includeAnnotations: false,
      },
      versions: { contentVersion: 7 },
    },
    {
      name: 'full rect target with rotation + background + quality',
      options: {
        format: 'webp',
        target: {
          kind: 'rect',
          rect: { left: 10, bottom: 20, right: 40.5, top: 60.25 },
        },
        viewport: { kind: 'width', width: 720 },
        rotation: 90,
        background: 'white',
        quality: 80,
        includeAnnotations: true,
      },
      versions: { contentVersion: 11, annotationVersion: 13 },
    },
    {
      name: 'page target',
      options: {
        format: 'webp',
        target: { kind: 'page' },
        viewport: { kind: 'width', width: 1024 },
        includeAnnotations: true,
      },
      versions: { contentVersion: 1, annotationVersion: 1 },
    },
    {
      name: 'transparent background',
      options: {
        format: 'png',
        background: 'transparent',
        viewport: { kind: 'width', width: 256 },
        includeAnnotations: false,
      },
      versions: { contentVersion: 1 },
    },
  ];

  test.each(cases)(
    'SDK options survive the full wire round trip: $name',
    ({ options, versions }) => {
      const wire = renderImageOptionsToWire(options, versions);
      const tokenString = encodeRenderToken(wire);
      const decodedFlat = decodeRenderToken(tokenString);
      const nested = unflatten(decodedFlat);
      const parsed = PageRenderQuerySchema.parse(nested);

      expect(parsed.contentVersion).toBe(versions.contentVersion);
      expect(parsed.annotationVersion).toBe(versions.annotationVersion);
      expect(parsed.options).toEqual({
        // Schema fills in includeAnnotations=true when absent. Normalize so the
        // comparison treats "absent" and "true" as the same intent.
        includeAnnotations: options.includeAnnotations ?? true,
        ...(options.format !== undefined ? { format: options.format } : {}),
        ...(options.target !== undefined ? { target: options.target } : {}),
        ...(options.viewport !== undefined ? { viewport: options.viewport } : {}),
        ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
        ...(options.background !== undefined ? { background: options.background } : {}),
        ...(options.quality !== undefined ? { quality: options.quality } : {}),
      });
    },
  );

  test('query-string shape round trips through unflatten (CDN-bypassing path)', () => {
    const flat = renderImageOptionsToWire(
      {
        format: 'webp',
        viewport: { kind: 'width', width: 720 },
        background: 'white',
        includeAnnotations: true,
      },
      { contentVersion: 1, annotationVersion: 7 },
    );
    // Simulate what Fastify hands the handler for a query string: every value
    // is a string.
    const asQueryStrings = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, String(v)]));
    const parsed = PageRenderQuerySchema.parse(unflatten(asQueryStrings));
    expect(parsed.contentVersion).toBe(1);
    expect(parsed.annotationVersion).toBe(7);
    expect(parsed.options).toEqual({
      format: 'webp',
      includeAnnotations: true,
      viewport: { kind: 'width', width: 720 },
      background: 'white',
    });
  });

  test('flatten and unflatten are inverses for the supported shape', () => {
    const nested = {
      contentVersion: 1,
      annotationVersion: 7,
      includeAnnotations: true,
      viewport: { kind: 'width', width: 720 },
      target: {
        kind: 'rect',
        rect: { left: 10, bottom: 20, right: 40, top: 60 },
      },
      background: 'white',
      rotation: 90,
      quality: 80,
    };
    expect(unflatten(flatten(nested))).toEqual(nested);
  });
});
