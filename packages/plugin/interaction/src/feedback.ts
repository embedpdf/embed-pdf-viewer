/**
 * Platform feedback (haptics) — the OUTPUT half of the interaction seam:
 * pointers come in, feedback goes back out to the device.
 *
 * ONE workspace-scoped provider, MANY consumers: any plugin lists
 * {@link FeedbackToken} as an optional dependency and calls the capability at
 * its semantic moments (the selection handler on a long-press word-select; an
 * annotation pickup or a snap later). The plugin itself stays DOM-free — the
 * PROVIDER is injected from outside (`@embedpdf/web` ships `vibrationFeedback`
 * and a WKWebView bridge; native shells bring their own), exactly like the
 * stage's Scheduler seam: host dependencies enter through explicit injection,
 * never a hidden global.
 *
 * The vocabulary is deliberately the PLATFORM's haptic taxonomy — iOS's three
 * generator families, which Android mirrors in `HapticFeedbackConstants` and
 * the web approximates with vibration patterns — not app vocabulary. A verb
 * belongs here only if a provider would map it to a physically different
 * output; call-site semantics ("word selected", "annotation picked up") pick a
 * family, they never add one.
 */
import { createCapabilityToken, definePlugin } from '@embedpdf/core';

export interface PlatformFeedback {
  /**
   * The featherweight "selection is changing" tick
   * (`UISelectionFeedbackGenerator`) — tuned for rapid repetition: a
   * long-press engaging a word, a handle drag ticking across boundaries.
   */
  selection(): void;
  /** A physical-collision bump (`UIImpactFeedbackGenerator`): something was
   *  picked up, snapped, or docked. Default weight 'light'. */
  impact(weight?: 'light' | 'medium' | 'heavy'): void;
  /** An outcome announcement (`UINotificationFeedbackGenerator`). */
  notify(kind: 'success' | 'warning' | 'error'): void;
}

export const FeedbackToken = createCapabilityToken<PlatformFeedback>('feedback');

/** No provider → every call is a cheap no-op; consumers never branch. */
const NOOP: PlatformFeedback = { selection() {}, impact() {}, notify() {} };

export interface FeedbackPluginOptions {
  /** The platform's feedback implementation. Omit for silence (headless,
   *  tests, or a "haptics off" preference) — consumers keep working. */
  provider?: PlatformFeedback;
}

/** The plugin is stateless; the action type exists only to satisfy the
 *  reducer contract (nothing ever dispatches it). */
type FeedbackAction = { type: 'feedback/noop' };

/**
 * Register the workspace's ONE feedback provider. Stateless: the capability IS
 * the provider (or the no-op).
 */
export const feedbackPlugin = (options: FeedbackPluginOptions = {}) =>
  definePlugin<Record<string, never>, FeedbackAction, PlatformFeedback>({
    id: 'feedback',
    scope: 'workspace',
    token: FeedbackToken,
    initialState: () => ({}),
    reduce: (state) => state,
    capability: () => options.provider ?? NOOP,
  });
