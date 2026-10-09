import { describe, expect, it } from 'vitest';

import { instanceClock, type PluginClock } from '../src/clock';
import { createKernel } from '../src/kernel';
import { createCapabilityToken } from '../src/index';
import { createTestContext, manualClock } from '../src/testing';
import type { AnyPlugin } from '../src/types';
import { bytesInput, immediateEngine } from './helpers';

/**
 * `ctx.clock`: time from the host, owned by the instance. What an instance
 * schedules runs on the host's clock, is cancelled when the instance closes,
 * and never runs after that.
 */

describe('an instance clock', () => {
  it('runs timers when they fall due, and a cancelled one never', () => {
    const time = manualClock();
    const clock = instanceClock(time.clock, new AbortController().signal);
    const ran: string[] = [];
    clock.after(200, () => ran.push('later'));
    clock.after(100, () => ran.push('sooner'));
    const cancel = clock.after(150, () => ran.push('cancelled'));
    cancel();
    time.advance(199);
    expect(ran).toEqual(['sooner']);
    time.advance(1);
    expect(ran).toEqual(['sooner', 'later']);
    cancel(); // once it's gone, a cancel does nothing
  });

  it('runs frame callbacks at the next frame, with its time', () => {
    const time = manualClock();
    const clock = instanceClock(time.clock, new AbortController().signal);
    const frames: number[] = [];
    clock.nextFrame((timeMs) => {
      frames.push(timeMs);
      clock.nextFrame((next) => frames.push(next)); // waits for the frame after
    });
    expect(clock.hasFrames).toBe(true);
    time.frame(16);
    expect(frames).toEqual([16]);
    time.frame(32);
    expect(frames).toEqual([16, 32]);
  });

  it('on a host that never paints, a frame callback runs as soon as the current work is done', () => {
    const time = manualClock({ frames: false });
    const clock = instanceClock(time.clock, new AbortController().signal);
    const frames: number[] = [];
    clock.nextFrame((timeMs) => frames.push(timeMs));
    expect(clock.hasFrames).toBe(false);
    expect(frames).toEqual([]);
    time.advance(0);
    expect(frames).toEqual([0]);
  });

  it('closing the instance cancels what it scheduled, and nothing scheduled after runs', () => {
    const time = manualClock();
    const lifetime = new AbortController();
    const clock = instanceClock(time.clock, lifetime.signal);
    const ran: string[] = [];
    clock.after(100, () => ran.push('timer'));
    clock.nextFrame(() => ran.push('frame'));
    lifetime.abort();
    expect(time.pending).toEqual({ timers: 0, frames: 0 });
    clock.after(0, () => ran.push('after close'));
    time.frame(500);
    expect(ran).toEqual([]);
    expect(time.pending).toEqual({ timers: 0, frames: 0 });
  });
});

describe('ctx.clock', () => {
  const token = createCapabilityToken<PluginClock>('clocked');
  const clockedPlugin: AnyPlugin = {
    id: 'clocked',
    scope: 'document',
    token,
    create: (ctx) => ({ api: ctx.clock }),
  };

  it("schedules on the kernel's clock and is cancelled when the document closes", async () => {
    const time = manualClock();
    const kernel = createKernel({
      engine: immediateEngine(),
      plugins: [clockedPlugin],
      clock: time.clock,
    });
    await kernel.start();
    await kernel.documents.open(bytesInput('d'));
    const clock = kernel.capability(token, 'd');
    const ran: string[] = [];
    clock.after(100, () => ran.push('timer'));
    clock.nextFrame(() => ran.push('frame'));
    time.frame(16);
    expect(ran).toEqual(['frame']);

    await kernel.documents.close('d');
    time.advance(100);
    expect(ran).toEqual(['frame']);
    expect(time.pending).toEqual({ timers: 0, frames: 0 });
    await kernel.destroy();
  });

  it('a test context takes a clock, and its dispose cancels what was scheduled', async () => {
    const time = manualClock();
    const ctx = createTestContext({ clock: time.clock });
    const ran: string[] = [];
    ctx.clock.after(10, () => ran.push('timer'));
    await ctx.dispose();
    time.advance(10);
    expect(ran).toEqual([]);
  });

  it("without a clock, a kernel's instances have timers and no frames", async () => {
    const kernel = createKernel({ engine: immediateEngine(), plugins: [clockedPlugin] });
    await kernel.start();
    await kernel.documents.open(bytesInput('d'));
    const clock = kernel.capability(token, 'd');
    expect(clock.hasFrames).toBe(false);
    await new Promise<void>((resolve) => clock.after(1, resolve));
    await kernel.destroy();
  });
});

describe('manualClock', () => {
  it('runs timers in time order, ties in the order they were set, and never goes back', () => {
    const time = manualClock();
    const ran: string[] = [];
    time.clock.after(20, () => ran.push('b'));
    time.clock.after(10, () => {
      ran.push('a');
      time.clock.after(5, () => ran.push('a+5')); // falls due inside the same advance
    });
    time.clock.after(20, () => ran.push('c'));
    time.advance(30);
    expect(ran).toEqual(['a', 'a+5', 'b', 'c']);
    expect(time.now).toBe(30);
    expect(() => time.frame(10)).toThrow(/does not go back/);
  });
});
