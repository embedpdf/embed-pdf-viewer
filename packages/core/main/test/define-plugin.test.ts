import { describe, expect, expectTypeOf, it } from 'vitest';
import { createCapabilityToken, definePlugin } from '../src/index';
import type { NoSettings, SettingsApi } from '../src/settings';
import type { AnyPlugin, PluginContext, PluginDef } from '../src/types';

/**
 * `definePlugin` takes no type arguments: it reads the capability from
 * `token`, the state from `state` and the settings from `settings.defaults`,
 * and checks `create` against them.
 */

interface Counter {
  readonly count: number;
}

interface CounterSettings {
  readonly step: number;
  readonly highlight: { readonly color: string };
}

interface CounterApi extends SettingsApi<CounterSettings> {
  increment(): void;
  read(): number;
}

const CounterToken = createCapabilityToken<CounterApi>('counter');
const DEFAULTS: CounterSettings = { step: 1, highlight: { color: 'yellow' } };

/** A controller typed by its parameter, as a plugin's `controller.ts` writes it. */
function createCounterController(ctx: PluginContext<Counter, CounterSettings>) {
  const settings = ctx.settings();
  const api: CounterApi = {
    ...settings.api,
    increment: () => ctx.state.update((state) => ({ count: state.count + settings.get().step })),
    read: () => ctx.state.get().count,
  };
  return { api };
}

describe('definePlugin', () => {
  it('reads the capability from token, the state from state and the settings from settings.defaults', () => {
    const plugin = definePlugin({
      id: 'counter',
      token: CounterToken,
      state: (): Counter => ({ count: 0 }),
      settings: { defaults: DEFAULTS, registered: { step: 2 } },
      create: createCounterController,
    });
    expectTypeOf(plugin).toEqualTypeOf<PluginDef<Counter, CounterApi, CounterSettings>>();
    expect(plugin.settings?.registered).toEqual({ step: 2 });
  });

  it('types the context of an inline create from the same fields', () => {
    definePlugin({
      id: 'counter',
      token: CounterToken,
      state: (): Counter => ({ count: 0 }),
      settings: { defaults: DEFAULTS },
      create: (ctx) => {
        expectTypeOf(ctx).toEqualTypeOf<PluginContext<Counter, CounterSettings>>();
        return createCounterController(ctx);
      },
    });
  });

  it('makes a plugin without state stateless, and one without settings NoSettings', () => {
    const PingToken = createCapabilityToken<{ ping(): string }>('ping');
    const plugin = definePlugin({
      id: 'ping',
      token: PingToken,
      create: (ctx) => {
        expectTypeOf(ctx.state.get()).toEqualTypeOf<void>();
        return { api: { ping: () => 'pong' } };
      },
    });
    expectTypeOf(plugin).toEqualTypeOf<PluginDef<void, { ping(): string }, NoSettings>>();
  });

  it('lets one plugin list hold plugins with and without settings', () => {
    const PingToken = createCapabilityToken<{ ping(): string }>('ping');
    const ping = definePlugin({
      id: 'ping',
      token: PingToken,
      create: () => ({ api: { ping: () => 'pong' } }),
    });
    const counter = definePlugin({
      id: 'counter',
      token: CounterToken,
      state: (): Counter => ({ count: 0 }),
      settings: { defaults: DEFAULTS },
      create: createCounterController,
    });
    const plugins: AnyPlugin[] = [ping, counter];
    expect(plugins).toHaveLength(2);
  });

  it('refuses a create that returns less than the capability, instead of narrowing it', () => {
    definePlugin({
      id: 'counter',
      token: CounterToken,
      state: (): Counter => ({ count: 0 }),
      settings: { defaults: DEFAULTS },
      // @ts-expect-error `read` and the settings calls are missing from the api
      create: (ctx) => ({ api: { increment: () => ctx.state.update((state) => state) } }),
    });
  });

  it('refuses a controller that reads settings when the definition declares none', () => {
    definePlugin({
      id: 'counter',
      token: CounterToken,
      state: (): Counter => ({ count: 0 }),
      // @ts-expect-error the controller reads settings the definition doesn't declare
      create: createCounterController,
    });
  });
});
