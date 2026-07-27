/**
 * `<epdf-render-layer>` — the Angular view of @embedpdf/plugin-render.
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
import { RenderToken } from '@embedpdf/plugin-render';
import { injectCapability, injectPage, injectSelector } from '@embedpdf/angular/runtime';

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
  // ONE tracked dependency: the raster's canonical identity — conformed
  // viewport + annotations flag + epoch (SCALE-OUT §2.1e identity law).
  // Inside a lattice rung, zoom changes don't move it: no refetch, no DOM
  // churn — the stage's CSS transform does the scaling. It changes exactly at
  // rung crossings and on CONFIRMED mutations (epoch bumps at commit, never
  // mid-gesture). Under `continuous` it embeds the exact scale — v2 behavior
  // byte-for-byte. The policy behind it is a document fact the kernel
  // materialized before publish, so the key is always computable.
  private readonly sourceKey = injectSelector(RenderToken, (c) =>
    c.renderSourceKey(this.page.pon, {
      scale: this.page.transform().renderScale,
      includeAnnotations: this.annotations(),
    }),
  );
  protected readonly src = signal<string | null>(null);

  constructor() {
    if (!isPlatformBrowser(inject(PLATFORM_ID))) return;
    effect((onCleanup) => {
      // Tracked reads — the effect's dependency set. `sourceKey` folds scale,
      // annotations, and the epoch into one identity; a stale scale read
      // inside the untracked body is harmless by construction (any scale in
      // this rung produces this key's canonical request).
      const render = this.render();
      this.sourceKey();
      const includeAnnotations = this.annotations();

      const controller = new AbortController();
      let revoke: (() => void) | undefined;
      onCleanup(() => {
        controller.abort();
        revoke?.();
      });

      untracked(() => {
        const scale = this.page.transform().renderScale;
        void (async () => {
          try {
            // The capability conforms this to the policy (lattice → ladder
            // width, continuous → this exact scale) and collapses same-key
            // asks in its raster store.
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
