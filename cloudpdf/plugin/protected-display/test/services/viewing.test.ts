import { toPageRef } from '@embedpdf/core';
import { describe, expect, it } from 'vitest';

import { startViewing, type ViewingOptions } from '../../src/services/viewing';
import { fakeChannel, fakePlayer } from '../helpers/module';

function start(options: Partial<ViewingOptions> & Pick<ViewingOptions, 'channel' | 'player'>) {
  return startViewing({
    keySystems: ['fairplay', 'widevine', 'clearkey'],
    onProblem: () => {},
    signal: new AbortController().signal,
    ...options,
  });
}

describe('starting to view', () => {
  it('asks the player for the systems the app allows and the server issues, best first', async () => {
    const { channel } = fakeChannel({ systems: ['clearkey', 'widevine'] });
    const { player, asked } = fakePlayer();
    const viewing = await start({ channel, player, keySystems: ['clearkey', 'widevine'] });
    expect(asked).toEqual([['widevine', 'clearkey']]);
    expect(viewing.playback.keySystem).toBe('widevine');
  });

  it('loads the player from a function, and the session while it does', async () => {
    const { channel, requests } = fakeChannel();
    const { player } = fakePlayer();
    let loaded = false;
    const viewing = start({
      channel,
      player: () => {
        expect(requests).toEqual([]);
        loaded = true;
        return Promise.resolve(player);
      },
    });
    expect(loaded).toBe(true);
    expect(requests.map((request) => request.path)).toEqual(['sessions']);
    await expect(viewing).resolves.toMatchObject({ playback: { keySystem: 'widevine' } });
  });

  it('says when the server issues none of the systems the viewer uses', async () => {
    const { channel } = fakeChannel({ systems: ['playready'] });
    const { player, asked } = fakePlayer();
    await expect(start({ channel, player })).rejects.toThrow(
      'the server issues none of the DRM systems the viewer uses (it issues playready)',
    );
    expect(asked).toEqual([]);
  });

  it('says when the device has none of them', async () => {
    const { channel } = fakeChannel();
    const { player } = fakePlayer([]);
    await expect(start({ channel, player })).rejects.toThrow(
      'this device has none of the DRM systems the viewer can use here (fairplay, widevine, clearkey)',
    );
  });

  it('opens the screen with the session’s keys, and sends its license requests to the module', async () => {
    const { channel, requests } = fakeChannel();
    const { player, opened } = fakePlayer();
    await start({ channel, player });
    const [{ keys }] = opened;
    expect(keys).toMatchObject({
      keyId: '00112233445566778899aabbccddeeff',
      initData: { cenc: 'cHNzaA==' },
    });

    const license = await keys.license(new Uint8Array([9]).buffer);
    expect(new Uint8Array(license)).toEqual(new Uint8Array([1, 2, 3]));
    expect(requests.at(-1)).toEqual({
      path: 'license?session=s1&system=widevine',
      method: 'POST',
      contentType: 'application/octet-stream',
    });
  });

  it('asks for FairPlay’s certificate once, and its frames in cbcs', async () => {
    const { channel, requests } = fakeChannel();
    const { player, opened } = fakePlayer(['fairplay']);
    const viewing = await start({ channel, player });
    const [{ keys }] = opened;
    await Promise.all([keys.certificate(), keys.certificate()]);
    expect(requests.filter((request) => request.path === 'fairplay.cer')).toHaveLength(1);

    await viewing.fetchFrame(toPageRef(4), { 'viewport.kind': 'width', 'viewport.width': '1024' });
    const frame = new URL(`https://module/${requests.at(-1)!.path}`);
    expect(Object.fromEntries(frame.searchParams)).toEqual({
      session: 's1',
      codec: 'h264',
      scheme: 'cbcs',
      'viewport.kind': 'width',
      'viewport.width': '1024',
    });
  });

  it('asks the other systems’ frames in cenc', async () => {
    const { channel, requests } = fakeChannel();
    const { player } = fakePlayer(['widevine']);
    const viewing = await start({ channel, player });
    await viewing.fetchFrame(toPageRef(1), {});
    expect(requests.at(-1)!.path).toMatch(/scheme=cenc/);
  });
});
