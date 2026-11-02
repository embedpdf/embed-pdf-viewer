/**
 * A page's loading state, over the page: a spinner while its picture is slow to arrive, and a
 * short message when it can't arrive. Nothing while a picture comes quickly: the render plugin
 * turns `slow` on only after `slowAfterMs`, so a page that shows at once never flashes one, and
 * getting sharper or redrawing after a change never counts as loading.
 *
 * It sits in the middle of the part of the page on screen, upright however the page is turned,
 * and never takes a click. Restyle it, or hide it, with its parts: `page-loading`, `page-error`.
 */
import { useT } from '@embedpdf/react/i18n';
import { usePictureState } from '@embedpdf/react/render';
import { usePage } from '@embedpdf/react/runtime';
import type { CSSProperties } from 'react';

export function PageLoading({ small = false }: { small?: boolean }) {
  const t = useT();
  const page = usePage();
  const { status, slow } = usePictureState();
  const waiting = status === 'loading' && slow;
  const failed = status === 'error' || status === 'forbidden';
  if (!waiting && !failed) return null;

  // The middle of the part on screen, in the page wrapper's pixels (before its turn).
  const { viewScale, rotation } = page.transform;
  const visible = page.getViewDemand?.().visibleRect;
  const center =
    visible && visible.width > 0 && visible.height > 0
      ? {
          x: (visible.x + visible.width / 2) * viewScale,
          y: (visible.y + visible.height / 2) * viewScale,
        }
      : { x: page.transform.contentWidth / 2, y: page.transform.contentHeight / 2 };
  const placed: CSSProperties = {
    position: 'absolute',
    left: center.x,
    top: center.y,
    transform: `translate(-50%, -50%) rotate(${-rotation}deg)`,
    pointerEvents: 'none',
  };

  if (waiting) {
    const size = small ? 'h-5 w-5' : 'h-8 w-8';
    return (
      <div
        part="page-loading"
        role="status"
        aria-label={t('demo.pageLoading', { params: { page: page.pageIndex + 1 } })}
        className={`border-border-subtle border-t-accent ${size} rounded-full border-2 motion-safe:animate-spin`}
        style={placed}
      />
    );
  }
  if (small) return null; // a thumbnail is too small for words: the main view says it
  return (
    <p
      part="page-error"
      role="status"
      className="text-fg-muted m-0 max-w-[16rem] text-center text-sm"
      style={placed}
    >
      {t(status === 'forbidden' ? 'demo.pageForbidden' : 'demo.pageError')}
    </p>
  );
}
