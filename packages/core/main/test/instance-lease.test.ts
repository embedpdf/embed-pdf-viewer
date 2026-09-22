import { describe, expect, it, vi } from 'vitest';
import { createKernel } from '../src/kernel';
import { isPluginError } from '../src/errors';
import type { AnyPlugin, PluginContext } from '../src/types';
import { bytesInput, immediateEngine } from './helpers';

/**
 * A context retained across close and reopen of the same document id
 * cannot read or write the new instance. The lease is revoked synchronously
 * at the start of close; a late update is dropped and reported once.
 */

const token = { name: 'counter' };
type State = { count: number };
const bump = (state: State): State => ({ count: state.count + 1 });

function counterPlugin(seen: PluginContext<State>[]): AnyPlugin {
  return {
    id: 'counter',
    scope: 'document',
    token,
    state: (): State => ({ count: 0 }),
    create: (ctx: PluginContext<State>) => {
      seen.push(ctx);
      return { api: { bump: () => ctx.state.update(bump), read: () => ctx.state.get().count } };
    },
  };
}

describe('instance leases', () => {
  it('a retained context cannot write or read the reopened instance', async () => {
    const seen: PluginContext<State>[] = [];
    const report = vi.fn();
    const kernel = createKernel({
      engine: immediateEngine(),
      plugins: [counterPlugin(seen)],
      report,
    });
    await kernel.start();

    await kernel.documents.open(bytesInput('doc-1'));
    const first = kernel.capability<{ bump(): void; read(): number }>(token, 'doc-1');
    first.bump();
    expect(first.read()).toBe(1);
    const firstMeta = kernel.getState().core.documents['doc-1'];

    await kernel.documents.close('doc-1');
    await kernel.documents.open(bytesInput('doc-1'));
    const second = kernel.capability<{ bump(): void; read(): number }>(token, 'doc-1');
    expect(second).not.toBe(first);
    expect(second.read()).toBe(0);

    // the old instance's context: writes are dropped, reads see its own frozen state
    first.bump();
    first.bump();
    expect(second.read()).toBe(0);
    expect(first.read()).toBe(1);
    expect(report).toHaveBeenCalledTimes(1); // reported once, not per update
    expect(isPluginError(report.mock.calls[0][0], 'instance-closed')).toBe(true);

    // and the new instance carries a new identity
    const secondMeta = kernel.getState().core.documents['doc-1'];
    expect(secondMeta.instanceId).not.toBe(firstMeta.instanceId);
    await kernel.destroy();
  });

  it('revokes the lease synchronously when close begins', async () => {
    const seen: PluginContext<State>[] = [];
    const kernel = createKernel({ engine: immediateEngine(), plugins: [counterPlugin(seen)] });
    await kernel.start();
    await kernel.documents.open(bytesInput('doc-1'));
    const cap = kernel.capability<{ bump(): void; read(): number }>(token, 'doc-1');
    const closing = kernel.documents.close('doc-1'); // not awaited: close has only started
    cap.bump();
    expect(cap.read()).toBe(0); // the write never landed
    await closing;
    await kernel.destroy();
  });
});
