// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup } from '@testing-library/react';
import { createCapabilityToken } from '@embedpdf/core';
import {
  DEFAULT_SETTINGS,
  stagePlugin,
  stageState,
  StageScope,
  StageToken,
  useStageSettings,
  useStageState,
} from '../src/stage';
import type { StageCapability } from '../src/stage';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';
import type { CapabilityToken } from '../src/runtime';
import { bytesInput, viewerWith } from './counter-plugin';

/**
 * The Stage's state and settings hooks: the declared state with and without a
 * document, each view through its own token, and the view's settings.
 */

const ThumbsToken = createCapabilityToken<StageCapability>('stage-thumbs');
const plugins = [
  stagePlugin(),
  stagePlugin({ id: 'stage-thumbs', token: ThumbsToken, layout: 'grid', interaction: false }),
];
const latest = (renders: unknown[]) => renders[renders.length - 1];
const asHost = (token: CapabilityToken<StageCapability>) =>
  token as unknown as CapabilityToken<StageHostCapability>;

function StateProbe<Selected>({
  select,
  token,
  renders,
}: {
  select?: (state: typeof stageState.empty) => Selected;
  token?: CapabilityToken<StageCapability>;
  renders: unknown[];
}) {
  renders.push(useStageState(select, token));
  return null;
}

function SettingsProbe({ renders }: { renders: unknown[] }) {
  renders.push(useStageSettings((settings) => settings.layout));
  return null;
}

afterEach(cleanup);

describe('useStageState', () => {
  it('reads empty with no document, and the view’s state once one is open', async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(plugins, <StateProbe renders={renders} />);
    expect(latest(renders)).toBe(stageState.empty);

    await act(() => kernel.documents.open(bytesInput('a')));
    expect(latest(renders)).toMatchObject({ currentPageIndex: 0, pageCount: 1, viewRotation: 0 });

    act(() => kernel.capability(StageToken).setViewRotation(90));
    expect(latest(renders)).toMatchObject({ viewRotation: 90 });
  });

  it('reads the view a token names, or the nearest scope', async () => {
    const main: unknown[] = [];
    const named: unknown[] = [];
    const scoped: unknown[] = [];
    const { kernel } = await viewerWith(
      plugins,
      <>
        <StateProbe select={(state) => state.viewRotation} renders={main} />
        <StateProbe select={(state) => state.viewRotation} token={ThumbsToken} renders={named} />
        <StageScope token={ThumbsToken}>
          <StateProbe select={(state) => state.viewRotation} renders={scoped} />
        </StageScope>
      </>,
    );
    await act(() => kernel.documents.open(bytesInput('a')));
    act(() => kernel.capability(asHost(ThumbsToken)).setViewRotation(180));
    expect(latest(main)).toBe(0);
    expect(latest(named)).toBe(180);
    expect(latest(scoped)).toBe(180);
  });
});

describe('useStageSettings', () => {
  it('reads the defaults with no document, then the view’s settings as they change', async () => {
    const renders: unknown[] = [];
    const { kernel } = await viewerWith(plugins, <SettingsProbe renders={renders} />);
    expect(latest(renders)).toBe(DEFAULT_SETTINGS.layout);

    await act(() => kernel.documents.open(bytesInput('a')));
    act(() => kernel.capability(StageToken).updateSettings({ layout: 'horizontal' }));
    expect(latest(renders)).toBe('horizontal');
  });
});
