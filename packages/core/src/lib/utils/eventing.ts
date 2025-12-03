import {
  EventControl,
  EventControlOptions,
  KeyedEventControl,
  isKeyedOptions,
} from './event-control';
import { arePropsEqual } from './math';

/* ------------------------------------------------------------------ */
/* basic types                                                        */
/* ------------------------------------------------------------------ */
export type Listener<T = any> = (value: T) => void;
export type Unsubscribe = () => void;

/* ------------------------------------------------------------------ */
/* EventListener                                                      */
/* ------------------------------------------------------------------ */
export type EventListener<T> =
  | ((listener: Listener<T>) => Unsubscribe)
  | ((listener: Listener<T>, options?: EventControlOptions<T>) => Unsubscribe);

/* ------------------------------------------------------------ */
/* helpers for typing `.on()` with an optional second argument  */
/* ------------------------------------------------------------ */
export type EventHook<T = any> = EventListener<T>;

/* ------------------------------------------------------------------ */
/* minimal "dumb" emitter (no value cache, no equality)               */
/* ------------------------------------------------------------------ */
export interface Emitter<T = any> {
  emit(value?: T): void;
  on(listener: Listener<T>): Unsubscribe;
  off(listener: Listener<T>): void;
  clear(): void;
}

export function createEmitter<T = any>(): Emitter<T> {
  const listeners = new Set<Listener<T>>();

  const on: EventHook<T> = (l: Listener<T>) => {
    listeners.add(l);
    return () => listeners.delete(l);
  };

  return {
    emit: (v = undefined as T) => listeners.forEach((l) => l(v)),
    on,
    off: (l) => listeners.delete(l),
    clear: () => listeners.clear(),
  };
}

/* ------------------------------------------------------------ */
/* public interface                                              */
/* ------------------------------------------------------------ */
export interface BehaviorEmitter<T = any> extends Omit<Emitter<T>, 'on' | 'off'> {
  readonly value?: T;
  on: EventHook<T>;
  off(listener: Listener<T>): void;
  select<U>(selector: (v: T) => U, equality?: (a: U, b: U) => boolean): EventHook<U>;
}

/* ------------------------------------------------------------ */
/* implementation                                               */
/* ------------------------------------------------------------ */
export function createBehaviorEmitter<T = any>(
  initial?: T,
  equality: (a: T, b: T) => boolean = arePropsEqual,
): BehaviorEmitter<T> {
  const listeners = new Set<Listener<T>>();
  const proxyMap = new Map<Listener<T>, { wrapped: Listener<T>; destroy: () => void }>();
  let _value = initial; // cached value

  /* -------------- helpers ----------------------------------- */
  const notify = (v: T) => listeners.forEach((l) => l(v));

  const baseOn: EventHook<T> = (listener: Listener<T>, options?: EventControlOptions<T>) => {
    /* wrap & remember if we have control options ------------------ */
    let realListener = listener;
    let destroy = () => {};

    if (options) {
      // Check if it's keyed options
      if (isKeyedOptions(options)) {
        const ctl = new KeyedEventControl(listener, options);
        realListener = ctl.handle as Listener<T>;
        destroy = () => ctl.destroy();
      } else {
        const ctl = new EventControl(listener, options);
        realListener = ctl.handle as Listener<T>;
        destroy = () => ctl.destroy();
      }
      proxyMap.set(listener, { wrapped: realListener, destroy });
    }

    /* immediate replay of last value ------------------------------ */
    if (_value !== undefined) realListener(_value);

    listeners.add(realListener);

    return () => {
      listeners.delete(realListener);
      destroy();
      proxyMap.delete(listener);
    };
  };

  /* -------------- public object ------------------------------ */
  return {
    /* emitter behaviour ---------------------------------------- */
    get value() {
      return _value;
    },

    emit(v = undefined as T) {
      if (_value === undefined || !equality(_value, v)) {
        _value = v;
        notify(v);
      }
    },

    on: baseOn,
    off(listener: Listener<T>) {
      /* did we wrap this listener? */
      const proxy = proxyMap.get(listener);
      if (proxy) {
        listeners.delete(proxy.wrapped);
        proxy.destroy();
        proxyMap.delete(listener);
      } else {
        listeners.delete(listener);
      }
    },

    clear() {
      listeners.clear();
      proxyMap.forEach((p) => p.destroy());
      proxyMap.clear();
    },

    /* derived hook --------------------------------------------- */
    select<U>(selector: (v: T) => U, eq: (a: U, b: U) => boolean = arePropsEqual): EventHook<U> {
      return (listener: Listener<U>, options?: EventControlOptions<U>) => {
        let prev: U | undefined;

        /* replay */
        if (_value !== undefined) {
          const mapped = selector(_value);
          prev = mapped;
          listener(mapped);
        }

        /* subscribe to parent */
        return baseOn(
          (next) => {
            const mapped = selector(next);
            if (prev === undefined || !eq(prev, mapped)) {
              prev = mapped;
              listener(mapped);
            }
          },
          options as EventControlOptions<T> | undefined,
        ); // pass control opts straight through
      };
    },
  };
}
