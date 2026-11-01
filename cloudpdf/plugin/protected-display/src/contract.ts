/**
 * What the protected display plugin says about itself (whether a document's pages show as
 * protected video, and its settings), and what it needs from the host: a player for the frames.
 */
import type { DeepPartial, SettingsApi } from '@embedpdf/core';
import type { Rect } from '@embedpdf/plugin-stage/contract/host';

declare module '@embedpdf/core' {
  interface PluginPermissions {
    /** See the pages as protected video frames, from the protected display server module. */
    'protected-display.view': true;
  }
}

/** A DRM system, as the protected display server module names it. */
export type KeySystemName = 'fairplay' | 'widevine' | 'clearkey';

/** A codec the server makes frames in. */
export type FrameCodec = 'h264' | 'vp9';

/** Whether a document's pages show as protected video, and how far that got. */
export type ProtectedDisplayStatus =
  /**
   * Not protected: on the local engine, which has no server module (`local-engine`), for a user
   * who may render the pages (`may-render`), or one without `protected-display.view`
   * (`not-allowed`); the render plugin shows the pages then. Or the app gave no `player`
   * (`no-player`), and nothing shows them.
   */
  | {
      readonly kind: 'off';
      readonly reason: 'local-engine' | 'may-render' | 'not-allowed' | 'no-player';
    }
  /** Protected: the player is loading, or starting the viewing session and its license. */
  | { readonly kind: 'starting' }
  /** Protected, and the pages show with `keySystem`, at the `robustness` the device granted. */
  | { readonly kind: 'showing'; readonly keySystem: KeySystemName; readonly robustness: string }
  /** Protected, but the pages can't show: no DRM system the device and the server share, a refusal. */
  | { readonly kind: 'failed'; readonly message: string };

// ── the player ──────────────────────────────────────────────────────────────

/**
 * What plays the frames: the host's video and DRM, the way `HostPrinter` is its print dialog. A
 * browser passes `browserProtectedPlayer()` from `@cloudpdf/web`; a native app passes one on its
 * platform's video and DRM. The plugin decides what shows (the DRM system, which frames, where)
 * and speaks to the server; the player plays what it's given.
 *
 * `Host` is the box a page layer lends (`PicturePainter`): an `HTMLElement` on the web.
 */
export interface ProtectedPlayer<Host = unknown> {
  /**
   * The first of `keySystems`, in their order, this device plays protected frames with, or `null`
   * when it has none of them.
   */
  findPlayback(keySystems: readonly KeySystemName[]): Promise<ProtectedPlayback<Host> | null>;
}

/** A DRM system this device has, and how it plays frames with it. */
export interface ProtectedPlayback<Host = unknown> {
  readonly keySystem: KeySystemName;
  /** The robustness the device granted (`'SW_SECURE_CRYPTO'`, or `''`). */
  readonly robustness: string;
  /** The codec it shows a lone frame in. */
  readonly codec: FrameCodec;
  /** Start playing frames, with one viewing session's keys. */
  open(keys: ProtectedKeys): Promise<ProtectedScreen<Host>>;
}

/** One viewing session's keys, and how the player reaches the server for them. */
export interface ProtectedKeys {
  /** The content key's id, in hex. */
  readonly keyId: string;
  /** Base64: the `pssh` boxes a cenc frame carries, as the server sent them. */
  readonly initData: { readonly cenc: string };
  /** The server's FairPlay certificate, which FairPlay needs before its first license request. */
  certificate(): Promise<ArrayBuffer>;
  /** One license round trip: the device's request to the server, and the license back. */
  license(request: ArrayBuffer): Promise<ArrayBuffer>;
  /** Something went wrong after the start: a license refused, a frame the device won't play. */
  onProblem(message: string): void;
  /** The document's lifetime: the player stops asking when it aborts. */
  readonly signal: AbortSignal;
}

/**
 * Two layers of frames in one box, which moves into the box of the page on screen: the page
 * frame, and the sharp frame over it. Nothing shows until a layer shows a frame.
 */
export interface ProtectedScreen<Host = unknown> {
  /** Move into `host`, a box a page layer lent, or out of every box (`null`). */
  mount(host: Host | null): void;
  /** The page frame: the whole page, filling the box. */
  readonly page: FrameLayer;
  /** The sharp frame: the part on screen, where `place()` puts it. */
  readonly sharp: FrameLayer;
  close(): void;
}

/** One layer of frames (a video, on the web). A frame shows again by its key. */
export interface FrameLayer {
  /** Have frame `key`: `frame()` gives its bytes, an init segment and one fragment, the first time. */
  load(key: string, frame: () => Promise<ArrayBuffer>): Promise<void>;
  /**
   * Show frame `key`, loaded: resolves once it's on screen. A hidden layer shows then, unless
   * `hide()` or another `show()` came first.
   */
  show(key: string): Promise<void>;
  /** Hide the layer at once. */
  hide(): void;
  /** Where the layer sits, in the box's pixels (`PageTransform.toPixels`); `null` fills the box. */
  place(rect: Rect | null): void;
  /** Draw the frame on screen again: graphics may drop a paused video that changed size. */
  redraw(): void;
  /** Drop the frames whose key `stale` matches: they're loaded again when next needed. */
  forget(stale: (key: string) => boolean): void;
}

/**
 * The player, or a function that gives one: called when a document's pages first show as
 * protected video, so a viewer that never protects never loads it.
 */
export type ProtectedPlayerSource =
  | ProtectedPlayer
  | (() => ProtectedPlayer | Promise<ProtectedPlayer>);

// ── settings ────────────────────────────────────────────────────────────────

/**
 * The protected display plugin's settings. Both are read when a document's pages first show as
 * protected video.
 */
export interface ProtectedDisplaySettings {
  /**
   * The DRM systems the player may use. Of those the device and the server both have, it takes
   * FairPlay (Safari), then Widevine (Chrome, Edge, Firefox), then Clear Key, which protects
   * nothing: a server issues it for tests only.
   */
  readonly keySystems: readonly KeySystemName[];
  /**
   * What plays the frames. A browser passes `browserProtectedPlayer()` from `@cloudpdf/web`, best
   * as a function that imports it:
   *
   * ```ts
   * protectedDisplayPlugin({
   *   player: () => import('@cloudpdf/web').then((web) => web.browserProtectedPlayer()),
   * })
   * ```
   *
   * Without one the plugin stays off (`no-player`), and a protected user sees no pages.
   */
  readonly player: ProtectedPlayerSource | null;
}

export const PROTECTED_DISPLAY_DEFAULTS: ProtectedDisplaySettings = {
  keySystems: ['fairplay', 'widevine', 'clearkey'],
  player: null,
};

export type ProtectedDisplayConfig = DeepPartial<ProtectedDisplaySettings>;

// ── the capability ──────────────────────────────────────────────────────────

export interface ProtectedDisplayCapability extends SettingsApi<ProtectedDisplaySettings> {
  /** Whether this document's pages show as protected video, and how far that got. */
  getStatus(): ProtectedDisplayStatus;
}

export { ProtectedDisplayToken } from './token';
