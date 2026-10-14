import { h, isRef } from 'vue';
import { afterEach, describe, expect, it } from 'vitest';
import { enableAutoUnmount } from '@vue/test-utils';
import { DocumentScope, useCapability } from '../src/runtime';
import { settingsComposable, stateComposable } from '../src/state';
import type { FieldRefs } from '../src/state';
import {
  CounterToken,
  bytesInput,
  counterPlugin,
  counterState,
  probe,
  settle,
  viewerWith,
} from './counter-plugin';
import type { CounterCapability, CounterSettings } from './counter-plugin';

/**
 * `stateComposable`: a state declaration as a Vue composable. It reads this
 * subtree's document, reads `empty` without one, and its refs update only when
 * a field (or the selected value) changes. `settingsComposable`: a plugin's
 * settings, the same with or without a document.
 */

const useCounterState = stateComposable(counterState);
const useCounterSettings = settingsComposable(CounterToken);
const plugins = [counterPlugin];
const latest = (renders: unknown[]) => renders[renders.length - 1];

/** A component that records the count it reads each time it renders. */
const countInto = (renders: unknown[]) =>
  probe(() => {
    const count = useCounterState((state) => state.count);
    return () => {
      renders.push(count.value);
      return null;
    };
  });

enableAutoUnmount(afterEach);

