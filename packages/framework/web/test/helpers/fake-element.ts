/**
 * A fake element for the bindings that only listen: listeners kept by type,
 * events dispatched by hand, and whether a listener stopped an event's
 * propagation. No jsdom.
 */
type Listener = (event: unknown) => void;

export interface FakeEvent {
  type: string;
  stopped: boolean;
  stopPropagation(): void;
  [field: string]: unknown;
}

export function fakeElement<Extra extends object = object>(extra?: Extra) {
  const listeners = new Map<string, Set<Listener>>();
  const element = {
    addEventListener(type: string, listener: Listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener(type: string, listener: Listener) {
      listeners.get(type)?.delete(listener);
    },
    /** Deliver an event to this element's listeners; the event says whether one stopped it. */
    dispatch(type: string, fields: Record<string, unknown> = {}): FakeEvent {
      const event: FakeEvent = {
        type,
        stopped: false,
        stopPropagation() {
          event.stopped = true;
        },
        ...fields,
      };
      for (const listener of listeners.get(type) ?? []) listener(event);
      return event;
    },
    /** How many listeners an event type has. */
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
  return Object.assign(element, extra);
}

/** The fake as the element type a binding takes. */
export const asElement = <T = HTMLElement>(fake: object): T => fake as unknown as T;
