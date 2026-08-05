import { describe, expect, test } from 'vitest';
import { flatten, unflatten } from '../../../packages/engine-core/src/wire/flatten';

describe('flatten / unflatten', () => {
  test('flat scalars pass through', () => {
    expect(flatten({ width: 720, format: 'webp', includeAnnotations: true })).toEqual({
      width: 720,
      format: 'webp',
      includeAnnotations: true,
    });
  });

  test('one-level nested objects produce dotted keys', () => {
    expect(flatten({ viewport: { kind: 'width', width: 720 } })).toEqual({
      'viewport.kind': 'width',
      'viewport.width': 720,
    });
  });

  test('two-level nesting produces dotted-dotted keys', () => {
    expect(
      flatten({
        target: { kind: 'rect', rect: { left: 10, bottom: 20, right: 40, top: 60 } },
      }),
    ).toEqual({
      'target.kind': 'rect',
      'target.rect.left': 10,
      'target.rect.bottom': 20,
      'target.rect.right': 40,
      'target.rect.top': 60,
    });
  });

  test('undefined and null values are dropped', () => {
    expect(flatten({ a: 1, b: undefined, c: null, d: 'x' })).toEqual({ a: 1, d: 'x' });
  });

  test('nested undefined leaves are dropped without leaving empty branches', () => {
    expect(flatten({ viewport: { kind: undefined, width: 720 } })).toEqual({
      'viewport.width': 720,
    });
  });

  test('arrays throw (no list grammar in the wire format)', () => {
    expect(() => flatten({ tags: ['a', 'b'] })).toThrow(/arrays are not supported/);
  });

  test('non-finite numbers throw', () => {
    expect(() => flatten({ scale: Number.POSITIVE_INFINITY })).toThrow(/non-finite number/);
    expect(() => flatten({ scale: Number.NaN })).toThrow(/non-finite number/);
  });

  test('object keys containing "." throw (would be ambiguous on round-trip)', () => {
    expect(() => flatten({ 'viewport.kind': 'width' })).toThrow(/must not contain "\."/);
  });

  test('root scalar throws', () => {
    expect(() => flatten('hello')).toThrow(/root value must be an object/);
  });

  test('unflatten reverses flatten', () => {
    const original = {
      viewport: { kind: 'width', width: 720 },
      target: { kind: 'rect', rect: { left: 10, bottom: 20, right: 40, top: 60 } },
      background: 'white',
      rotation: 90,
      includeAnnotations: true,
    };
    expect(unflatten(flatten(original))).toEqual(original);
  });

  test('round-trip with mixed nesting', () => {
    const original = {
      contentVersion: 1,
      annotationVersion: 7,
      includeAnnotations: true,
      viewport: { kind: 'scale', scale: 1.5 },
      target: { kind: 'page' },
      background: 'white',
    };
    expect(unflatten(flatten(original))).toEqual(original);
  });

  test('unflatten leaves values untouched (caller coerces)', () => {
    expect(
      unflatten({
        'viewport.kind': 'width',
        'viewport.width': '720',
        rotation: '90',
      }),
    ).toEqual({
      viewport: { kind: 'width', width: '720' },
      rotation: '90',
    });
  });

  test('unflatten rejects conflicting paths', () => {
    expect(() => unflatten({ viewport: 'width', 'viewport.kind': 'width' })).toThrow(
      /conflicting paths/,
    );
  });

  test('unflatten rejects empty key', () => {
    expect(() => unflatten({ '': 'x' })).toThrow(/empty key/);
  });

  test('unflatten rejects keys starting or ending with "."', () => {
    expect(() => unflatten({ '.viewport': 'x' })).toThrow(/must not start or end/);
    expect(() => unflatten({ 'viewport.': 'x' })).toThrow(/must not start or end/);
  });

  test('unflatten rejects keys with empty segments', () => {
    expect(() => unflatten({ 'viewport..kind': 'x' })).toThrow(/empty segments/);
  });

  test('unflatten ignores undefined values', () => {
    expect(unflatten({ a: 1, b: undefined })).toEqual({ a: 1 });
  });

  test('flatten skips empty branches', () => {
    expect(flatten({})).toEqual({});
    expect(flatten({ viewport: {} })).toEqual({});
  });
});
