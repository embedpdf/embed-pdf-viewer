import { act, cleanup, fireEvent, waitFor } from '@testing-library/react';
// @vitest-environment happy-dom
import * as React from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { DocumentGate } from '../src/runtime';
import { Scrollbar, StageToken, stagePlugin } from '../src/stage';
import { bytesInput, viewerWith } from './counter-plugin';

import type { CapabilityToken } from '../src/runtime';
import type { StageHostCapability } from '@embedpdf/plugin-stage/contract/host';

/**
 * The scrollbar against a real stage: a press on the bar is the bar's own, so the Stage, which
 * listens natively on an ancestor of it, never begins a pan with it.
 */

const thumb = () => document.querySelector<HTMLElement>('[data-embedpdf-scrollbar-thumb]');
const track = () => document.querySelector<HTMLElement>('[data-embedpdf-scrollbar]');

/** The Stage listens natively on an element between the bar and React's root. */
function StageBelow({ presses, children }: { presses: Event[]; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const element = ref.current!;
    const onPress = (event: Event) => presses.push(event);
    element.addEventListener('pointerdown', onPress);
    return () => element.removeEventListener('pointerdown', onPress);
  }, [presses]);
  return <div ref={ref}>{children}</div>;
}

async function scrollableStage(presses: Event[]) {
  const { kernel } = await viewerWith(
    [stagePlugin()],
    <DocumentGate>
      <StageBelow presses={presses}>
        <Scrollbar axis="y" autoHide={false} />
      </StageBelow>
    </DocumentGate>,
  );
  await act(() => kernel.documents.open(bytesInput('a')));
  const stage = kernel.capability(StageToken as unknown as CapabilityToken<StageHostCapability>);
  // Shorter than the page, so there is something to scroll.
  act(() => stage.setViewportSize({ width: 800, height: 200 }));
  await waitFor(() => expect(thumb()).not.toBeNull());
  return stage;
}

afterEach(cleanup);

describe('<Scrollbar>', () => {
  it('keeps a press on the thumb from the page below it, and starts a drag', async () => {
    const stagePresses: Event[] = [];
    await scrollableStage(stagePresses);

    fireEvent.pointerDown(thumb()!, { button: 0 });

    expect(stagePresses).toHaveLength(0);
    expect(track()!.hasAttribute('data-dragging')).toBe(true);
    fireEvent.pointerUp(track()!);
    expect(track()!.hasAttribute('data-dragging')).toBe(false);
  });

  it('keeps a press on the track from the page below it, and pages toward the pointer', async () => {
    const stagePresses: Event[] = [];
    const stage = await scrollableStage(stagePresses);
    expect(stage.getScrollMetrics().scrollTop).toBe(0);

    fireEvent.pointerDown(track()!, { button: 0, clientY: 150 });
    fireEvent.pointerUp(track()!);

    expect(stagePresses).toHaveLength(0);
    expect(stage.getScrollMetrics().scrollTop).toBeGreaterThan(0);
  });
});
