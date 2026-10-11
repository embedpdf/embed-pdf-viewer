import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bakedAppearanceOf,
  createShownUrls,
  loadAppearanceUrls,
  loadObjectUrl,
  objectUrlOf,
  shownAppearance,
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
      state: null,
      rect: { x: 0, y: 0, width: 1, height: 1 },
      version: 2,
      image: { objectUrl: () => ({ abortWith: async () => ({ url: `url:${key}`, revoke }) }) },
      revoke,
    };
  };

  it('hands over every URL by key and state, with its version, and keeps them until the next set is shown', async () => {
    const shown = createShownUrls();
    const first = [picture('a'), picture('b')];
    const onLoaded = vi.fn();
    const cancel = loadAppearanceUrls(
      shown,
      async () => first,
      (ref) => `key:${ref}`,
      onLoaded,
    );
    await flush();
    expect(onLoaded).toHaveBeenCalledWith({
      'key:a|': { url: 'url:a', box: first[0]!.rect, version: 2 },
      'key:b|': { url: 'url:b', box: first[1]!.rect, version: 2 },
    });
    // The page changed: the next load starts, and what shows stays valid meanwhile.
    cancel();
    expect(first.some((each) => each.revoke.mock.calls.length > 0)).toBe(false);
    const next = [picture('a')];
    loadAppearanceUrls(shown, async () => next, String, onLoaded);
    await flush();
    expect(first.every((each) => each.revoke.mock.calls.length === 1)).toBe(true);
    expect(next[0]!.revoke).not.toHaveBeenCalled();
    shown.release();
    expect(next[0]!.revoke).toHaveBeenCalledTimes(1);
  });

  it('a load cancelled before it is shown revokes what it made, and leaves the shown set', async () => {
    const shown = createShownUrls();
    const showing = [picture('a')];
    loadAppearanceUrls(
      shown,
      async () => showing,
      String,
      () => {},
    );
    await flush();
    let arrive!: () => void;
    const late = picture('b');
    const cancel = loadAppearanceUrls(
      shown,
      () => new Promise<typeof showing>((done) => (arrive = () => done([late]))),
      String,
      () => {},
    );
    cancel();
    arrive();
    await flush();
    expect(late.revoke).toHaveBeenCalledTimes(1);
    expect(showing[0]!.revoke).not.toHaveBeenCalled();
  });

  it('aborts the load and hands over nothing when cancelled first', async () => {
    let signal: AbortSignal | null = null;
    const onLoaded = vi.fn();
    const cancel = loadAppearanceUrls(
      createShownUrls(),
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

describe('every state of every item', () => {
  const box = { x: 0, y: 0, width: 10, height: 10 };
  const picture = (item: string, state: string | null) => ({
    ref: item,
    state,
    rect: box,
    version: 0,
    image: {
      objectUrl: () => ({
        abortWith: async () => ({ url: `url:${item}:${state}`, revoke: () => {} }),
      }),
    },
  });

  it('are loaded, and an item shows the one it is in', async () => {
    const onLoaded = vi.fn();
    loadAppearanceUrls(
      createShownUrls(),
      async () => [picture('check', 'Yes'), picture('check', 'Off'), picture('name', null)],
      (ref) => `obj:${ref}`,
      onLoaded,
    );
    await flush();
    const urls = onLoaded.mock.calls[0]![0];
    expect(shownAppearance(urls, 'obj:check', 'Yes')?.url).toBe('url:check:Yes');
    // An item with states that names none shows `Off`.
    expect(shownAppearance(urls, 'obj:check', null)?.url).toBe('url:check:Off');
    // An item without states shows its only picture.
    expect(shownAppearance(urls, 'obj:name', null)?.url).toBe('url:name:null');
    expect(shownAppearance(urls, 'obj:check', 'Maybe')).toBeNull();
    expect(shownAppearance(urls, 'obj:other', null)).toBeNull();
    // A renderer's `appearance`: the URL of the state it shows, or null until it loads.
    expect(bakedAppearanceOf(urls, 'obj:check', 'Yes')).toEqual({ url: 'url:check:Yes' });
    expect(bakedAppearanceOf(urls, 'obj:other', null)).toBeNull();
  });
});
