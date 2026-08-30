/**
 * The React view of @embedpdf/plugin-link — the navigation plane's paint.
 *
 * One absolutely-positioned <a> per clickable link area, real anchors on
 * purpose: URIs get an `href` (middle-click, copy-link, status-bar preview
 * and keyboard focus for free), internal destinations activate through the
 * plugin (stage reveal). The layer stands down entirely while the active
 * tool doesn't enable `link-nav` — the annotation plane owns links then
 * (select / move / resize / retarget through the selection editor).
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-link';
import * as React from 'react';
import { useEffect } from 'react';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import {
  LinkToken,
  type LinkActivation,
  type LinkCapability,
  type LinkNavItem,
  type PdfLinkTarget,
} from '@embedpdf/plugin-link';
import { sanitizeExternalUri } from '@embedpdf/web';

import {
  shallowArray,
  useCapability,
  useOptionalSelector,
  usePage,
  useSelector,
} from './runtime';
import type { PageContextValue } from './runtime';

/**
 * Resolve a target through the plugin and PERFORM the `uri` outcome — the ONE
 * place in the codebase that turns a link target into a browser tab. The
 * plugin owns resolution (goto → stage reveal, policy, analytics) and stays
 * DOM-free; opening is this framework layer's job. Every click path — the nav
 * anchors below, the selection menu's "Open link", the style editor's "Go to
 * link" — goes through here, so none of them can drop the uri outcome again.
 */
export function openLinkTarget(link: LinkCapability, target: PdfLinkTarget): LinkActivation {
  const activation = link.activate(target);
  if (activation.outcome === 'uri') {
    const href = sanitizeExternalUri(activation.uri);
    if (href && typeof window !== 'undefined') window.open(href, '_blank', 'noopener,noreferrer');
  }
  return activation;
}

/** Content rect → view px (the page wrapper's own space) — the same idiom as
 *  the annotation and form layers: never re-derive `x * scale`. */
function boxOf(item: LinkNavItem, page: PageContextValue) {
  const tl = page.transform.toPixels({ x: item.rect.x, y: item.rect.y });
  const br = page.transform.toPixels({
    x: item.rect.x + item.rect.width,
    y: item.rect.y + item.rect.height,
  });
  return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y };
}

/** A human label for the hover tooltip. Apps with i18n render their own via
 *  `renderLink`; this is the sensible default. */
function labelOf(item: LinkNavItem): string {
  switch (item.target.kind) {
    case 'uri':
      return item.target.uri;
    case 'goto':
      return 'Go to destination';
    case 'named':
      return item.target.name;
    default:
      return 'Link';
  }
}

export interface LinkLayerProps {
  /** Wrap or replace a link's native anchor (badging, custom tooltips). */
  renderLink?: (args: {
    item: LinkNavItem;
    nativeComponent: React.ReactNode;
  }) => React.ReactNode | undefined;
}

export function LinkLayer({ renderLink }: LinkLayerProps = {}) {
  const page = usePage();
  const link = useCapability(LinkToken);
  const items = useSelector(LinkToken, (c) => c.linksOn(page.pon), shallowArray);
  const engaged = useSelector(LinkToken, (c) => c.engaged());
  // One owner per pixel: an ATTACHED link is a property of its parent — while
  // the active tool can edit annotations, the parent owns those pixels and
  // the anchor stands down (select/move/resize work; no tooltip, no swallowed
  // pointer). Standalone document links navigate under any link-nav tool.
  const editEnabled = useOptionalSelector(
    InteractionToken,
    (c) => c.activeTool()?.enables.has('annotation-edit') ?? false,
    false,
  );

  useEffect(() => {
    link.ensurePage(page.pon);
  }, [link, page.pon]);

  // An authoring tool is active → the annotation plane owns links (they're
  // plain editable rects there); no nav anchors, no swallowed pointer events.
  if (!engaged || !items.length) return null;
  const visible = editEnabled ? items.filter((i) => !i.attached) : items;
  if (!visible.length) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {visible.map((item) => {
        const box = boxOf(item, page);
        // Real href ONLY for sanitized external URIs; blocked schemes and
        // internal targets activate through the plugin instead.
        const href = item.target.kind === 'uri' ? sanitizeExternalUri(item.target.uri) : null;
        const native = (
          <a
            href={href ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            role="link"
            tabIndex={0}
            title={labelOf(item)}
            aria-label={labelOf(item)}
            onClick={(e) => {
              // Modified clicks and middle-clicks on a real href keep their
              // native browser behaviour (new tab / copy link).
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              // A plain left-click on a real href: let the anchor be an
              // anchor — native navigation, target=_blank, status bar. Only
              // non-href targets (goto / named / blocked schemes) route
              // through the plugin, whose uri outcome the opener PERFORMS
              // (the old code preventDefault-ed AND dropped the outcome, so
              // clicking a URL link did nothing at all).
              if (href) return;
              e.preventDefault();
              openLinkTarget(link, item.target);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openLinkTarget(link, item.target);
              }
            }}
            // Keep the hub out of it: a down inside the anchor must not reach
            // the Stage's native listener (same isolation idiom as FreeText).
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              left: box.left,
              top: box.top,
              width: box.width,
              height: box.height,
              cursor: 'pointer',
              pointerEvents: 'auto',
            }}
          />
        );
        const out = renderLink?.({ item, nativeComponent: native }) ?? native;
        return <React.Fragment key={item.id}>{out}</React.Fragment>;
      })}
    </div>
  );
}

export function useLink() {
  return useCapability(LinkToken);
}
