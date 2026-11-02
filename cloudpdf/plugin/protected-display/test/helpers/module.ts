/**
 * The protected display module's routes, faked: a channel that answers like the module, and a
 * player that has the DRM systems the test gives it.
 */
import type { ModuleChannel } from '@cloudpdf/engine';

import type {
  KeySystemName,
  ProtectedKeys,
  ProtectedPlayback,
  ProtectedPlayer,
} from '../../src/contract';
import { fakeScreen, type FakeScreen } from './fakes';

/** A request the channel got. */
export interface ChannelRequest {
  readonly path: string;
  readonly method: string;
  readonly contentType: string | null;
}

/** A channel to the module: sessions for these systems, or refused with `refuse`. */
export function fakeChannel({
  systems = ['fairplay', 'widevine', 'clearkey'],
  refuse,
}: { systems?: readonly string[]; refuse?: { status: number; body: string } } = {}) {
  const requests: ChannelRequest[] = [];
  const channel: ModuleChannel = {
    fetch: (path: string, init?: RequestInit) => {
      requests.push({
        path,
        method: init?.method ?? 'GET',
        contentType: new Headers(init?.headers).get('content-type'),
      });
      if (refuse) return Promise.resolve(new Response(refuse.body, { status: refuse.status }));
      if (path === 'sessions') {
        return Promise.resolve(
          Response.json({
            session: 's1',
            keyId: '00112233445566778899aabbccddeeff',
            expiresAt: '2026-11-01T13:00:00Z',
            initData: { cenc: 'cHNzaA==' },
            systems,
          }),
        );
      }
      return Promise.resolve(new Response(new Uint8Array([1, 2, 3])));
    },
  } as ModuleChannel;
  return { channel, requests };
}

/** A player with these DRM systems, which remembers what it was asked and given. */
export function fakePlayer(has: readonly KeySystemName[] = ['widevine', 'clearkey']) {
  const asked: (readonly KeySystemName[])[] = [];
  const opened: { keySystem: KeySystemName; keys: ProtectedKeys; screen: FakeScreen }[] = [];
  const player: ProtectedPlayer = {
    async findPlayback(keySystems) {
      asked.push(keySystems);
      const keySystem = keySystems.find((name) => has.includes(name));
      if (keySystem === undefined) return null;
      const playback: ProtectedPlayback = {
        keySystem,
        robustness: keySystem === 'widevine' ? 'SW_SECURE_CRYPTO' : '',
        codec: 'h264',
        async open(keys) {
          const screen = fakeScreen();
          opened.push({ keySystem, keys, screen });
          return screen;
        },
      };
      return playback;
    },
  };
  return { player, asked, opened };
}
