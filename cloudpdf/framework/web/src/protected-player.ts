/**
 * The browser's protected display player, for the plugin:
 * `protectedDisplayPlugin({ player: () => import('@cloudpdf/web').then((web) => web.browserProtectedPlayer()) })`.
 *
 * It plays what the plugin gives it: frames in two videos, with the keys of one viewing session,
 * through Encrypted Media Extensions and Media Source. The plugin decides which DRM system, which
 * frames and where they sit, and speaks to the server.
 *
 * Structurally `ProtectedPlayer` from `@cloudpdf/plugin-protected-display`, declared here so
 * this package stays dependency-free.
 */
import { accessTo, codecFor } from './protected-keys';
import { openScreen } from './protected-screen';

/** Structural twin of `KeySystemName` (`@cloudpdf/plugin-protected-display`). */
export type WebKeySystemName = 'fairplay' | 'widevine' | 'clearkey';

/** Structural twin of `FrameCodec`. */
export type WebFrameCodec = 'h264' | 'vp9';

/** Structural twin of `ProtectedPlayer`. */
export interface WebProtectedPlayer {
  findPlayback(keySystems: readonly WebKeySystemName[]): Promise<WebProtectedPlayback | null>;
}

/** Structural twin of `ProtectedPlayback`. */
export interface WebProtectedPlayback {
  readonly keySystem: WebKeySystemName;
  readonly robustness: string;
  readonly codec: WebFrameCodec;
  open(keys: WebProtectedKeys): Promise<WebProtectedScreen>;
}

/** Structural twin of `ProtectedKeys`. */
export interface WebProtectedKeys {
  readonly keyId: string;
  readonly initData: { readonly cenc: string };
  certificate(): Promise<ArrayBuffer>;
  license(request: ArrayBuffer): Promise<ArrayBuffer>;
  onProblem(message: string): void;
  readonly signal: AbortSignal;
}

/** Structural twin of `ProtectedScreen`: the box a page layer lent is an `HTMLElement`. */
export interface WebProtectedScreen {
  mount(host: HTMLElement | null): void;
  readonly page: WebFrameLayer;
  readonly sharp: WebFrameLayer;
  close(): void;
}

/** Structural twin of `FrameLayer`. */
export interface WebFrameLayer {
  load(key: string, frame: () => Promise<ArrayBuffer>): Promise<void>;
  show(key: string): Promise<void>;
  hide(): void;
  place(rect: WebBoxRect | null): void;
  redraw(): void;
  forget(stale: (key: string) => boolean): void;
}

/** A part of the box, in its pixels. */
export interface WebBoxRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** The browser's player: the first DRM system it's asked for that this browser has. */
export function browserProtectedPlayer(): WebProtectedPlayer {
  return {
    async findPlayback(keySystems) {
      for (const keySystem of keySystems) {
        const codec = codecFor(keySystem);
        const access = await accessTo(keySystem, codec);
        if (access === null) continue;
        return {
          keySystem,
          robustness: access.getConfiguration().videoCapabilities?.[0]?.robustness ?? '',
          codec,
          open: (keys) => openScreen(keySystem, access, codec, keys),
        };
      }
      return null;
    },
  };
}
