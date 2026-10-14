<!--
  The links on one page: one absolutely placed `<a>` per clickable area. Real anchors on purpose:
  a website gets an `href`, so a middle click, "copy link", the status-bar preview and keyboard
  focus work as in any page. A click or a key follows the link through the plugin's `activate()`,
  so every way of following one fires `onActivated`; the plugin opens websites through the opener
  this binding registers.

  The layer stands down while the active tool doesn't enable `link-nav`: the annotation layer
  owns links then (select, move, resize). While a tool can edit annotations, a link attached to
  another annotation is that annotation's, and its anchor stands down too.
-->
<script lang="ts">
  import { ActionsToken, createHoverPump } from '@embedpdf/plugin-actions/contract';
  import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
  import { LinkToken, type Link } from '@embedpdf/plugin-link';
  import { LinkToken as LinkHostToken } from '@embedpdf/plugin-link/contract/host';
  import {
    hoverLink,
    isModifiedClick,
    isolatePointerDown,
    linkActivateContextOf,
    linkAnchorOf,
    navigableLinksOf,
    sendLinkEvent,
    type LinkAnchorEvent,
  } from '@embedpdf/web';
  import { usePage } from '../runtime/page';
  import {
    shallowArray,
    useCapability,
    useOptionalCapability,
    useOptionalSelector,
  } from '../runtime/readers.svelte';
  import { stageTokenOf } from '../stage/stage-scope';
  import type { LinkLayerProps } from './props';
  import { useUriOpener } from './readers.svelte';

  const NO_LINKS: readonly Link[] = Object.freeze([]);

  let { link: drawLink }: LinkLayerProps = $props();

  const page = usePage();
  // The API for following a link (a handle: always this document's), and the plugin's own object
  // for the reads here, which then wake nothing but a new document.
  const links = useCapability(LinkToken);
  const capability = useOptionalCapability(LinkToken);
  useUriOpener();
  // A page destination moves the view this page is shown in.
  const stage = useOptionalCapability(stageTokenOf());
  // The links' own /AA events (enter, exit, down, up, focus, blur) can only fire from here: while
  // a link navigates, its pixels are these anchors. One hover pump per layer; crossing layers
  // still orders Exit before Enter, since both sides submit in DOM event order.
  const actions = useOptionalCapability(ActionsToken);
  const pump = $derived(actions.current ? createHoverPump(actions.current.dispatch) : null);

  const items = useOptionalSelector(
    LinkToken,
    (lens) => lens.listLinks(page.ref),
    NO_LINKS,
    shallowArray,
  );
  const engaged = useOptionalSelector(LinkHostToken, (lens) => lens.isNavigationEngaged(), false);
  // One owner per pixel: while the active tool can edit annotations, a link attached to another
  // annotation belongs to it, and its anchor stands down. Standalone links navigate under any
  // tool that enables `link-nav`.
  const editEnabled = useOptionalSelector(
    InteractionToken,
    (interaction) => interaction.activeToolEnables('annotation-edit'),
    false,
  );
  const visible = $derived(
    engaged.current && items.current.length > 0
      ? navigableLinksOf(items.current, editEnabled.current)
      : NO_LINKS,
  );

  $effect(() => {
    const lens = capability.current;
    const ref = page.ref;
    if (!lens) return;
    void lens.ensureLoaded(ref);
  });

  /** Follow `item` through the plugin, which moves the view or opens a website. */
  function follow(item: Link) {
    links.activate(item, linkActivateContextOf(item, page.ref, stage.current));
  }

  /** The link's own /AA event for a press, a release or focus, with the actions plugin. */
  function notify(item: Link, event: LinkAnchorEvent) {
    sendLinkEvent(actions.current, item, page.ref, event);
  }

  function onClick(href: string | null, item: Link, event: MouseEvent) {
    // A modified click on a real `href` keeps the browser's own behavior (a background tab, a
    // new window). Every other click follows the link through the plugin.
    if (href && isModifiedClick(event)) return;
    event.preventDefault();
    follow(item);
  }

  function onKeyDown(item: Link, event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    follow(item);
  }

  /**
   * A press inside a link must not reach the Stage (it would start the active tool's gesture, or
   * end an edit as a click outside). Svelte hands `onpointerdown` to the root, after the Stage
   * saw the press, so the press stops on a native listener on the anchor, which also sends the
   * link's "mouse down" action.
   */
  const isolate = (item: () => Link) => (element: HTMLElement) =>
    isolatePointerDown(element, () => notify(item(), 'mouseDown'));
</script>

{#if visible.length > 0}
  <div style="position: absolute; inset: 0; pointer-events: none">
    {#each visible as item (item.id)}
      {@const { box, href, label } = linkAnchorOf(
        item,
        page.transform,
        (link) => capability.current?.getLabel(link) ?? '',
      )}
      <!-- Its box, its label, and a native `href` only for a website with nothing chained after
           it. -->
      <!-- The layer's own anchor; a `link` snippet draws around it. -->
      {#snippet native()}
        <!-- `role` stays: an anchor without `href` (a page destination) has no role of its own. -->
        <!-- svelte-ignore a11y_no_redundant_roles -->
        <a
          {@attach isolate(() => item)}
          href={href ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          role="link"
          tabindex="0"
          title={label}
          aria-label={label}
          onclick={(event) => onClick(href, item, event)}
          onkeydown={(event) => onKeyDown(item, event)}
          onpointerenter={() => hoverLink(pump, item, page.ref)}
          onpointerleave={() => pump?.hover(null)}
          onpointerup={() => notify(item, 'mouseUp')}
          onfocus={() => notify(item, 'focus')}
          onblur={() => notify(item, 'blur')}
          style:position="absolute"
          style:left="{box.left}px"
          style:top="{box.top}px"
          style:width="{box.width}px"
          style:height="{box.height}px"
          style:cursor="pointer"
          style:pointer-events="auto"
        ></a>
      {/snippet}
      {#if drawLink}
        {@render drawLink({ link: item, native })}
      {:else}
        {@render native()}
      {/if}
    {/each}
  </div>
{/if}
