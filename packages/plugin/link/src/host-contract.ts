/** @embedpdf/plugin-link/contract/host: the host lens, the public capability plus `isNavigationEngaged`. */
import { createHostToken } from '@embedpdf/core';

import type { LinkCapability } from './contract';
import { LinkToken as PublicLinkToken } from './token';

export * from './contract';

export interface LinkHostCapability extends LinkCapability {
  /** Does the active tool navigate links (the layer paints anchors only then)? */
  isNavigationEngaged(): boolean;
}

export const LinkToken = createHostToken<LinkHostCapability>(PublicLinkToken);
