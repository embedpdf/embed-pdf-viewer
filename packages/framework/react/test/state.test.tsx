// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, waitFor } from '@testing-library/react';
import { DocumentScope, useCapability } from '../src/runtime';
import { settingsHook, stateHook } from '../src/state';
import {
  CounterToken,
  bytesInput,
  counterPlugin,
  counterState,
  viewerWith,
} from './counter-plugin';
import type { CounterCapability, CounterSettings } from './counter-plugin';

/**
 * `stateHook`: a state declaration as a React hook. It reads this subtree's
 * document, returns `empty` without one, and re-renders only when a field (or
 * the selected value) changes. `settingsHook`: a plugin's settings as a React
 * hook, the same with or without a document.
 */

const useCounterState = stateHook(counterState);
const useCounterSettings = settingsHook(CounterToken);
const plugins = [counterPlugin];
const latest = (renders: unknown[]) => renders[renders.length - 1];

function Probe<Selected>({
  select,
  renders,
}: {
  select?: (state: { count: number; label: string }) => Selected;
  renders: unknown[];
}) {
  renders.push(useCounterState(select));
  return null;
}

afterEach(cleanup);

describe('stateHook', () => {
  it('reads empty with no document, the state once one is ready, and empty after it closes', async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(plugins, <Probe renders={renders} />);
    expect(latest(renders)).toBe(counterState.empty);

    await act(() => kernel.documents.open(bytesInput('a')));
    expect(latest(renders)).toEqual({ count: 0, label: 'start' });

    await act(() => kernel.documents.close('a'));
    expect(latest(renders)).toBe(counterState.empty);
  });

  it('re-renders only when a field changes', async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(plugins, <Probe renders={renders} />);
    await act(() => kernel.documents.open(bytesInput('a')));
    const counter = kernel.capability(CounterToken);
    const before = renders.length;
    const state = latest(renders);

    act(() => counter.touch()); // readers wake, nothing changed
    act(() => counter.setLabel('start')); // a new state object, the same fields
    expect(renders).toHaveLength(before);

    act(() => counter.increment());
    expect(renders).toHaveLength(before + 1);
    expect(latest(renders)).toEqual({ count: 1, label: 'start' });
    expect(latest(renders)).not.toBe(state);
  });

  it('with a selector, re-renders only when the selected value changes', async () => {
    const counts: unknown[] = [];
    const pairs: unknown[] = [];
    const { kernel } = await viewerWith(
      plugins,
      <>
        <Probe select={(state) => state.count} renders={counts} />
        {/* A fresh object per read: compared field by field, not by identity. */}
        <Probe select={(state) => ({ count: state.count })} renders={pairs} />
      </>,
    );
    expect(latest(counts)).toBe(-1);
    await act(() => kernel.documents.open(bytesInput('a')));
    const counter = kernel.capability(CounterToken);
    const countRenders = counts.length;
    const pairRenders = pairs.length;

    act(() => counter.setLabel('changed'));
    expect(counts).toHaveLength(countRenders);
    expect(pairs).toHaveLength(pairRenders);

    act(() => counter.increment());
    expect(counts).toHaveLength(countRenders + 1);
    expect(latest(counts)).toBe(1);
    expect(pairs).toHaveLength(pairRenders + 1);
    expect(latest(pairs)).toEqual({ count: 1 });
  });

  it('follows <DocumentScope>, and the active document outside one', async () => {
    const scoped: unknown[] = [];
    const active: unknown[] = [];
    const { kernel } = await viewerWith(
      plugins,
      <>
        <DocumentScope id="b">
          <Probe select={(state) => state.count} renders={scoped} />
        </DocumentScope>
        <Probe select={(state) => state.count} renders={active} />
      </>,
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    expect(latest(scoped)).toBe(-1); // "b" isn't open yet
    expect(latest(active)).toBe(0);

    await act(() => kernel.documents.open(bytesInput('b')));
    act(() => kernel.documents.setActive('a'));
    act(() => kernel.capability(CounterToken, 'b').increment());
    expect(latest(scoped)).toBe(1);
    expect(latest(active)).toBe(0);

    act(() => kernel.documents.setActive('b'));
    await waitFor(() => expect(latest(active)).toBe(1));
  });
});

function SettingsProbe<Selected>({
  select,
  renders,
}: {
  select?: (settings: CounterSettings) => Selected;
  renders: unknown[];
}) {
  renders.push(useCounterSettings(select));
  return null;
}

describe('settingsHook', () => {
  it('reads the settings with no document, and the same settings once one is open', async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(plugins, <SettingsProbe renders={renders} />);
    const settings = kernel.settingsOf(CounterToken);
    expect(latest(renders)).toBe(settings.getSettings());

    act(() => settings.updateSettings({ step: 2 })); // before any document
    expect(latest(renders)).toEqual({ step: 2, theme: { color: 'red', width: 1 } });

    await act(() => kernel.documents.open(bytesInput('a')));
    expect(kernel.capability(CounterToken).getSettings()).toBe(latest(renders));
  });

  it('re-renders only when a setting, or the selected one, changes', async () => {
    const all: unknown[] = [];
    const themes: unknown[] = [];
    const { kernel } = await viewerWith(
      plugins,
      <>
        <SettingsProbe renders={all} />
        <SettingsProbe select={(settings) => settings.theme} renders={themes} />
      </>,
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    const counter = kernel.capability(CounterToken);
    const [allRenders, themeRenders] = [all.length, themes.length];

    act(() => counter.increment()); // state, not settings
    act(() => counter.updateSettings({ step: 1 })); // the value it already has
    expect(all).toHaveLength(allRenders);
    expect(themes).toHaveLength(themeRenders);

    act(() => counter.updateSettings({ step: 5 }));
    expect(all).toHaveLength(allRenders + 1);
    expect(themes).toHaveLength(themeRenders); // the theme didn't change

    act(() => counter.updateSettings({ theme: { width: 3 } }));
    expect(latest(themes)).toEqual({ color: 'red', width: 3 });
  });

  it("changes through useCapability's stand-in before the first document opens", async () => {
    const renders: unknown[] = [];
    let counter: CounterCapability | null = null;
    function Chrome() {
      counter = useCapability(CounterToken);
      renders.push(useCounterSettings((settings) => settings.step));
      return null;
    }
    const { kernel } = await viewerWith(plugins, <Chrome />);
    expect(kernel.documents.list()).toEqual([]);
    act(() => counter!.updateSettings({ step: 7 }));
    expect(latest(renders)).toBe(7);
    expect(counter!.getSettings().step).toBe(7);
    act(() => counter!.resetSettings());
    expect(latest(renders)).toBe(1);
    expect(() => counter!.increment()).toThrow('no document is open'); // verbs still wait
  });
});
