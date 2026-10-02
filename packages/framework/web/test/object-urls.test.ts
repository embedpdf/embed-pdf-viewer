import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bakedAppearanceOf,
  loadAppearanceUrls,
  loadObjectUrl,
  objectUrlOf,
} from '../src/object-urls';

let made = 0;
function urlHarness() {
  const revoked: string[] = [];
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:${++made}`);
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => void revoked.push(url));
  return revoked;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => vi.restoreAllMocks());

describe('objectUrlOf', () => {
  it('copies the bytes into a blob of their type, and revokes on demand', async () => {
    const revoked = urlHarness();
    const backing = new Uint8Array([9, 1, 2, 3, 9]);
    const url = objectUrlOf({ bytes: backing.subarray(1, 4), mimeType: 'image/png' });
    const blob = vi.mocked(URL.createObjectURL).mock.calls[0]![0] as Blob;
    expect(blob.type).toBe('image/png');
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    url.revoke();
    expect(revoked).toEqual([url.url]);
  });
});

describe('loadObjectUrl', () => {
  it('hands over the URL once loaded, and revokes it on cancel', async () => {
    const revoked = urlHarness();
    const onUrl = vi.fn();
    const cancel = loadObjectUrl(async () => ({ bytes: new Uint8Array([1]) }), onUrl);
    await flush();
    expect(onUrl).toHaveBeenCalledTimes(1);
    cancel();
    expect(revoked).toEqual([onUrl.mock.calls[0]![0]]);
  });

  it('drops a load cancelled before it arrives', async () => {
    urlHarness();
    const onUrl = vi.fn();
    loadObjectUrl(async () => ({ bytes: new Uint8Array([1]) }), onUrl)();
    await flush();
    expect(onUrl).not.toHaveBeenCalled();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});

describe('loadAppearanceUrls', () => {
  const picture = (key: string) => {
    const revoke = vi.fn();
    return {
      ref: key,
      rect: { x: 0, y: 0, width: 1, height: 1 },
      image: { objectUrl: () => ({ abortWith: async () => ({ url: `url:${key}`, revoke }) }) },
      revoke,
    };
  };

  it('hands over every URL by key, and revokes them all on cancel', async () => {
    const pictures = [picture('a'), picture('b')];
    const onLoaded = vi.fn();
    const cancel = loadAppearanceUrls(
      async () => pictures,
      (ref) => `key:${ref}`,
      onLoaded,
    );
    await flush();
    expect(onLoaded).toHaveBeenCalledWith({
      'key:a': { url: 'url:a', box: pictures[0]!.rect },
      'key:b': { url: 'url:b', box: pictures[1]!.rect },
    });
    cancel();
    expect(pictures.every((each) => each.revoke.mock.calls.length === 1)).toBe(true);
  });

  it('aborts the load and hands over nothing when cancelled first', async () => {
    let signal: AbortSignal | null = null;
    const onLoaded = vi.fn();
    const cancel = loadAppearanceUrls(
      async (given) => {
        signal = given;
        return [picture('a')];
      },
      String,
      onLoaded,
    );
    cancel();
    await flush();
    expect(signal!.aborted).toBe(true);
    expect(onLoaded).not.toHaveBeenCalled();
  });
});

describe('bakedAppearanceOf', () => {
  it('is the loaded URL of the annotation, or null until it loads', () => {
    const urls = { 'obj:7': { url: 'blob:7', box: { x: 0, y: 0, width: 10, height: 10 } } };
    expect(bakedAppearanceOf(urls, 'obj:7')).toEqual({ url: 'blob:7' });
    expect(bakedAppearanceOf(urls, 'obj:8')).toBeNull();
  });
});
