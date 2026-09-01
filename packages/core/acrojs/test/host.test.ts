import { describe, expect, it } from 'vitest';

import { createScriptHost, seedFrom } from '../src/host';
import type { ScriptWorldInput } from '../src/host';
import type { ScriptInput, ScriptOutput, ScriptSandbox } from '../src/types';

const output = (over: Partial<ScriptOutput> = {}): ScriptOutput => ({
  event: { rc: true, value: null, change: '', selStart: 0, selEnd: 0 },
  formEffects: [],
  annotEffects: [],
  uiEffects: [],
  diagnostics: [],
  ...over,
});

const world = (): ScriptWorldInput => ({ fields: [], event: { kind: 'widget-activate' } });

function fakeSandboxFactory(opts?: { dieOnRun?: number }) {
  const calls: string[] = [];
  const inputs: ScriptInput[] = [];
  let built = 0;
  const factory = async (): Promise<ScriptSandbox> => {
    built += 1;
    const id = built;
    let disposed = false;
    let runs = 0;
    return {
      get disposed() {
        return disposed;
      },
      boot: (sources, input) => {
        calls.push(`boot#${id}:${sources.length}`);
        inputs.push(input);
        return output({ diagnostics: [{ code: 'script-error', message: `boot#${id}` }] });
      },
      run: (source, input) => {
        runs += 1;
        calls.push(`run#${id}:${source}`);
        inputs.push(input);
        if (opts?.dieOnRun === runs && id === 1) disposed = true; // resource fault
        return output();
      },
      dispose: () => {
        disposed = true;
      },
    };
  };
  return { factory, calls, inputs, builtCount: () => built };
}

function makeHost(fake: ReturnType<typeof fakeSandboxFactory>, bootSources: string[] = ['fn()']) {
  return createScriptHost({
    sandboxFactory: fake.factory,
    document: () => ({ id: 'doc-1', fileName: 'x.pdf', pageCount: 1, pageNumber: 0 }),
    identity: () => ({ name: '', loginName: '', corporation: '', email: '' }),
    environment: (sequence) => ({
      nowMs: 1000,
      utcOffsetMinutes: 0,
      randomSeed: seedFrom('doc-1', sequence),
    }),
    bootSources: async () => bootSources,
  });
}

describe('createScriptHost', () => {
  it('boots once per realm, hands the boot output to exactly one caller', async () => {
    const fake = fakeSandboxFactory();
    const host = makeHost(fake);
    const first = await host.transaction(async (txn) => {
      const boot = await txn.boot(world());
      await txn.run('a()', world());
      return boot;
    });
    expect(first?.diagnostics[0]?.message).toBe('boot#1');
    const second = await host.transaction((txn) => txn.boot(world()));
    expect(second).toBeNull();
    expect(fake.calls).toEqual(['boot#1:1', 'run#1:a()']);
  });

  it('auto-boots defensively on run(); the stashed output surfaces on the next boot()', async () => {
    const fake = fakeSandboxFactory();
    const host = makeHost(fake);
    await host.transaction((txn) => txn.run('a()', world()));
    const stashed = await host.transaction((txn) => txn.boot(world()));
    expect(stashed?.diagnostics[0]?.message).toBe('boot#1');
    expect(fake.calls[0]).toBe('boot#1:1');
  });

  it('serializes transactions: a slow body fully precedes the next', async () => {
    const fake = fakeSandboxFactory();
    const host = makeHost(fake, []);
    const order: string[] = [];
    const slow = host.transaction(async (txn) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      await txn.run('slow()', world());
      order.push('slow');
    });
    const fast = host.transaction(async (txn) => {
      await txn.run('fast()', world());
      order.push('fast');
    });
    await Promise.all([slow, fast]);
    expect(order).toEqual(['slow', 'fast']);
    expect(fake.calls).toEqual(['run#1:slow()', 'run#1:fast()']);
  });

  it('poisons on a resource fault and rebuilds + re-boots lazily next transaction', async () => {
    const fake = fakeSandboxFactory({ dieOnRun: 1 });
    const host = makeHost(fake);
    await host.transaction(async (txn) => {
      await txn.boot(world());
      await txn.run('boom()', world()); // sandbox #1 dies here
    });
    await host.transaction((txn) => txn.run('after()', world()));
    expect(fake.builtCount()).toBe(2);
    expect(fake.calls).toEqual(['boot#1:1', 'run#1:boom()', 'boot#2:1', 'run#2:after()']);
  });

  it('advances the deterministic environment per run', async () => {
    const fake = fakeSandboxFactory();
    const host = makeHost(fake, []);
    await host.transaction(async (txn) => {
      await txn.run('a()', world());
      await txn.run('b()', world());
    });
    const seeds = fake.inputs.map((input) => input.environment.randomSeed);
    expect(seeds[0]).not.toBe(seeds[1]);
    expect(seeds[0]).toBe(seedFrom('doc-1', 0));
    expect(seeds[1]).toBe(seedFrom('doc-1', 1));
  });

  it('rejects transactions after dispose and disposes the sandbox', async () => {
    const fake = fakeSandboxFactory();
    const host = makeHost(fake, []);
    await host.transaction((txn) => txn.run('a()', world()));
    host.dispose();
    await expect(host.transaction(async () => undefined)).rejects.toThrow(/disposed/);
  });
});
