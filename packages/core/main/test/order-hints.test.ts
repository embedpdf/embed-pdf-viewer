import { describe, expect, it } from 'vitest';
import { createCapabilityToken } from '../src/index';
import { planPlugins } from '../src/order';
import type { AnyPlugin } from '../src/types';

// The missing-dependency error carries its own fix: tokens author the remedy
// (`hint`), and planPlugins appends it — a forgotten plugin is a ten-second
// paste, not an investigation.

const stub = (id: string, overrides: Partial<AnyPlugin> = {}): AnyPlugin =>
  ({ id, initialState: () => ({}), reduce: (s: unknown) => s, ...overrides }) as AnyPlugin;

describe('planPlugins missing-dependency errors', () => {
  it('appends the required token’s authored hint', () => {
    const hub = createCapabilityToken<unknown>('interaction', {
      hint: `add interactionPlugin() from '@embedpdf/plugin-interaction' to your plugins list`,
    });
    expect(() => planPlugins([stub('selection', { requires: [hub] })])).toThrow(
      `Plugin "selection" requires capability "interaction", which no plugin provides — ` +
        `add interactionPlugin() from '@embedpdf/plugin-interaction' to your plugins list.`,
    );
  });

  it('stays a plain sentence for a hint-less token', () => {
    const bare = createCapabilityToken<unknown>('mystery');
    expect(() => planPlugins([stub('consumer', { requires: [bare] })])).toThrow(
      'Plugin "consumer" requires capability "mystery", which no plugin provides.',
    );
  });

  it('does not fire when the dependency is present', () => {
    const hub = createCapabilityToken<unknown>('interaction', { hint: 'unused here' });
    const provider = stub('interaction', { token: hub, capability: () => ({}) } as Partial<AnyPlugin>);
    expect(() => planPlugins([provider, stub('selection', { requires: [hub] })])).not.toThrow();
  });
});
