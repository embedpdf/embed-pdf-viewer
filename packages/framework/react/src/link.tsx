/**
 * The React view of @embedpdf/plugin-link — the navigation plane's paint.
 *
 * One absolutely-positioned <a> per clickable link area, real anchors on
 * purpose: URIs get an `href` (middle-click, copy-link, status-bar preview
 * and keyboard focus for free). A click or a key follows the link through
 * the plugin's `activate()`, so every way of following one fires
 * `onActivated`; the plugin opens websites through the opener this binding
 * registers. The layer stands down entirely while the active tool doesn't
 * enable `link-nav` — the annotation plane owns links then (select / move /
 * resize / retarget through the selection editor).
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-link';
import * as React from 'react';
import { useEffect, useMemo } from 'react';
import { ActionsToken, createHoverPump } from '@embedpdf/plugin-actions/contract';
import type { ActionSource, PdfAnnotationEventKind } from '@embedpdf/plugin-actions/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import {
  LinkToken,
  type Link,
  type LinkActivateContext,
  type LinkCapability,
} from '@embedpdf/plugin-link';
// The layer paints anchors only while a navigation tool is active, and opens
// websites for the plugin: both host facts.
import { LinkToken as LinkHostToken } from '@embedpdf/plugin-link/contract/host';
import { sanitizeExternalUri } from '@embedpdf/web';
import type { EventHook } from '@embedpdf/core';

import {
  shallowArray,
  useCapability,
  useCapabilityEvent,
  useOptionalCapability,
  useOptionalSelector,
  usePage,
  useSelector,
} from './runtime';
import type { PageContextValue } from './runtime';
import { useStageToken } from './stage-scope';

/**
 * The one place a link target becomes a browser tab: an allowed address
 * (`http`, `https`, `mailto`, `tel`) opens in a new tab, anything else is
 * refused and the plugin reports it. Called inside `activate()`, so the
 * user's click is still the gesture that opens the tab.
 */
function openExternalUri(uri: string): boolean {
  const href = sanitizeExternalUri(uri);
  if (!href || typeof window === 'undefined') return false;
  window.open(href, '_blank', 'noopener,noreferrer');
  return true;
}

/** Hand the link plugin this binding's website opener while the component is mounted. */
function useUriOpener(): void {
  const host = useOptionalCapability(LinkHostToken);
  useEffect(() => host?.registerUriOpener(openExternalUri), [host]);
}

/** Content rect → view px (the page wrapper's own space) — the same idiom as
 *  the annotation and form layers: never re-derive `x * scale`. */
function boxOf(item: Link, page: PageContextValue) {
  const tl = page.transform.toPixels({ x: item.bounds.x, y: item.bounds.y });
  const br = page.transform.toPixels({
    x: item.bounds.x + item.bounds.width,
    y: item.bounds.y + item.bounds.height,
  });
  return { left: tl.x, top: tl.y, width: br.x - tl.x, height: br.y - tl.y };
}

/** What `renderLink` receives for each link. */
export interface LinkRenderProps {
  /** The link: its `id`, its `bounds` on the page and its `target`. */
  link: Link;
  /** The layer's own clickable area: wrap it to keep what a click does. */
  native: React.ReactNode;
}

export interface LinkLayerProps {
  /**
   * Draw a link yourself, usually around `native`. Return `undefined` for a
   * link you don't want to change.
   */
  renderLink?: (props: LinkRenderProps) => React.ReactNode | undefined;
}

