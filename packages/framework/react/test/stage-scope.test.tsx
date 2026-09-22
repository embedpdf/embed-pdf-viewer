// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { createCapabilityToken } from '@embedpdf/core';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import type { StageCapability } from '@embedpdf/plugin-stage/contract';
import { StageScope, useStageToken } from '../src/stage-scope';
import type { StageTokenProp } from '../src/stage-scope';

/**
 * `<StageScope>` resolution — the rule every stage hook and stage-bound chrome
 * follows: an explicit token wins, else the nearest scope, else the main lens.
 */
const thumbs = createCapabilityToken<StageCapability>('stage-thumbs');
const other = createCapabilityToken<StageCapability>('stage-other');

function Probe({
  explicit,
  onToken,
}: {
  explicit?: StageTokenProp;
  onToken: (token: StageTokenProp) => void;
}) {
  onToken(useStageToken(explicit));
  return null;
}

afterEach(cleanup);

describe('StageScope', () => {
  it('defaults to the main lens outside any scope', () => {
    let seen: StageTokenProp | null = null;
    render(<Probe onToken={(token) => (seen = token)} />);
    expect(seen).toBe(StageToken);
  });

  it('binds to the nearest scope, and an explicit token still wins', () => {
    const seen: StageTokenProp[] = [];
    render(
      <StageScope token={other}>
        <StageScope token={thumbs}>
          <Probe onToken={(token) => seen.push(token)} />
          <Probe explicit={StageToken} onToken={(token) => seen.push(token)} />
        </StageScope>
        <Probe onToken={(token) => seen.push(token)} />
      </StageScope>,
    );
    expect(seen).toEqual([thumbs, StageToken, other]);
  });
});
