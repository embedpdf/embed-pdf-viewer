/** @embedpdf/plugin-link/contract/host — the HOST lens (`isNavigationEngaged`). Same runtime token, typed wider. */
import type { CapabilityToken } from '@embedpdf/core';

import type { LinkCapability } from './contract';
import { LinkToken as PublicLinkToken } from './token';

export * from './contract';
export type { LinkAction, LinkState } from './model';

export interface LinkHostCapability extends LinkCapability {
  /** Does the active tool navigate links (the layer paints anchors only then)? */
  isNavigationEngaged(): boolean;
}

export const LinkToken = PublicLinkToken as unknown as CapabilityToken<LinkHostCapability>;
