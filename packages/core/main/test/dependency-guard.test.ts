import { describe, expect, it } from 'vitest';
import { createKernel } from '../src/kernel';
import { createCapabilityToken } from '../src/index';
import type { AnyPlugin, PluginContext } from '../src/types';
import { bytesInput, immediateEngine } from './helpers';

/**
 * G3: resolving a token a plugin did not declare is a lie in the dependency
 * graph. In development it throws with the remedy; declaring it as optional
 * makes the same call legal.
 */

const foo = createCapabilityToken<{ ok: true }>('foo');
const fooPlugin: AnyPlugin = { id: 'foo', token: foo, capability: () => ({ ok: true }) };

function consumer(declare: boolean): AnyPlugin {
  return {
    id: 'consumer',
    optional: declare ? [foo] : [],
    capability: (ctx: PluginContext<unknown>) => ({ probe: () => ctx.tryGet(foo) }),
    token: createCapabilityToken<{ probe(): unknown }>('consumer'),
  };
}

describe('dependency guard', () => {
  it('throws for an undeclared token, naming plugin, token and the fix', async () => {
    const plugin = consumer(false);
    const kernel = createKernel({ engine: immediateEngine(), plugins: [fooPlugin, plugin] });
    await kernel.start();
    const cap = kernel.capability<{ probe(): unknown }>(plugin.token!);
    expect(() => cap.probe()).toThrow(
      '[kernel] plugin "consumer" resolved capability "foo" without declaring it; add the token to its `requires` or `optional` list.',
    );
    await kernel.destroy();
  });

  it('allows a declared optional token', async () => {
    const plugin = consumer(true);
    const kernel = createKernel({ engine: immediateEngine(), plugins: [fooPlugin, plugin] });
    await kernel.start();
    const cap = kernel.capability<{ probe(): unknown }>(plugin.token!);
    expect(cap.probe()).toEqual({ ok: true });
    await kernel.destroy();
  });

  it('always allows the documents token and the plugin’s own token', async () => {
    const self = createCapabilityToken<{ me(): unknown; docs(): unknown }>('self');
    const plugin: AnyPlugin = {
      id: 'self',
      scope: 'document',
      token: self,
      capability: (ctx: PluginContext<unknown>) => ({
        me: () => ctx.tryGet(self),
        docs: () => ctx.get({ name: 'documents' } as never),
      }),
    };
    const kernel = createKernel({ engine: immediateEngine(), plugins: [plugin] });
    await kernel.start();
    await kernel.documents.open(bytesInput('d'));
    const cap = kernel.capability<{ me(): unknown; docs(): unknown }>(self, 'd');
    expect(cap.me()).toBe(cap);
    await kernel.destroy();
  });
});
