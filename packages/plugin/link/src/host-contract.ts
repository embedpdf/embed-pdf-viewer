/** @embedpdf/plugin-link/contract/host: the host lens, the public capability plus what a framework binding supplies. */
import { createHostToken, type Unsubscribe } from '@embedpdf/core';

import type { LinkCapability } from './contract';
import { LinkToken as PublicLinkToken } from './token';

export * from './contract';

/**
 * Opens a website for `activate()`, in the user's gesture. Returns whether it
 * opened: false for an address it won't open (a `javascript:` or `file:`
 * URI), which activation then reports.
 */
export type UriOpener = (uri: string) => boolean;

export interface LinkHostCapability extends LinkCapability {
  /** Does the active tool navigate links (the layer paints anchors only then)? */
  isNavigationEngaged(): boolean;
  /**
   * Register the framework's website opener. The plugin never touches the
   * DOM: without an opener, a website link activates as `{ outcome: 'uri' }`
   * for the caller to open. The latest registration wins until it is removed.
   */
  registerUriOpener(opener: UriOpener): Unsubscribe;
}

export const LinkToken = createHostToken<LinkHostCapability>(PublicLinkToken);
