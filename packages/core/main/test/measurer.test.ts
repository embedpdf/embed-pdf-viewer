import { describe, expect, it, vi } from 'vitest';

import { bytesInput, immediateEngine } from './helpers';
import { createCapabilityToken, type HostFontProgram, type HostTextMeasurer } from '../src/index';
import { createKernel } from '../src/kernel';
import { createTestContext } from '../src/testing';
import type { AnyPlugin } from '../src/types';

/**
 * `ctx.measurer`: the host's text measuring, as the kernel was given it, its
 * `onChange` listeners dropped when the instance closes.
 */

/** A host whose programs are ready when `load()` says so, and whose text is 500 wide per character. */
function fakeMeasurer() {
  const listeners = new Set<() => void>();
  const loaded = new Set<string>();
  const measurer: HostTextMeasurer = {
    ready: (program) => loaded.has(program.family),
    refused: (program) => program.family.endsWith('broken'),
    width: (_program, text) => text.length * 500,
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    measurer,
    listeners,
    load(family: string) {
      loaded.add(family);
      for (const listener of [...listeners]) listener();
    },
  };
}

const PROGRAM: HostFontProgram = {
  family: 'epdf-0123456789abcdef',
  weight: 400,
  style: 'normal',
  load: async () => new Uint8Array(),
};

describe('ctx.measurer', () => {
  const token = createCapabilityToken<HostTextMeasurer | null>('measuring');
  const measuringPlugin: AnyPlugin = {
    id: 'measuring',
    scope: 'document',
    token,
    create: (ctx) => ({ api: ctx.measurer }),
  };

  it("measures with the kernel's measurer, and stops telling the instance once its document closes", async () => {
    const host = fakeMeasurer();
    const kernel = createKernel({
      engine: immediateEngine(),
      plugins: [measuringPlugin],
      measurer: host.measurer,
    });
    await kernel.start();
    await kernel.documents.open(bytesInput('d'));
    const measurer = kernel.capability(token, 'd')!;
    const ready = vi.fn();
    measurer.onChange(ready);
    expect(measurer.ready(PROGRAM)).toBe(false);
    host.load(PROGRAM.family);
    expect([measurer.ready(PROGRAM), ready.mock.calls.length]).toEqual([true, 1]);
    expect(measurer.width(PROGRAM, 'abc', false)).toBe(1500);
    expect(measurer.refused({ ...PROGRAM, family: 'epdf-broken' })).toBe(true);

    await kernel.documents.close('d');
    expect(host.listeners.size).toBe(0);
    await kernel.destroy();
  });

  it('a listener that unsubscribes is told nothing more', async () => {
    const host = fakeMeasurer();
    const ctx = createTestContext({ measurer: host.measurer });
    const ready = vi.fn();
    ctx.measurer!.onChange(ready)();
    host.load(PROGRAM.family);
    expect(ready).not.toHaveBeenCalled();
    expect(host.listeners.size).toBe(0);
    await ctx.dispose();
  });

  it('is null on a kernel given none', async () => {
    const kernel = createKernel({ engine: immediateEngine(), plugins: [measuringPlugin] });
    await kernel.start();
    await kernel.documents.open(bytesInput('d'));
    expect(kernel.capability(token, 'd')).toBeNull();
    await kernel.destroy();
  });
});
