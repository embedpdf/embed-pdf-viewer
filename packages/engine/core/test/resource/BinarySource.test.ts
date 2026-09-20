import { describe, expect, test } from 'vitest';
import { resolveBinarySource } from '../../src/resource/BinarySource';

/**
 * Ownership contract: a resolved WireResource is a private copy of the
 * caller's bytes. The local engine puts `bytes` on a postMessage transfer
 * list, which detaches the buffer; a BinarySource argument is borrowed and
 * must survive that. A full-span Uint8Array used to be returned by
 * reference (the "no copy when the view spans its buffer" optimization),
 * which made a stamp library's bytes single-use.
 */
describe('resolveBinarySource — resolved bytes are always an owned copy', () => {
  const sample = () => new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8]);

  test('full-span Uint8Array is copied, not aliased', async () => {
    const view = sample();
    const resolved = await resolveBinarySource(view);
    expect(resolved.bytes).not.toBe(view.buffer);
    expect(new Uint8Array(resolved.bytes)).toEqual(view);
  });

  test('subarray view is copied to an exactly-sized buffer', async () => {
    const backing = sample();
    const view = backing.subarray(2, 10);
    const resolved = await resolveBinarySource(view);
    expect(resolved.bytes).not.toBe(backing.buffer);
    expect(resolved.bytes.byteLength).toBe(8);
    expect(new Uint8Array(resolved.bytes)).toEqual(view);
  });

  test('BinaryPayload wrapping a Uint8Array is copied', async () => {
    const view = sample();
    const resolved = await resolveBinarySource({
      data: view,
      mimeType: 'image/png',
      name: 'x.png',
    });
    expect(resolved.bytes).not.toBe(view.buffer);
    expect(resolved.mimeType).toBe('image/png');
    expect(resolved.name).toBe('x.png');
  });

  test("transferring the resolved buffer leaves the caller's bytes intact", async () => {
    const view = sample();
    const original = Array.from(view);
    const resolved = await resolveBinarySource(view);

    // Same mechanics as postMessage(payload, transfer): the resolved buffer
    // is detached here, the caller's must not be.
    const clone = structuredClone(resolved.bytes, { transfer: [resolved.bytes] });
    expect(resolved.bytes.byteLength).toBe(0); // detached
    expect(new Uint8Array(clone)).toEqual(new Uint8Array(original));
    expect(view.byteLength).toBe(original.length);
    expect(Array.from(view)).toEqual(original);

    // And the same source resolves again, unchanged.
    const again = await resolveBinarySource(view);
    expect(new Uint8Array(again.bytes)).toEqual(new Uint8Array(original));
  });

  test("later mutation of the caller's view does not reach the resolved copy", async () => {
    const view = sample();
    const resolved = await resolveBinarySource(view);
    view[0] = 0xff;
    expect(new Uint8Array(resolved.bytes)[0]).toBe(0x89);
  });
});
