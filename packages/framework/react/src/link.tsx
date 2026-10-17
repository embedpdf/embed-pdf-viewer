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
import { useEffect, useMemo, useRef } from 'react';
import { ActionsToken, createHoverPump } from '@embedpdf/plugin-actions/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { LinkToken, type Link, type LinkCapability } from '@embedpdf/plugin-link';
// The layer paints anchors only while a navigation tool is active, and opens
// websites for the plugin: both host facts.
import { LinkToken as LinkHostToken } from '@embedpdf/plugin-link/contract/host';
import {
  hoverLink,
  isolatePointerDown,
  isModifiedClick,
  linkActivateContextOf,
  linkAnchorOf,
  navigableLinksOf,
  openExternalUri,
  sendLinkEvent,
} from '@embedpdf/web';
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
import { useStageToken } from './stage-scope';

/**
 * A link's anchor. A press inside it must not reach the Stage's native listener (it would start
 * the active tool's gesture, or end an edit as a click outside), so it stops with a native
 * listener on the anchor itself: React's own `onPointerDown` runs from the root, after the Stage
 * has already seen the press. The same listener sends the link's "mouse down" action.
 */
function LinkAnchor({
  onPress,
  ...props
}: { onPress: () => void } & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const ref = useRef<HTMLAnchorElement>(null);
  const press = useRef(onPress);
  press.current = onPress;
  useEffect(
    () => (ref.current ? isolatePointerDown(ref.current, () => press.current()) : undefined),
    [],
  );
  return <a ref={ref} {...props} />;
}

/**
 * Hand the link plugin this binding's website opener (`openExternalUri`)
 * while the component is mounted: an allowed address opens in a new tab,
 * anything else is refused and the plugin reports it.
 */
function useUriOpener(): void {
  const host = useOptionalCapability(LinkHostToken);
  useEffect(() => host?.registerUriOpener(openExternalUri), [host]);
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
  const visible = navigableLinksOf(items, editEnabled);
  if (!visible.length) return null;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {visible.map((item) => {
        // Its box, its label, and a native href only for a website with nothing chained after it.
        const { box, href, label } = linkAnchorOf(item, page.transform, (each) =>
          link.getLabel(each),
        );
        const context = linkActivateContextOf(item, page.ref, stage);
        const native = (
          <LinkAnchor
            onPress={() => sendLinkEvent(actions, item, page.ref, 'mouseDown')}
            href={href ?? undefined}
            target="_blank"
            rel="noopener noreferrer"
            role="link"
            tabIndex={0}
            title={label}
            aria-label={label}
            onClick={(event) => {
              // A modified click on a real href keeps the browser's own
              // behaviour (a background tab, a new window).
              if (href && isModifiedClick(event)) return;
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
            onPointerEnter={() => hoverLink(linkPump, item, page.ref)}
            onPointerLeave={() => linkPump?.hover(null)}
            onPointerUp={() => sendLinkEvent(actions, item, page.ref, 'mouseUp')}
            onFocus={() => sendLinkEvent(actions, item, page.ref, 'focus')}
            onBlur={() => sendLinkEvent(actions, item, page.ref, 'blur')}
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
