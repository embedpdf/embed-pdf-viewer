/**
 * What a page link's anchor tells the plugins: the context a click or a key
 * follows the link with (the link plugin's `activate()`), and the link's own
 * PDF events (`/AA`): entering and leaving through the layer's hover pump,
 * the press, the release, focus and blur through the actions plugin's
 * `dispatch()`. Only a link that is an annotation has events of its own. The
 * plugins' types are mirrored structurally and their refs stay opaque, so
 * this package stays free of EmbedPDF imports.
 */

/** The events an anchor sends the actions plugin itself; entering and leaving go through the hover pump. */
export type LinkAnchorEvent = 'mouseDown' | 'mouseUp' | 'focus' | 'blur';

/** A link's fields these read: its `/A` tree, the annotation it is, and which hover trees it has. */
export interface LinkEventShape<Ref, Action = unknown, HoverEvents = unknown> {
  readonly activate?: Action;
  readonly ref?: Ref;
  readonly hoverEvents?: HoverEvents;
}

/** The link as the source of an actions-plugin event. */
export interface LinkActionSource<Ref, Page> {
  readonly kind: 'link';
  readonly annotation: Ref;
  readonly page: Page;
}

/** The actions plugin, as an anchor uses it. */
export interface LinkActionDispatcher<Ref, Page> {
  dispatch(trigger: {
    readonly scope: 'annotation';
    readonly event: LinkAnchorEvent;
    readonly ref: Ref;
    readonly page: Page;
    readonly source: LinkActionSource<Ref, Page>;
  }): unknown;
}

/** One link layer's hover pump (`createHoverPump` in the actions plugin's contract). */
export interface LinkHoverPump<Ref, Page, HoverEvents> {
  hover(
    target: {
      readonly ref: Ref;
      readonly page: Page;
      readonly source: LinkActionSource<Ref, Page>;
      readonly events: HoverEvents;
    } | null,
  ): void;
}

/**
 * The context a click or a key follows `link` with: its `/A` tree (the
 * actions plugin runs it instead of the target), the annotation it is, its
 * page, and the view it was followed in (a page destination moves that one).
 */
export function linkActivateContextOf<Ref, Action, Page, Stage>(
  link: LinkEventShape<Ref, Action>,
  page: Page,
  stage: Stage | null,
): { activate?: Action; ref?: Ref; page: Page; stage?: Stage } {
  return { activate: link.activate, ref: link.ref, page, ...(stage ? { stage } : {}) };
}

/**
 * Send `link`'s own event for a press, a release or a focus change: only for
 * a link that is an annotation, and only with the actions plugin.
 */
export function sendLinkEvent<Ref, Page>(
  actions: NoInfer<LinkActionDispatcher<Ref, Page>> | null,
  link: LinkEventShape<Ref>,
  page: Page,
  event: LinkAnchorEvent,
): void {
  if (!actions || !link.ref) return;
  const source: LinkActionSource<Ref, Page> = { kind: 'link', annotation: link.ref, page };
  void actions.dispatch({ scope: 'annotation', event, ref: link.ref, page, source });
}

/**
 * Tell the layer's hover pump the pointer entered `link`: only a link that is
 * an annotation with hover trees has enter and exit events. Leaving is
 * `pump.hover(null)`.
 */
export function hoverLink<Ref, Page, HoverEvents>(
  pump: NoInfer<LinkHoverPump<Ref, Page, HoverEvents>> | null,
  link: LinkEventShape<Ref, unknown, HoverEvents>,
  page: Page,
): void {
  if (!pump || !link.ref || !link.hoverEvents) return;
  pump.hover({
    ref: link.ref,
    page,
    source: { kind: 'link', annotation: link.ref, page },
    events: link.hoverEvents,
  });
}
