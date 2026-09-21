/** @embedpdf/plugin-link/contract — the PUBLIC link vocabulary. */
import type { CapabilityToken } from '@embedpdf/core';
import { LinkToken as LinkHostToken } from './types';
import type { LinkCapability } from './types';

export const LinkToken = LinkHostToken as unknown as CapabilityToken<LinkCapability>;
export type {
  Link,
  LinkActivateContext,
  LinkActivatedEvent,
  LinkActivation,
  LinkCapability,
  LinkLoadedEvent,
  LinkResolution,
  PdfDestination,
  PdfLinkTarget,
} from './types';
