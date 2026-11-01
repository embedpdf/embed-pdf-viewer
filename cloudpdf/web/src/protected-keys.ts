/**
 * The DRM half of the protected display player: which key systems this browser has, and a
 * video's keys and licenses.
 *
 * Each video gets its keys from the same viewing session; a browser that won't let two videos
 * share one `MediaKeys` (Chrome, Firefox) gets a second license for the same key. The license
 * requests go to the plugin (`keys.license`), which sends them to the server.
 */
import type { WebFrameCodec, WebKeySystemName, WebProtectedKeys } from './protected-player';

/** What a video's source buffer is opened with, per codec. */
export const FRAME_MIME: Record<WebFrameCodec, string> = {
  h264: 'video/mp4; codecs="avc1.640033"',
  vp9: 'video/mp4; codecs="vp09.00.50.08"',
};

/** Each key system's name in EME, and the robustness asked for. */
const KEY_SYSTEMS: Record<
  WebKeySystemName,
  { readonly name: string; readonly robustness: string }
> = {
  fairplay: { name: 'com.apple.fps', robustness: '' },
  widevine: { name: 'com.widevine.alpha', robustness: 'SW_SECURE_CRYPTO' },
  clearkey: { name: 'org.w3.clearkey', robustness: '' },
};

/**
 * The codec a key system's frames show in here: VP9 for Widevine in Firefox, whose decoder holds
 * a lone H.264 frame back until more follow (a frame is a stream of one); H.264 everywhere else.
 */
export function codecFor(keySystem: WebKeySystemName): WebFrameCodec {
  return keySystem === 'widevine' && /Firefox\//.test(navigator.userAgent) ? 'vp9' : 'h264';
}

/** This browser's access to `keySystem` for frames in `codec`, or `null` where it hasn't it. */
export async function accessTo(
  keySystem: WebKeySystemName,
  codec: WebFrameCodec,
): Promise<MediaKeySystemAccess | null> {
  const { name, robustness } = KEY_SYSTEMS[keySystem];
  const contentType = FRAME_MIME[codec];
  const config: MediaKeySystemConfiguration =
    keySystem === 'fairplay'
      ? { initDataTypes: ['sinf', 'cenc'], videoCapabilities: [{ contentType }] }
      : {
          initDataTypes: [keySystem === 'clearkey' ? 'keyids' : 'cenc'],
          videoCapabilities: [{ contentType, robustness }],
          distinctiveIdentifier: 'optional',
          persistentState: 'optional',
          sessionTypes: ['temporary'],
        };
  try {
    return await navigator.requestMediaKeySystemAccess(name, [config]);
  } catch {
    // Not this one, or no EME at all (a page that isn't served over HTTPS).
    return null;
  }
}

/** How a video gets its keys from one viewing session. */
export interface VideoKeys {
  /**
   * Give `video` its keys: `share`'s, where the browser lets two videos use one `MediaKeys`,
   * else its own, with a license of its own. Returns the `MediaKeys` it got.
   */
  attach(video: HTMLVideoElement, share?: MediaKeys): Promise<MediaKeys>;
  close(): void;
}

export function videoKeysOf(
  keySystem: WebKeySystemName,
  access: MediaKeySystemAccess,
  keys: WebProtectedKeys,
): VideoKeys {
  const { onProblem, signal } = keys;
  const keySessions: MediaKeySession[] = [];
  const report = (error: unknown) => {
    if (!signal.aborted) onProblem(messageOf(error));
  };

  return {
    async attach(video, share) {
      if (share !== undefined) {
        try {
          await video.setMediaKeys(share);
          return share;
        } catch {
          // One MediaKeys per video in this browser: this one gets its own, and a license.
        }
      }
      const mediaKeys = await access.createMediaKeys();
      if (keySystem === 'fairplay') await mediaKeys.setServerCertificate(await keys.certificate());
      await video.setMediaKeys(mediaKeys);
      const keySession = mediaKeys.createSession('temporary');
      keySessions.push(keySession);
      keySession.addEventListener('message', (event) => {
        keys
          .license(event.message)
          .then((license) => keySession.update(license))
          .catch(report);
      });
      if (keySystem === 'fairplay') {
        // Safari asks with what the first frame carries (its 'sinf').
        let asked = false;
        video.addEventListener('encrypted', (event) => {
          if (asked || event.initData === null) return;
          asked = true;
          keySession.generateRequest(event.initDataType, event.initData).catch(report);
        });
      } else if (keySystem === 'clearkey') {
        const kids = JSON.stringify({ kids: [base64url(hexBytes(keys.keyId))] });
        await keySession.generateRequest('keyids', new TextEncoder().encode(kids));
      } else {
        // Before the first frame: the license is on its way while the frame is made.
        await keySession.generateRequest('cenc', base64Bytes(keys.initData.cenc));
      }
      return mediaKeys;
    },

    close() {
      for (const keySession of keySessions) keySession.close().catch(() => {});
    },
  };
}

export const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

function hexBytes(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(2 * i, 2 * i + 2), 16);
  return bytes;
}

function base64Bytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
