/**
 * Starting to view a document as protected video: the viewing session, the DRM system, and the
 * player's screen with the session's keys.
 *
 * The viewing session (`POST sessions`) gives one content key per viewer and document, and says
 * which systems the server issues licenses for. Of those the app allows, the player takes the
 * first the device has, best protection first. The player loads while the session starts.
 */
import type { ModuleChannel } from '@cloudpdf/engine';
import type { PageRef } from '@embedpdf/core';

import type {
  KeySystemName,
  ProtectedPlayback,
  ProtectedPlayer,
  ProtectedPlayerSource,
  ProtectedScreen,
} from '../contract';
import { createModuleRoutes } from './routes';

/**
 * Best protection first. FairPlay is the one Safari has; Widevine the one Chrome, Edge and
 * Firefox have. Both keep the frames off screenshots, recordings and shared screens. PlayReady,
 * which Edge has too, isn't used: Windows draws its paused frames at a stale size and turn, so a
 * zoom or a turn shows black around an old picture. Clear Key protects nothing: a server issues
 * it for tests only.
 */
const KEY_SYSTEMS: readonly KeySystemName[] = ['fairplay', 'widevine', 'clearkey'];

export interface ViewingOptions {
  readonly channel: ModuleChannel;
  readonly player: ProtectedPlayerSource;
  /** The DRM systems the app allows (the `keySystems` setting). */
  readonly keySystems: readonly KeySystemName[];
  /** Something went wrong after the start: a license refused, a frame the device won't play. */
  onProblem(message: string): void;
  readonly signal: AbortSignal;
}

/** A document being viewed: the DRM system that plays it, its screen, and its frames. */
export interface Viewing {
  readonly playback: ProtectedPlayback;
  readonly screen: ProtectedScreen;
  /** A frame of `page`, in the playback's codec and scheme: `query` says which, at what size. */
  fetchFrame(page: PageRef, query: Readonly<Record<string, string>>): Promise<ArrayBuffer>;
}

export async function startViewing(options: ViewingOptions): Promise<Viewing> {
  const { onProblem, signal } = options;
  const routes = createModuleRoutes(options.channel, signal);
  const [player, session] = await Promise.all([playerOf(options.player), routes.startSession()]);

  const wanted = KEY_SYSTEMS.filter(
    (name) => options.keySystems.includes(name) && session.systems.includes(name),
  );
  if (wanted.length === 0) {
    throw new Error(
      `the server issues none of the DRM systems the viewer uses (it issues ${session.systems.join(', ') || 'none'})`,
    );
  }
  const playback = await player.findPlayback(wanted);
  if (playback === null) {
    throw new Error(
      `this device has none of the DRM systems the viewer can use here (${wanted.join(', ')})`,
    );
  }

  let certificate: Promise<ArrayBuffer> | null = null;
  const screen = await playback.open({
    keyId: session.keyId,
    initData: session.initData,
    certificate: () => (certificate ??= routes.certificate()),
    license: (request) => routes.license(session.session, playback.keySystem, request),
    onProblem,
    signal,
  });
  // FairPlay decrypts cbcs only; the others take cenc.
  const scheme = playback.keySystem === 'fairplay' ? 'cbcs' : 'cenc';
  return {
    playback,
    screen,
    fetchFrame: (page, query) =>
      routes.frame(page, { session: session.session, codec: playback.codec, scheme, ...query }),
  };
}

async function playerOf(source: ProtectedPlayerSource): Promise<ProtectedPlayer> {
  return typeof source === 'function' ? source() : source;
}
