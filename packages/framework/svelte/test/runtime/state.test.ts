import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { waitFor } from '@testing-library/svelte';
import { settingsReader, stateReader, useCapability } from '../../src/runtime';
import type { CurrentValue } from '../../src/runtime';
import { CounterToken, bytesInput, counterPlugin, counterState } from '../fixtures/counter-plugin';
import type { CounterCapability, CounterSettings } from '../fixtures/counter-plugin';
import Probes from '../fixtures/Probes.svelte';
import { latest, viewerWith } from '../fixtures/viewer';

/**
 * `stateReader`: a state declaration as a Svelte reader. It reads this subtree's document, gives
 * `empty` without one, and wakes a reaction only when a field it reads (or the selected value)
 * changes. `settingsReader`: a plugin's settings, the same with or without a document.
 */

const useCounterState = stateReader(counterState);
const useCounterSettings = settingsReader(CounterToken);
const plugins = [counterPlugin];

/** A probe that records `pick(reader())` on every change. */
const probe = <Result>(read: () => Result, pick: (result: Result) => unknown, scope?: string) => {
  const seen: unknown[] = [];
  return { read, pick: pick as (result: unknown) => unknown, seen, scope };
};
const whole = <T extends object>(record: T) => ({ ...record });
const current = <T>(value: CurrentValue<T>) => value.current;

describe('stateReader', () => {
  it('reads empty with no document, the state once one is ready, and empty after it closes', async () => {
    const state = probe(() => useCounterState(), whole);
    const { kernel } = await viewerWith(plugins, Probes, { probes: [state] });
    expect(latest(state.seen)).toEqual(counterState.empty);

    await kernel.documents.open(bytesInput('a'));
    flushSync();
    expect(latest(state.seen)).toEqual({ count: 0, label: 'start' });

    await kernel.documents.close('a');
    flushSync();
    expect(latest(state.seen)).toEqual(counterState.empty);
  });

  it('wakes a reaction only when a field it reads changes', async () => {
    const both = probe(() => useCounterState(), whole);
    const count = probe(
      () => useCounterState(),
      (state) => state.count,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [both, count] });
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const counter = kernel.capability(CounterToken);
    const [bothRuns, countRuns] = [both.seen.length, count.seen.length];

    counter.touch(); // readers wake, nothing changed
    counter.setLabel('start'); // a new state object, the same fields
    flushSync();
    expect(both.seen).toHaveLength(bothRuns);
    expect(count.seen).toHaveLength(countRuns);

    counter.setLabel('changed'); // a field the count probe doesn't read
    flushSync();
    expect(both.seen).toHaveLength(bothRuns + 1);
    expect(count.seen).toHaveLength(countRuns);

    counter.increment();
    flushSync();
    expect(latest(both.seen)).toEqual({ count: 1, label: 'changed' });
    expect(count.seen).toHaveLength(countRuns + 1);
    expect(latest(count.seen)).toBe(1);
  });

  it('with a selector, gives { current } and wakes only when the selected value changes', async () => {
    const counts = probe(() => useCounterState((state) => state.count), current);
    // A fresh object per read: compared field by field, not by identity.
    const pairs = probe(() => useCounterState((state) => ({ count: state.count })), current);
    const { kernel } = await viewerWith(plugins, Probes, { probes: [counts, pairs] });
    expect(latest(counts.seen)).toBe(-1);
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const counter = kernel.capability(CounterToken);
    const [countRuns, pairRuns] = [counts.seen.length, pairs.seen.length];

    counter.setLabel('changed');
    flushSync();
    expect(counts.seen).toHaveLength(countRuns);
    expect(pairs.seen).toHaveLength(pairRuns);

    counter.increment();
    flushSync();
    expect(counts.seen).toHaveLength(countRuns + 1);
    expect(latest(counts.seen)).toBe(1);
    expect(pairs.seen).toHaveLength(pairRuns + 1);
    expect(latest(pairs.seen)).toEqual({ count: 1 });
  });

  it('follows <DocumentScope>, and the active document outside one', async () => {
    const scoped = probe(
      () => useCounterState(),
      (state) => state.count,
      'b',
    );
    const active = probe(
      () => useCounterState(),
      (state) => state.count,
    );
    const { kernel } = await viewerWith(plugins, Probes, { probes: [scoped, active] });
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    expect(latest(scoped.seen)).toBe(-1); // "b" isn't open yet
    expect(latest(active.seen)).toBe(0);

    await kernel.documents.open(bytesInput('b'));
    kernel.documents.setActive('a');
    kernel.capability(CounterToken, 'b').increment();
    flushSync();
    expect(latest(scoped.seen)).toBe(1);
    expect(latest(active.seen)).toBe(0);

    kernel.documents.setActive('b');
    await waitFor(() => expect(latest(active.seen)).toBe(1));
  });
});

describe('settingsReader', () => {
  it('reads the settings with no document, and the same settings once one is open', async () => {
    const settings = probe(() => useCounterSettings(), whole);
    const { kernel } = await viewerWith(plugins, Probes, { probes: [settings] });
    const api = kernel.settingsOf(CounterToken);
    expect(latest(settings.seen)).toEqual(api.getSettings());

    api.updateSettings({ step: 2 }); // before any document
    flushSync();
    expect(latest(settings.seen)).toEqual({ step: 2, theme: { color: 'red', width: 1 } });

    await kernel.documents.open(bytesInput('a'));
    flushSync();
    expect(kernel.capability(CounterToken).getSettings()).toEqual(latest(settings.seen));
  });

  it('wakes only when a setting, or the selected one, changes', async () => {
    const all = probe(() => useCounterSettings(), whole);
    const themes = probe(() => useCounterSettings((settings) => settings.theme), current);
    const { kernel } = await viewerWith(plugins, Probes, { probes: [all, themes] });
    await kernel.documents.open(bytesInput('a'));
    flushSync();
    const counter = kernel.capability(CounterToken);
    const [allRuns, themeRuns] = [all.seen.length, themes.seen.length];

    counter.increment(); // state, not settings
    counter.updateSettings({ step: 1 }); // the value it already has
    flushSync();
    expect(all.seen).toHaveLength(allRuns);
    expect(themes.seen).toHaveLength(themeRuns);

    counter.updateSettings({ step: 5 });
    flushSync();
    expect(all.seen).toHaveLength(allRuns + 1);
    expect(themes.seen).toHaveLength(themeRuns); // the theme didn't change

    counter.updateSettings({ theme: { width: 3 } });
    flushSync();
    expect(latest(themes.seen)).toEqual({ color: 'red', width: 3 });
  });

  it("changes through useCapability's stand-in before the first document opens", async () => {
    let counter: CounterCapability | null = null;
    const steps = probe(() => {
      counter = useCapability(CounterToken);
      return useCounterSettings((settings: CounterSettings) => settings.step);
    }, current);
    const { kernel } = await viewerWith(plugins, Probes, { probes: [steps] });
    expect(kernel.documents.list()).toEqual([]);
    counter!.updateSettings({ step: 7 });
    flushSync();
    expect(latest(steps.seen)).toBe(7);
    expect(counter!.getSettings().step).toBe(7);
    counter!.resetSettings();
    flushSync();
    expect(latest(steps.seen)).toBe(1);
    expect(() => counter!.increment()).toThrow('no document is open'); // verbs still wait
  });
});