describe('stateComposable', () => {
  it('reads empty with no document, the state once one is ready, and empty after it closes', async () => {
    const renders: unknown[] = [];
    const Probe = probe(() => {
      const { count, label } = useCounterState();
      return () => {
        renders.push({ count: count.value, label: label.value });
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    expect(latest(renders)).toEqual(counterState.empty);

    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(latest(renders)).toEqual({ count: 0, label: 'start' });

    await kernel.documents.close('a');
    await settle();
    expect(latest(renders)).toEqual(counterState.empty);
  });

  it('gives a ref per field, and each updates only when its own value changes', async () => {
    const counts: unknown[] = [];
    const labels: unknown[] = [];
    let fields: FieldRefs<typeof counterState.empty> | null = null;
    const Counts = probe(() => {
      fields = useCounterState();
      const { count } = fields;
      return () => {
        counts.push(count.value);
        return null;
      };
    });
    const Labels = probe(() => {
      const { label } = useCounterState();
      return () => {
        labels.push(label.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => [h(Counts), h(Labels)]);
    expect(Object.keys(fields!)).toEqual(['count', 'label']);
    expect(isRef(fields!.count)).toBe(true);
    await kernel.documents.open(bytesInput('a'));
    await settle();
    const counter = kernel.capability(CounterToken);
    const [countRenders, labelRenders] = [counts.length, labels.length];

    counter.touch(); // readers wake, nothing changed
    counter.setLabel('start'); // a new state object, the same fields
    await settle();
    expect(counts).toHaveLength(countRenders);
    expect(labels).toHaveLength(labelRenders);

    counter.increment();
    await settle();
    expect(counts).toHaveLength(countRenders + 1);
    expect(latest(counts)).toBe(1);
    expect(labels).toHaveLength(labelRenders);
  });

  it('with a selector, is one ref that updates only when the selected value changes', async () => {
    const counts: unknown[] = [];
    const pairs: unknown[] = [];
    const Counts = probe(() => {
      const count = useCounterState((state) => state.count);
      return () => {
        counts.push(count.value);
        return null;
      };
    });
    // A fresh object per read: compared field by field, not by identity.
    const Pairs = probe(() => {
      const pair = useCounterState((state) => ({ count: state.count }));
      return () => {
        pairs.push(pair.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => [h(Counts), h(Pairs)]);
    expect(latest(counts)).toBe(-1);
    await kernel.documents.open(bytesInput('a'));
    await settle();
    const counter = kernel.capability(CounterToken);
    const [countRenders, pairRenders] = [counts.length, pairs.length];

    counter.setLabel('changed');
    await settle();
    expect(counts).toHaveLength(countRenders);
    expect(pairs).toHaveLength(pairRenders);

    counter.increment();
    await settle();
    expect(counts).toHaveLength(countRenders + 1);
    expect(latest(counts)).toBe(1);
    expect(pairs).toHaveLength(pairRenders + 1);
    expect(latest(pairs)).toEqual({ count: 1 });
  });

  it('follows <DocumentScope>, and the active document outside one', async () => {
    const scoped: unknown[] = [];
    const active: unknown[] = [];
    const ScopedCount = countInto(scoped);
    const ActiveCount = countInto(active);
    const { kernel } = await viewerWith(plugins, () => [
      h(DocumentScope, { id: 'b' }, () => h(ScopedCount)),
      h(ActiveCount),
    ]);
    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(latest(scoped)).toBe(-1); // "b" isn't open yet
    expect(latest(active)).toBe(0);

    await kernel.documents.open(bytesInput('b'));
    kernel.documents.setActive('a');
    kernel.capability(CounterToken, 'b').increment();
    await settle();
    expect(latest(scoped)).toBe(1);
    expect(latest(active)).toBe(0);

    kernel.documents.setActive('b');
    await settle();
    expect(latest(active)).toBe(1);
  });
});

describe('settingsComposable', () => {
  it('reads the settings with no document, and the same settings once one is open', async () => {
    const renders: unknown[] = [];
    const Probe = probe(() => {
      const settings = useCounterSettings((value) => value);
      return () => {
        renders.push(settings.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => h(Probe));
    const settings = kernel.settingsOf(CounterToken);
    expect(latest(renders)).toBe(settings.getSettings());

    settings.updateSettings({ step: 2 }); // before any document
    await settle();
    expect(latest(renders)).toEqual({ step: 2, theme: { color: 'red', width: 1 } });

    await kernel.documents.open(bytesInput('a'));
    await settle();
    expect(kernel.capability(CounterToken).getSettings()).toBe(latest(renders));
  });

  it('updates only when a setting, or the selected one, changes', async () => {
    const steps: unknown[] = [];
    const themes: unknown[] = [];
    const Steps = probe(() => {
      const { step } = useCounterSettings();
      return () => {
        steps.push(step.value);
        return null;
      };
    });
    const Themes = probe(() => {
      const theme = useCounterSettings((settings: CounterSettings) => settings.theme);
      return () => {
        themes.push(theme.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => [h(Steps), h(Themes)]);
    await kernel.documents.open(bytesInput('a'));
    await settle();
    const counter = kernel.capability(CounterToken);
    const [stepRenders, themeRenders] = [steps.length, themes.length];

    counter.increment(); // state, not settings
    counter.updateSettings({ step: 1 }); // the value it already has
    await settle();
    expect(steps).toHaveLength(stepRenders);
    expect(themes).toHaveLength(themeRenders);

    counter.updateSettings({ step: 5 });
    await settle();
    expect(steps).toHaveLength(stepRenders + 1);
    expect(themes).toHaveLength(themeRenders); // the theme didn't change

    counter.updateSettings({ theme: { width: 3 } });
    await settle();
    expect(latest(themes)).toEqual({ color: 'red', width: 3 });
  });

  it("changes through useCapability's stand-in before the first document opens", async () => {
    const renders: unknown[] = [];
    let counter: CounterCapability | null = null;
    const Chrome = probe(() => {
      counter = useCapability(CounterToken);
      const step = useCounterSettings((settings) => settings.step);
      return () => {
        renders.push(step.value);
        return null;
      };
    });
    const { kernel } = await viewerWith(plugins, () => h(Chrome));
    expect(kernel.documents.list()).toEqual([]);
    counter!.updateSettings({ step: 7 });
    await settle();
    expect(latest(renders)).toBe(7);
    expect(counter!.getSettings().step).toBe(7);
    counter!.resetSettings();
    await settle();
    expect(latest(renders)).toBe(1);
    expect(() => counter!.increment()).toThrow('no document is open'); // verbs still wait
  });
});
