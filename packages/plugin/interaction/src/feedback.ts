/**
 * Platform feedback (haptics) — the output half of the interaction seam:
 * pointers come in, feedback goes back out to the device.
 *
 * One workspace-scoped provider, many consumers: any plugin lists
 * {@link FeedbackToken} as an optional dependency and calls the capability at
 * its semantic moments (the selection handler on a long-press word-select).
 * The plugin itself stays DOM-free — the provider is injected from outside
 * (`@embedpdf/web` ships `vibrationFeedback` and a WKWebView bridge; native
 * shells bring their own), exactly like the stage's Scheduler seam: host
 * dependencies enter through explicit injection, never a hidden global.
 *
 * The vocabulary is deliberately the platform's haptic taxonomy — iOS's three
 * generator families, which Android mirrors in `HapticFeedbackConstants` and
 * the web approximates with vibration patterns — not app vocabulary. A verb
 * belongs here only if a provider would map it to a physically different
 * output; call-site semantics ("word selected", "annotation picked up") pick a
 * family, they never add one.
 */
import { definePlugin } from '@embedpdf/core';

import { FeedbackToken } from './feedback.types';
import type { FeedbackPluginOptions, PlatformFeedback } from './feedback.types';

/** No provider → every call is a cheap no-op; consumers never branch. */
const NOOP: PlatformFeedback = { selection() {}, impact() {}, notify() {} };

/**
 * Register the workspace's one feedback provider. Stateless: the capability
 * is the provider (or the no-op).
 */
export const feedbackPlugin = (options: FeedbackPluginOptions = {}) =>
  definePlugin<void, PlatformFeedback>({
    id: 'feedback',
    scope: 'workspace',
    token: FeedbackToken,
    create: () => ({ api: options.provider ?? NOOP }),
  });
