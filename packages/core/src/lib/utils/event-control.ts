export type EventHandler<T> = (data: T) => void;

export interface BaseEventControlOptions {
  wait: number;
}

export interface DebounceOptions extends BaseEventControlOptions {
  mode: 'debounce';
}

export interface ThrottleOptions extends BaseEventControlOptions {
  mode: 'throttle';
  throttleMode?: 'leading-trailing' | 'trailing';
}

export interface KeyedDebounceOptions<T> extends BaseEventControlOptions {
  mode: 'debounce';
  keyExtractor: (data: T) => string | number;
}

export interface KeyedThrottleOptions<T> extends BaseEventControlOptions {
  mode: 'throttle';
  throttleMode?: 'leading-trailing' | 'trailing';
  keyExtractor: (data: T) => string | number;
}

export type EventControlOptions<T = any> =
  | DebounceOptions
  | ThrottleOptions
  | KeyedDebounceOptions<T>
  | KeyedThrottleOptions<T>;

export class EventControl<T> {
  private timeoutId?: number;
  private lastRun: number = 0;

  constructor(
    private handler: EventHandler<T>,
    private options: DebounceOptions | ThrottleOptions,
  ) {}

  handle = (data: T): void => {
    if (this.options.mode === 'debounce') {
      this.debounce(data);
    } else {
      this.throttle(data);
    }
  };

  private debounce(data: T): void {
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
    }

    this.timeoutId = window.setTimeout(() => {
      this.handler(data);
      this.timeoutId = undefined;
    }, this.options.wait);
  }

  private throttle(data: T): void {
    if (this.options.mode === 'debounce') return;

    const now = Date.now();
    const throttleMode = this.options.throttleMode || 'leading-trailing';

    if (now - this.lastRun >= this.options.wait) {
      if (throttleMode === 'leading-trailing') {
        this.handler(data);
      }
      this.lastRun = now;
    }

    // Always schedule the trailing execution
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
    }

    this.timeoutId = window.setTimeout(
      () => {
        this.handler(data);
        this.lastRun = Date.now();
        this.timeoutId = undefined;
      },
      this.options.wait - (now - this.lastRun),
    );
  }

  destroy(): void {
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
    }
  }
}

/**
 * Event control with independent debouncing/throttling per key.
 * Useful when events carry a discriminator (like documentId) and
 * you want to debounce/throttle each key's events independently.
 *
 * @example
 * // Debounce viewport resize events independently per document
 * const control = new KeyedEventControl(
 *   (event) => recalcZoom(event.documentId),
 *   { mode: 'debounce', wait: 150, keyExtractor: (e) => e.documentId }
 * );
 * control.handle(event); // Each documentId gets its own 150ms debounce
 */
export class KeyedEventControl<T> {
  private controls = new Map<string, EventControl<T>>();
  private readonly baseOptions: DebounceOptions | ThrottleOptions;

  constructor(
    private handler: EventHandler<T>,
    private options: KeyedDebounceOptions<T> | KeyedThrottleOptions<T>,
  ) {
    // Extract base options without keyExtractor for individual EventControls
    this.baseOptions = {
      mode: options.mode,
      wait: options.wait,
      ...(options.mode === 'throttle' && 'throttleMode' in options
        ? { throttleMode: options.throttleMode }
        : {}),
    } as DebounceOptions | ThrottleOptions;
  }

  handle = (data: T): void => {
    const key = String(this.options.keyExtractor(data));

    let control = this.controls.get(key);
    if (!control) {
      control = new EventControl(this.handler, this.baseOptions);
      this.controls.set(key, control);
    }

    control.handle(data);
  };

  destroy(): void {
    for (const control of this.controls.values()) {
      control.destroy();
    }
    this.controls.clear();
  }
}

/**
 * Type guard to check if options are keyed
 */
export function isKeyedOptions<T>(
  options: EventControlOptions<T>,
): options is KeyedDebounceOptions<T> | KeyedThrottleOptions<T> {
  return 'keyExtractor' in options;
}
