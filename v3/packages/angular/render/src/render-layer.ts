/**
 * `<epdf-render-layer>` — the Angular view of @embedpdf-x/plugin-render.
 *
 * Paints a page to an `<img>` from the engine's ENCODED image() (identical for
 * local & cloud). Abortable (cancels when the camera moves / the layer is
 * destroyed) and leak-free (revokes the object URL). React's useEffect deps
 * become `effect()` auto-tracking: scale, the annotations input, and the
 * render epoch are the tracked reads; everything else is untracked.
 */
import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  PLATFORM_ID,
  signal,
  untracked,
} from '@angular/core';
import { RenderToken } from '@embedpdf-x/plugin-render';
import { injectCapability, injectPage, injectSelector } from '@embedpdf-x/angular/runtime';

@Component({
  selector: 'epdf-render-layer',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img
      alt=""
      draggable="false"
      [attr.src]="src()"
      style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;"
    />
  `,
})
export class EpdfRenderLayer {
  /**
   * Bake annotations into the page bitmap (default true). Pass false when an
   * annotation layer owns annotation rendering, so they aren't drawn twice.
   */
  readonly annotations = input(true);

  private readonly page = injectPage();
  private readonly render = injectCapability(RenderToken);
  // Refetch when a CONFIRMED mutation (own or a collaborator's) changes what
  // this render would paint — an annotation moved, a checkbox ticked. Bumps at
  // commit, never mid-gesture; annotation-free renders subscribe to nothing.
  private readonly epoch = injectSelector(RenderToken, (c) =>
    c.renderEpoch(this.page.pon, this.annotations()),
  );
  protected readonly src = signal<string | null>(null);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect((onCleanup) => {
      // Tracked reads — the effect's dependency set, exactly React's deps array.
      const render = this.render();
      const scale = this.page.transform().renderScale;
      const includeAnnotations = this.annotations();
      this.epoch();

      const controller = new AbortController();
      let revoke: (() => void) | undefined;
      onCleanup(() => {
        controller.abort();
        revoke?.();
      });

      untracked(() => {
        void (async () => {
          try {
            // Render at the transform's exact device scale — width pinned,
            // height the engine's derived value — so the bitmap matches its box
            // 1:1 (no blur), with dpr already folded in. No `* dpr` guesswork.
            const image = await render.renderPage(this.page.pon, {
              scale,
              includeAnnotations,
              signal: controller.signal,
            });
            const objectUrl = await image.objectUrl(controller.signal);
            if (controller.signal.aborted) {
              objectUrl.revoke();
              return;
            }
            revoke = objectUrl.revoke;
            this.src.set(objectUrl.url);
          } catch {
            /* aborted (camera moved / destroyed) or render failed */
          }
        })();
      });
    });
  }
}
