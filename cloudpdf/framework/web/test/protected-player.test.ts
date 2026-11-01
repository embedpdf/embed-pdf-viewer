/**
 * Which DRM system the browser's player finds. Playing frames needs a browser's media stack and
 * a DRM system, which no test browser has: that's checked in real browsers.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserProtectedPlayer } from '../src';

/** A browser with these EME key systems, at these robustnesses; it remembers what it was asked. */
function browserWith(granted: Record<string, string>, userAgent = 'Mozilla/5.0 Chrome/141.0') {
  const asked: { keySystem: string; contentType: string | undefined }[] = [];
  vi.stubGlobal('navigator', {
    userAgent,
    requestMediaKeySystemAccess: (keySystem: string, configs: MediaKeySystemConfiguration[]) => {
      const contentType = configs[0].videoCapabilities?.[0]?.contentType;
      asked.push({ keySystem, contentType });
      if (!(keySystem in granted))
        return Promise.reject(new DOMException('no', 'NotSupportedError'));
      return Promise.resolve({
        keySystem,
        getConfiguration: () => ({
          videoCapabilities: [{ contentType, robustness: granted[keySystem] }],
        }),
      });
    },
  });
  return asked;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('the browser’s protected display player', () => {
  it('finds the first DRM system it’s asked for that the browser has, and asks no further', async () => {
    const asked = browserWith({ 'com.widevine.alpha': 'SW_SECURE_CRYPTO', 'org.w3.clearkey': '' });
    const playback = await browserProtectedPlayer().findPlayback([
      'fairplay',
      'widevine',
      'clearkey',
    ]);
    expect(playback).toMatchObject({
      keySystem: 'widevine',
      robustness: 'SW_SECURE_CRYPTO',
      codec: 'h264',
    });
    expect(asked.map((request) => request.keySystem)).toEqual([
      'com.apple.fps',
      'com.widevine.alpha',
    ]);
  });

  it('plays Widevine in VP9 in Firefox, whose decoder holds a lone H.264 frame back', async () => {
    const asked = browserWith(
      { 'com.widevine.alpha': '' },
      'Mozilla/5.0 Gecko/20100101 Firefox/144.0',
    );
    const playback = await browserProtectedPlayer().findPlayback(['widevine']);
    expect(playback?.codec).toBe('vp9');
    expect(asked[0].contentType).toBe('video/mp4; codecs="vp09.00.50.08"');
  });

  it('finds none in a browser without them, or without EME at all', async () => {
    browserWith({});
    await expect(
      browserProtectedPlayer().findPlayback(['fairplay', 'widevine']),
    ).resolves.toBeNull();
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0' });
    await expect(browserProtectedPlayer().findPlayback(['widevine'])).resolves.toBeNull();
  });
});
