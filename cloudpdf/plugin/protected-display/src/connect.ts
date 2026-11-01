/**
 * As it connects, the plugin decides whether this document's pages show as protected video, and
 * if so takes the page layout and the pictures over before anything is drawn.
 *
 * Every document plugin connects before the document shows, and this decides without waiting
 * for anything (`cloudDocument()` and `allows()` answer at once). So a protected document's
 * pages are never drawn as pictures first, nor laid out as a scroll of every page: each page
 * layer lends its box from its first layout. The player loads after that, and its screen moves
 * into the box of the page on screen.
 */
import { cloudDocument, type ModuleChannel } from '@cloudpdf/engine';
import { encodePageKey } from '@embedpdf/core';
import { RenderToken } from '@embedpdf/plugin-render/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract/host';

import type { ProtectedPlayerSource } from './contract';
import { fail, startShowing, turnOff } from './model';
import type { ProtectedDisplayContext } from './services/context';
import { createDisplay, type Display, type LentPage } from './services/display';
import { messageOf } from './services/routes';
import { startViewing } from './services/viewing';

/** The server module's id, and who holds the page layout. */
const MODULE = 'protected-display';
/**
 * How far in a protected page zooms: 500%. A video is drawn as one surface the size it shows on
 * screen, not in tiles like a picture, and past this a page's is more than older graphics chips
 * hold (8,192 pixels a side on a screen scaled 125% or more): the video turns black.
 */
const MAX_ZOOM = 5;

export function connectProtectedDisplay(ctx: ProtectedDisplayContext): void {
  const channel = cloudDocument(ctx.doc)?.module(MODULE) ?? null;
  if (channel === null) return ctx.state.update(() => turnOff('local-engine'));
  if (ctx.allows('doc.render')) return ctx.state.update(() => turnOff('may-render'));
  if (!ctx.allows('protected-display.view')) return ctx.state.update(() => turnOff('not-allowed'));
  const player = ctx.settings().get().player;
  if (player === null) {
    console.warn(
      "[protected-display] this user sees the pages only as protected video, and the plugin has no player: pass protectedDisplayPlugin({ player: () => import('@cloudpdf/web').then((web) => web.browserProtectedPlayer()) })",
    );
    return ctx.state.update(() => turnOff('no-player'));
  }
  protect(ctx, channel, player);
}

/** Show this document's pages as protected video, from now until it closes. */
function protect(
  ctx: ProtectedDisplayContext,
  channel: ModuleChannel,
  player: ProtectedPlayerSource,
) {
  const stage = ctx.get(StageToken);
  const render = ctx.get(RenderToken);

  // One page at a time: the screen shows the page on screen with two videos, and a scroll
  // through every page would take a decoder and a license per page. No further in than
  // MAX_ZOOM, or less where the app says so.
  const maxZoom = Math.min(stage.getSettings().maxZoom, MAX_ZOOM);
  stage.lockSettings({ settings: { flow: 'paged', spread: 'none', maxZoom }, by: MODULE });

  // The boxes the main view's page layers lend, by page key.
  const lent = new Map<string, LentPage>();
  let display: Display | null = null;
  const onScreen = (): LentPage | null => {
    const page = stage.getCurrentPage();
    return page === null ? null : (lent.get(encodePageKey(page)) ?? null);
  };
  const follow = () => display?.show(onScreen());

  const mainView = stage.getLensId();
  ctx.cleanup(
    render.handOverPictures({
      paints: (view) => view === mainView,
      paint(host, page) {
        const box: LentPage = { host, page };
        lent.set(encodePageKey(page.ref), box);
        follow();
        return {
          update(next) {
            box.page = next;
          },
          destroy() {
            const key = encodePageKey(box.page.ref);
            if (lent.get(key) === box) lent.delete(key);
            display?.forget(box);
            follow();
          },
        };
      },
    }),
  );
  ctx.cleanup(stage.onPageChanged(follow));
  ctx.cleanup(stage.onCameraChanged(() => display?.moving()));
  // Frames hold the page's content only: annotations and fields are the viewer's, on top.
  ctx.cleanup(
    render.onInvalidated(({ pages, scope }) => {
      if (scope === 'content') display?.invalidate(pages);
    }),
  );

  // A start that ends, or a problem that comes, after the document closed says nothing.
  let closed = false;
  ctx.cleanup(() => {
    closed = true;
  });
  const failed = (message: string) => {
    if (closed) return;
    console.warn(`[protected-display] ${message}`);
    ctx.state.update(() => fail(message));
  };

  ctx
    .acquire(
      async (lifetime) => {
        const viewing = await startViewing({
          channel,
          player,
          keySystems: ctx.settings().get().keySystems,
          onProblem: failed,
          signal: lifetime,
        });
        return {
          playback: viewing.playback,
          display: createDisplay({
            screen: viewing.screen,
            fetchFrame: viewing.fetchFrame,
            clock: ctx.clock,
            visibleRectOf: (page) =>
              stage
                .listVisiblePages()
                .find((visible) => encodePageKey(visible.ref) === encodePageKey(page))
                ?.visibleRect ?? null,
            onProblem: failed,
            signal: lifetime,
          }),
        };
      },
      (started) => started.display.close(),
    )
    .then(
      (started) => {
        display = started.display;
        ctx.state.update(() => startShowing(started.playback));
        follow();
      },
      (error: unknown) => failed(messageOf(error)),
    );
}
