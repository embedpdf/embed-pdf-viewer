import { describe, expect, it } from 'vitest';
import { createCapabilityToken } from '../src/index';
import { planPlugins } from '../src/order';
import type { AnyPlugin } from '../src/types';

// A composition mistake fails at planning, with both names in the error,
// before any plugin is constructed. No implicit last-wins.

const stub = (id: string, overrides: Partial<AnyPlugin> = {}): AnyPlugin =>
  ({ id, create: () => ({ api: {} }), ...overrides }) as AnyPlugin;

describe('planPlugins composition validation', () => {
  it('rejects the same definition installed twice', () => {
    const plugin = stub('a');
    expect(() => planPlugins([plugin, plugin])).toThrow('[kernel] plugin "a" is installed twice.');
  });

  it('rejects two different definitions sharing an id', () => {
    expect(() => planPlugins([stub('a'), stub('a')])).toThrow(
      '[kernel] two different plugins use the id "a".',
    );
  });

  it('rejects two providers of one token, naming both', () => {
    const foo = createCapabilityToken<unknown>('foo');
    const pluginA = stub('a', { token: foo, create: () => ({ api: {} }) });
    const pluginB = stub('b', { token: foo, create: () => ({ api: {} }) });
    expect(() => planPlugins([pluginA, pluginB])).toThrow(
      '[kernel] capability "foo" is provided by both "a" and "b".',
    );
  });

  it('rejects a workspace plugin requiring a document-scoped token', () => {
    const stage = createCapabilityToken<unknown>('stage');
    const provider = stub('stage', {
      scope: 'document',
      token: stage,
      create: () => ({ api: {} }),
    });
    const consumer = stub('shell', { requires: [stage] });
    expect(() => planPlugins([provider, consumer])).toThrow(
      /workspace plugin "shell" requires document-scoped capability "stage"/,
    );
  });

  it('allows a workspace plugin to declare a document-scoped token as optional', () => {
    const stage = createCapabilityToken<unknown>('stage');
    const provider = stub('stage', {
      scope: 'document',
      token: stage,
      create: () => ({ api: {} }),
    });
    const consumer = stub('stamp', { optional: [stage] });
    expect(() => planPlugins([provider, consumer])).not.toThrow();
  });
});
