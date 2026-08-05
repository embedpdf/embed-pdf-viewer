import { describe, expect, test } from 'vitest';
import {
  decodeRenderToken,
  encodeRenderToken,
  PageRenderQuerySchema,
  renderImageOptionsToToken,
  renderImageOptionsToWire,
  unflatten,
} from '../../../packages/engine-core/src/wire';

describe('wire token codec', () => {
  test('render tokens use dotted SDK paths in canonical alphabetical order', () => {
    const token = encodeRenderToken({
      contentVersion: 1,
      annotationVersion: 7,
      format: 'webp',
      includeAnnotations: true,
      'viewport.kind': 'width',
      'viewport.width': 720,
      background: 'white',
      rotation: 90,
      quality: 80,
      'target.kind': 'rect',
      'target.rect.left': 10,
      'target.rect.bottom': 20,
      'target.rect.right': 40.5,
      'target.rect.top': 60.25,
    });
    expect(token).toBe(
      'annotationVersion=7,background=white,contentVersion=1,format=webp,includeAnnotations=true,quality=80,rotation=90,target.kind=rect,target.rect.bottom=20,target.rect.left=10,target.rect.right=40.5,target.rect.top=60.25,viewport.kind=width,viewport.width=720',
    );
    expect(decodeRenderToken(token)).toEqual({
      contentVersion: '1',
      annotationVersion: '7',
      format: 'webp',
      includeAnnotations: 'true',
      'viewport.kind': 'width',
      'viewport.width': '720',
      background: 'white',
      rotation: '90',
      quality: '80',
      'target.kind': 'rect',
      'target.rect.left': '10',
      'target.rect.bottom': '20',
      'target.rect.right': '40.5',
      'target.rect.top': '60.25',
    });
  });

  test('decoder rejects non-canonical order and unknown fields', () => {
    expect(() => decodeRenderToken('contentVersion=1,background=white')).toThrow(
      /alphabetical order/,
    );
    expect(() => decodeRenderToken('contentVersion=1,foo=2')).toThrow(/unknown token field/);
  });

  test('scale uses normal decimals because comma separates fields', () => {
    const token = encodeRenderToken({
      contentVersion: 1,
      format: 'webp',
      includeAnnotations: false,
      'viewport.kind': 'scale',
      'viewport.scale': 1.5,
    });
    expect(token).toBe(
      'contentVersion=1,format=webp,includeAnnotations=false,viewport.kind=scale,viewport.scale=1.5',
    );
    expect(PageRenderQuerySchema.parse(unflatten(decodeRenderToken(token)))).toMatchObject({
      contentVersion: 1,
      options: {
        format: 'webp',
        includeAnnotations: false,
        viewport: { kind: 'scale', scale: 1.5 },
      },
    });
  });

  test('render semantics are enforced by the shared query schema', () => {
    // viewport.kind discriminator catches the bad shape at parse time:
    // "scale" alongside kind=width yields an unrecognized key under the
    // width branch of the discriminated union.
    expect(() =>
      PageRenderQuerySchema.parse(
        unflatten(
          decodeRenderToken(
            'contentVersion=1,format=webp,includeAnnotations=false,viewport.kind=width,viewport.scale=1,viewport.width=720',
          ),
        ),
      ),
    ).toThrow();
    // Versioned render with annotations requires annotationVersion.
    expect(() =>
      PageRenderQuerySchema.parse(
        unflatten(
          decodeRenderToken(
            'contentVersion=1,format=webp,includeAnnotations=true,viewport.kind=width,viewport.width=720',
          ),
        ),
      ),
    ).toThrow(/annotationVersion/);
    // Versioned render must include format.
    expect(() =>
      PageRenderQuerySchema.parse(
        unflatten(
          decodeRenderToken(
            'contentVersion=1,includeAnnotations=false,viewport.kind=width,viewport.width=720',
          ),
        ),
      ),
    ).toThrow(/format/);
  });

  test('renderImageOptionsToWire flattens SDK options to dotted wire keys', () => {
    const options = {
      format: 'webp' as const,
      viewport: { kind: 'width' as const, width: 720 },
      target: {
        kind: 'rect' as const,
        rect: { left: 10, bottom: 20, right: 40.5, top: 60.25 },
      },
      rotation: 90 as const,
      background: 'white' as const,
      quality: 80,
      includeAnnotations: true,
    };
    expect(renderImageOptionsToWire(options, { contentVersion: 3, annotationVersion: 9 })).toEqual({
      contentVersion: 3,
      annotationVersion: 9,
      format: 'webp',
      includeAnnotations: true,
      'viewport.kind': 'width',
      'viewport.width': 720,
      'target.kind': 'rect',
      'target.rect.left': 10,
      'target.rect.bottom': 20,
      'target.rect.right': 40.5,
      'target.rect.top': 60.25,
      rotation: 90,
      background: 'white',
      quality: 80,
    });
  });

  test('image render options round-trip through the render token shape', () => {
    const options = {
      format: 'webp' as const,
      viewport: { kind: 'width' as const, width: 720 },
      target: {
        kind: 'rect' as const,
        rect: { left: 10, bottom: 20, right: 40.5, top: 60.25 },
      },
      rotation: 90 as const,
      background: 'white' as const,
      quality: 80,
      includeAnnotations: true,
    };
    const tokenString = renderImageOptionsToToken(options, {
      contentVersion: 3,
      annotationVersion: 9,
    });
    expect(PageRenderQuerySchema.parse(unflatten(decodeRenderToken(tokenString))).options).toEqual({
      format: 'webp',
      includeAnnotations: true,
      viewport: { kind: 'width', width: 720 },
      target: {
        kind: 'rect',
        rect: { left: 10, bottom: 20, right: 40.5, top: 60.25 },
      },
      rotation: 90,
      background: 'white',
      quality: 80,
    });
  });
});
