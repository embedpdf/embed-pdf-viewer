/**
 * The link composables: `useLink()` (the API, and the website opener while a
 * component uses it) and `useLinkEvent()`; and what the anchors of one
 * `<LinkLayer>` share.
 */
import { watch } from 'vue';
import type { EventHook } from '@embedpdf/core';
import type { ActionsCapability, HoverPump } from '@embedpdf/plugin-actions/contract';
import { LinkToken } from '@embedpdf/plugin-link';
import type { LinkCapability } from '@embedpdf/plugin-link';
// The binding opens websites for the plugin: a host fact.
import { LinkToken as LinkHostToken } from '@embedpdf/plugin-link/contract/host';
import type { StageCapability } from '@embedpdf/plugin-stage/contract';
import { openExternalUri } from '@embedpdf/web';
import { useCapability, useCapabilityEvent, useOptionalCapability } from '../runtime/capabilities';

/** What every anchor of one `<LinkLayer>` shares. */
export interface LinkLayerContext {
  link: LinkCapability;
  /** The view a page destination moves, when the page is on a Stage. */
  stage: StageCapability | null;
  /** The actions plugin, for the links' own PDF events; null without it. */
  actions: ActionsCapability | null;
  /** One per layer, so leaving one link and entering the next stay in order. */
  pump: HoverPump | null;
}

/**
 * Hand the link plugin this binding's website opener (`openExternalUri`)
 * while the component lives: an allowed address opens in a new tab, anything
 * else is refused and the plugin reports it. Registered again for another
 * document.
 */
export function useUriOpener(): void {
  const host = useOptionalCapability(LinkHostToken);
  watch(
    host,
    (link, _previous, onCleanup) => {
      if (link) onCleanup(link.registerUriOpener(openExternalUri));
    },
    { immediate: true },
  );
}

/**
 * The link API (`listLinks`, `activate`, …) for app code. The object never
 * changes. While a component uses it, `activate()` opens a website in a new
 * tab.
 */
export function useLink(): LinkCapability {
  useUriOpener();
  return useCapability(LinkToken);
}

/** Subscribe to one link event while the component lives: `useLinkEvent((link) => link.onActivated, handler)`. */
export function useLinkEvent<Event>(
  select: (link: LinkCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(LinkToken, select, handler);
}