export function LinkLayer({ renderLink }: LinkLayerProps = {}) {
  const page = usePage();
  const link = useCapability(LinkToken);
  useUriOpener();
  // A page destination moves the view this page is shown in.
  const stage = useOptionalCapability(useStageToken());
  // The link plane's /AA event feed: links are behavior-inert to the
  // annotation plane's hover feed while navigable (their pixels are these
  // anchors), so E/X/D/U/Fo/Bl can only fire from here. One shared pump per
  // layer — crossing layers still orders Exit before Enter because both
  // sides submit synchronously in DOM event order.
  const actions = useOptionalCapability(ActionsToken);
  const linkPump = useMemo(() => (actions ? createHoverPump(actions.dispatch) : null), [actions]);
  const items = useSelector(LinkToken, (link) => link.listLinks(page.ref), shallowArray);
  const engaged = useSelector(LinkHostToken, (link) => link.isNavigationEngaged());
  // One owner per pixel: an attached link is a property of its parent — while
  // the active tool can edit annotations, the parent owns those pixels and
  // the anchor stands down (select/move/resize work; no tooltip, no swallowed
  // pointer). Standalone document links navigate under any link-nav tool.
  const editEnabled = useOptionalSelector(
    InteractionToken,
    (interaction) => interaction.activeToolEnables('annotation-edit'),
    false,
  );

  useEffect(() => {
    void link.ensureLoaded(page.ref);
  }, [link, page.ref]);

  // An authoring tool is active → the annotation plane owns links (they're
  // plain editable rects there); no nav anchors, no swallowed pointer events.
  if (!engaged || !items.length) return null;
  const visible = editEnabled ? items.filter((i) => !i.attached) : items;
  if (!visible.length) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {visible.map((item) => {
        const box = boxOf(item, page);
        // Real href only for a chain-free sanitized external URI; blocked
        // schemes, internal targets, and chain-bearing trees (/Next after the
        // URI) activate through the plugin instead — a native navigation
        // would perform the first action and silently drop the rest.
        const chained = (item.activate?.root?.next.length ?? 0) > 0;
        const href =
          item.target.kind === 'uri' && !chained ? sanitizeExternalUri(item.target.uri) : null;
        const context: LinkActivateContext = {
          activate: item.activate,
          ref: item.ref,
          page: page.ref,
          ...(stage ? { stage } : {}),
        };
        const linkSource: ActionSource | null = item.ref
          ? { kind: 'link', annotation: item.ref, page: page.ref }
          : null;
        const notify = (event: Exclude<PdfAnnotationEventKind, 'cursorEnter' | 'cursorExit'>) => {
          if (!actions || !item.ref || !linkSource) return;
          void actions.dispatch({
            scope: 'annotation',
            event,
            ref: item.ref,
            page: page.ref,
            source: linkSource,
          });
        };
        const native = (
          <a
            href={href ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            role="link"
            tabIndex={0}
            title={link.getLabel(item)}
            aria-label={link.getLabel(item)}
            onClick={(event) => {
              // A modified click on a real href keeps the browser's own
              // behaviour (a background tab, a new window).
              if (href && (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) {
                return;
              }
              // Every other click follows the link through the plugin, which
              // opens a website through this binding's opener.
              event.preventDefault();
              link.activate(item, context);
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                link.activate(item, context);
              }
            }}
            onPointerEnter={() => {
              if (!linkPump || !item.ref || !item.hoverEvents) return;
              linkPump.hover({
                ref: item.ref,
                page: page.ref,
                ...(linkSource ? { source: linkSource } : {}),
                events: item.hoverEvents,
              });
            }}
            onPointerLeave={() => linkPump?.hover(null)}
            onPointerUp={() => notify('mouseUp')}
            onFocus={() => notify('focus')}
            onBlur={() => notify('blur')}
            // Keep the hub out of it: a down inside the anchor must not reach
            // the Stage's native listener (same isolation idiom as FreeText).
            onPointerDown={(event) => {
              event.stopPropagation();
              notify('mouseDown');
            }}
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
        const drawn = renderLink?.({ link: item, native }) ?? native;
        return <React.Fragment key={item.id}>{drawn}</React.Fragment>;
      })}
    </div>
  );
}

/**
 * The link capability (`listLinks`, `activate`, …) for app code. While a
 * component uses it, `activate()` opens a website in a new tab.
 */
export function useLink(): LinkCapability {
  useUriOpener();
  return useCapability(LinkToken);
}

/** Subscribe to one link event for the mounted lifetime: `useLinkEvent((link) => link.onActivated, handler)`. */
export function useLinkEvent<T>(
  select: (link: LinkCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(LinkToken, select, handler);
}
