/**
 * The link plugin's readers: `useLink()` (the API) and `useLinkEvent()`, and the website opener
 * this binding hands the plugin while a link component is mounted.
 */
import { untrack } from 'svelte';
import type { EventHook } from '@embedpdf/core';
import { LinkToken } from '@embedpdf/plugin-link';
import type { LinkCapability } from '@embedpdf/plugin-link';
import { LinkToken as LinkHostToken } from '@embedpdf/plugin-link/contract/host';
import { openExternalUri } from '@embedpdf/web';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalCapability,
} from '../runtime/readers.svelte';

/**
 * Hand the link plugin this binding's website opener (`openExternalUri`) while the component
 * lives: an allowed address opens in a new tab, anything else is refused and the plugin reports
 * it. Registered again for each document.
 */
export function useUriOpener(): void {
  const host = useOptionalCapability(LinkHostToken);
  $effect(() => {
    const current = host.current;
    if (!current) return;
    return untrack(() => current.registerUriOpener(openExternalUri));
  });
}

/**
 * The link API (`listLinks()`, `activate()`, …) for app code. While a component uses it,
 * `activate()` opens a website in a new tab.
 */
export function useLink(): LinkCapability {
  useUriOpener();
  return useCapability(LinkToken);
}

/**
 * Subscribe to one link event while the component lives:
 * `useLinkEvent((link) => link.onActivated, handler)`.
 */
export function useLinkEvent<T>(
  select: (link: LinkCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(LinkToken, select, handler);
}
