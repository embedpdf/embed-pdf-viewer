/**
 * The plugin's state: its status. A document starts as `starting`, and the plugin's connect says
 * at once whether it's protected; a protected one then shows, or fails.
 */
import type { ProtectedDisplayStatus, ProtectedPlayback } from './contract';

export const initialProtectedDisplayModel = (): ProtectedDisplayStatus => ({ kind: 'starting' });

/** Not protected, for this reason. */
export const turnOff = (
  reason: Extract<ProtectedDisplayStatus, { kind: 'off' }>['reason'],
): ProtectedDisplayStatus => ({ kind: 'off', reason });

/** The pages show, with this DRM system. */
export const startShowing = ({
  keySystem,
  robustness,
}: Pick<ProtectedPlayback, 'keySystem' | 'robustness'>): ProtectedDisplayStatus => ({
  kind: 'showing',
  keySystem,
  robustness,
});

/** The pages can't show, or stopped showing: a refusal, no DRM system in common. */
export const fail = (message: string): ProtectedDisplayStatus => ({ kind: 'failed', message });
