import { createHostToken, type EventHook, type Unsubscribe } from '@embedpdf/core';

import { InteractionToken as PublicInteractionToken } from './contract';
import type { Cursor, InteractionCapability, InteractionHandler, PointerSample } from './contract';

/**
 * The host lens: what pointer sources (the Stage surface, `PagePointerSource`)
 * and feature plugins with gestures need. The same runtime token as the
 * public contract, typed wider. Application code never needs it.
 */
export interface InteractionHostCapability extends InteractionCapability {
  /** Pointer ingress — a source calls it for every normalized event. */
  dispatchPointer(sample: PointerSample): void;
  /** Touch-arbitration pre-flight: would any eligible handler claim this contact. Pure. */
  wouldClaimTouch(sample: PointerSample): boolean;
  /** Register a pointer handler; `source` scopes it to one lens. */
  registerHandler(handler: InteractionHandler, options?: { source?: string }): Unsubscribe;
  /** Push or clear a cursor claim on the priority stack (hover feedback). */
  claimCursor(token: string, cursor: Cursor | null, priority?: number): void;
  /** The resolved cursor string. */
  getCursor(): Cursor;
  /** The resolved cursor changed. */
  readonly onCursorChanged: EventHook<{ readonly cursor: Cursor }>;
}

export const InteractionToken = createHostToken<InteractionHostCapability>(PublicInteractionToken);
// The host entry is a superset of the public contract: everything public is reachable here too.
export * from './contract';
