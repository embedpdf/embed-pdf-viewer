/**
 * Regression tests for the per-instance Svelte PDF context.
 *
 * The Svelte adapter used to keep its context in one module-level $state
 * object shared by every consumer on the page, so a second <EmbedPDF>
 * instance overwrote the first one's registry and unmounting either reset
 * both. These tests pin the fixed behaviour: each instance owns its context,
 * descendants resolve their own instance's context through useRegistry(),
 * and consumers with no <EmbedPDF> ancestor get an inert fallback plus a
 * console warning.
 */
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { pdfContext } from '../../src/svelte';
import Host from './fixtures/Host.svelte';
import Probe from './fixtures/Probe.svelte';
import { resetSink, resolved } from './fixtures/sink';

const byLabel = (label: string) => {
  const entry = resolved.find((r) => r.label === label);
  if (!entry) throw new Error(`no context recorded for ${label}`);
  return entry.context;
};

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  resetSink();
  // The stub engine makes EmbedPDF's async initialize() reject after the
  // test ends; silence that path but keep calls observable.
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('per-instance context', () => {
  it('gives each <EmbedPDF> instance its own context', () => {
    const a = mount(Host, { target: document.body, props: { label: 'a' } });
    const b = mount(Host, { target: document.body, props: { label: 'b' } });
    flushSync();

    expect(byLabel('a:snippet')).not.toBe(byLabel('b:snippet'));

    unmount(a);
    unmount(b);
  });

  it('resolves the same context for the children snippet and descendant components', () => {
    const a = mount(Host, { target: document.body, props: { label: 'a' } });
    const b = mount(Host, { target: document.body, props: { label: 'b' } });
    flushSync();

    expect(byLabel('a:probe')).toBe(byLabel('a:snippet'));
    expect(byLabel('b:probe')).toBe(byLabel('b:snippet'));
    expect(byLabel('a:probe')).not.toBe(byLabel('b:probe'));

    unmount(a);
    unmount(b);
  });

  it('keeps the surviving instance untouched when a sibling unmounts', () => {
    const a = mount(Host, { target: document.body, props: { label: 'a' } });
    const b = mount(Host, { target: document.body, props: { label: 'b' } });
    flushSync();

    const contextA = byLabel('a:snippet');
    const before = { ...contextA };

    unmount(b);
    flushSync();

    // With the old shared singleton, B's teardown reset every field of the
    // one context A was also reading.
    expect(contextA.isInitializing).toBe(before.isInitializing);
    expect(contextA.pluginsReady).toBe(before.pluginsReady);
    expect(contextA.registry).toBe(before.registry);

    unmount(a);
  });
});

describe('outside an <EmbedPDF>', () => {
  it('resolves the inert fallback and warns', () => {
    const probe = mount(Probe, { target: document.body, props: { label: 'orphan' } });
    flushSync();

    const context = byLabel('orphan');
    expect(context.registry).toBeNull();
    expect(context.isInitializing).toBe(true);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no <EmbedPDF> ancestor'));

    unmount(probe);
  });

  it('warns on every resolution, not just the first', () => {
    // A module-level warn-once flag would be shared across SSR requests,
    // silencing the warning for every request after the first.
    const first = mount(Probe, { target: document.body, props: { label: 'first' } });
    const second = mount(Probe, { target: document.body, props: { label: 'second' } });
    flushSync();

    expect(warn).toHaveBeenCalledTimes(2);

    unmount(first);
    unmount(second);
  });

  it('hands every orphan the same read-only fallback', () => {
    const first = mount(Probe, { target: document.body, props: { label: 'first' } });
    const second = mount(Probe, { target: document.body, props: { label: 'second' } });
    flushSync();

    expect(byLabel('first')).toBe(byLabel('second'));
    expect(byLabel('first')).toBe(pdfContext);
    expect(Object.isFrozen(pdfContext)).toBe(true);
    // Writes that used to leak into every consumer now fail loudly.
    expect(() => {
      (pdfContext as { pluginsReady: boolean }).pluginsReady = true;
    }).toThrow(TypeError);

    unmount(first);
    unmount(second);
  });
});
