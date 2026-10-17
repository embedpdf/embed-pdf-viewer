/**
 * One change, one store update. Both engines publish a change's events in one
 * synchronous burst that shares `origin.tx`. While a burst of several events
 * arrives, the store holds its notifications, so readers hear of the whole
 * change once, after its last event, whoever made it.
 */
import type { DocumentEvent } from '@embedpdf/engine-core/runtime';

import type { Store } from './store';

const txOf = (event: DocumentEvent) => ('origin' in event ? event.origin.tx : undefined);

export interface BurstGate {
  /** Run before every other listener: opens at a burst's first event. */
  first(event: DocumentEvent): void;
  /** Run after every other listener: closes at the burst's last event. */
  last(event: DocumentEvent): void;
  /** Close a burst left open. */
  close(): void;
}

export function createBurstGate(store: Pick<Store, 'hold'>): BurstGate {
  let open: { id: string; release: () => void } | null = null;
  const close = (): void => {
    const held = open;
    open = null;
    held?.release();
  };
  return {
    first(event) {
      const tx = txOf(event);
      // A burst that never reached its last event ends when another event arrives.
      if (open && open.id !== tx?.id) close();
      if (!open && tx && tx.index === 0 && tx.count > 1)
        open = { id: tx.id, release: store.hold() };
    },
    last(event) {
      const tx = txOf(event);
      if (open && tx?.id === open.id && tx.index === tx.count - 1) close();
    },
    close,
  };
}
