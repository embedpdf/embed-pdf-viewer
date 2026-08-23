/**
 * Platform-feedback providers — the browser implementations of the interaction
 * hub's haptic port (structurally `PlatformFeedback` from
 * `@embedpdf/plugin-interaction`; declared structurally here so this package
 * stays plugin-free, per the layering law).
 *
 * Honesty about reach: `navigator.vibrate` works on Android browsers and is
 * NOT implemented in iOS Safari — there the default provider is a silent
 * no-op until Apple ships a haptics API. (The community switch-control hacks
 * were evaluated and deliberately NOT shipped: Apple patched programmatic
 * triggering in iOS 26.5, leaving only tap-on-control tricks that don't fit a
 * viewer's gesture moments.) The real iPhone haptic today comes through a
 * native shell: a WKWebView embedder installs a script message handler and
 * passes {@link wkFeedback} (or their own provider) instead.
 */

/** Structural twin of plugin-interaction's `PlatformFeedback`. */
export interface WebPlatformFeedback {
  selection(): void;
  impact(weight?: 'light' | 'medium' | 'heavy'): void;
  notify(kind: 'success' | 'warning' | 'error'): void;
}

const vibrate = (pattern: number | number[]): void => {
  if (typeof navigator !== 'undefined') navigator.vibrate?.(pattern);
};

/**
 * The default web provider: the Vibration API, mapped onto the three haptic
 * families (selection = the shortest tick; impact scales with weight; notify
 * uses patterns). A no-op wherever vibration is unsupported — notably iOS
 * Safari — so it is always safe to install.
 */
export const vibrationFeedback: WebPlatformFeedback = {
  selection: () => vibrate(8),
  impact: (weight = 'light') => vibrate(weight === 'heavy' ? 30 : weight === 'medium' ? 20 : 10),
  notify: (kind) =>
    vibrate(kind === 'error' ? [12, 60, 12, 60, 12] : kind === 'warning' ? [15, 70, 15] : [10, 50, 10]),
};

interface WKMessageHandler {
  postMessage(message: unknown): void;
}

/**
 * A provider for native iOS shells: forwards each call to a WKWebView script
 * message handler the HOST APP installed under `handlerName` — an explicit
 * contract between the embedder and their own app, never a global this library
 * sniffs on its own. The message shape is
 * `{ family: 'selection' } | { family: 'impact', weight } | { family: 'notify', kind }`;
 * the native side maps families onto the matching `UIFeedbackGenerator`.
 * Calls fall back to `fallback` (default: {@link vibrationFeedback}) when the
 * handler is absent, so one provider serves a hybrid web/app deployment.
 */
export const wkFeedback = (
  handlerName: string,
  fallback: WebPlatformFeedback = vibrationFeedback,
): WebPlatformFeedback => {
  const handler = (): WKMessageHandler | undefined => {
    if (typeof window === 'undefined') return undefined;
    const w = window as Window & {
      webkit?: { messageHandlers?: Record<string, WKMessageHandler | undefined> };
    };
    return w.webkit?.messageHandlers?.[handlerName];
  };
  return {
    selection: () => {
      const h = handler();
      if (h) h.postMessage({ family: 'selection' });
      else fallback.selection();
    },
    impact: (weight = 'light') => {
      const h = handler();
      if (h) h.postMessage({ family: 'impact', weight });
      else fallback.impact(weight);
    },
    notify: (kind) => {
      const h = handler();
      if (h) h.postMessage({ family: 'notify', kind });
      else fallback.notify(kind);
    },
  };
};
