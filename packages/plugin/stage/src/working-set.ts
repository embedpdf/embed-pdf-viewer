/**
 * What this lens shows, told to the engine as the lens's working set
 * (`doc.setWorkingSet`): the engine ranks the jobs for those pages by it, and
 * keeps those pages parsed longest. Every lens tells its own, so a thumbnail
 * rail's small pages rank after the main view's.
 *
 * It comes from the pages the lens lays out (`listVisiblePages`):
 * - `visible`: a page with some of it on screen, with that part and its device
 *   pixels, which rank visible pages among themselves: the page the user looks
 *   at has the most;
 * - `near`: a page laid out just off screen (the scene's overscan), where the
 *   view goes next.
 */
import type { PluginContext, WorkingSetPage } from '@embedpdf/core';

import type { VisiblePage } from './contract';
import type { StageHostCapability } from './host-contract';
import type { StageState } from './model';

/** A lens's working set, from the pages it lays out. */
export function workingSetOf(pages: readonly VisiblePage[]): WorkingSetPage[] {
  return pages.map(({ ref, visibleRect, transform }) => {
    if (visibleRect.width <= 0 || visibleRect.height <= 0) {
      return { page: ref, role: 'near', pixels: 0 };
    }
    const pixels = visibleRect.width * visibleRect.height * transform.renderScale ** 2;
    return { page: ref, role: 'visible', visible: visibleRect, pixels: Math.round(pixels) };
  });
}

/**
 * Tells the engine what the lens shows, now and whenever it changes: once per
 * camera move, so at most once per input event while the camera moves.
 */
export function connectWorkingSet(
  ctx: PluginContext<StageState>,
  stage: Pick<StageHostCapability, 'listVisiblePages'>,
): void {
  let told = '';
  const tell = (shown: readonly VisiblePage[]) => {
    const pages = workingSetOf(shown);
    const key = keyOf(pages);
    if (key === told) return;
    told = key;
    ctx.doc.setWorkingSet(ctx.id, pages);
  };
  ctx.watch(() => stage.listVisiblePages(), tell);
  tell(stage.listVisiblePages());
}

/** A working set as one comparable string. */
function keyOf(pages: readonly WorkingSetPage[]): string {
  return pages
    .map(({ page, role, visible, pixels }) => {
      const part = visible
        ? `${Math.round(visible.x)},${Math.round(visible.y)},${Math.round(visible.width)},${Math.round(visible.height)}`
        : '';
      return `${page.objectNumber}:${role}:${pixels}:${part}`;
    })
    .join('|');
}
