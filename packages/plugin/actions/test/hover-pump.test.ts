import { describe, expect, it } from 'vitest';

import { toPageRef, type AnnotationRef } from '@embedpdf/engine-core/runtime';

import { createHoverPump, type HoverTarget } from '../src/hover-pump';
import type { ActionTrigger, ActionTriggerResult } from '../src/host-contract';

const ref = (objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: toPageRef(1),
  annotObjectNumber: objectNumber,
});
const target = (objectNumber: number, events?: HoverTarget['events']): HoverTarget => ({
  ref: ref(objectNumber),
  page: toPageRef(1),
  ...(events ? { events } : {}),
});

/** A dispatch fake whose completion is externally controlled. */
function fakeDispatch() {
  const submitted: string[] = [];
  const pending: Array<() => void> = [];
  const dispatch = (trigger: ActionTrigger): Promise<ActionTriggerResult> => {
    if (trigger.scope !== 'annotation') throw new Error('unexpected scope');
    const objectNumber = trigger.ref.kind === 'objectNumber' ? trigger.ref.annotObjectNumber : -1;
    submitted.push(`${trigger.event === 'cursorEnter' ? 'E' : 'X'}:${objectNumber}`);
    return new Promise((resolve) =>
      pending.push(() => resolve({ status: 'executed', steps: [], diagnostics: [] })),
    );
  };
  const settleAll = async () => {
    while (pending.length) pending.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
  };
  return { dispatch, submitted, settleAll };
}

describe('the shared hover pump', () => {
  it('delivers Exit(A) then Enter(B) as one synchronously-submitted pair', async () => {
    const fake = fakeDispatch();
    const pump = createHoverPump(fake.dispatch);
    pump.hover(target(1));
    expect(fake.submitted).toEqual(['E:1']);
    await fake.settleAll();
    // A→B while idle: the pair is submitted back-to-back, in order, at once.
    pump.hover(target(2));
    expect(fake.submitted).toEqual(['E:1', 'X:1', 'E:2']);
  });

  it('never splits the pair even when the first action is slow', async () => {
    const fake = fakeDispatch();
    const pump = createHoverPump(fake.dispatch);
    pump.hover(target(1)); // E:1 in flight — slow (never settled yet)
    pump.hover(target(2)); // arrives while in flight
    // Nothing more submitted until the in-flight transition settles…
    expect(fake.submitted).toEqual(['E:1']);
    await fake.settleAll();
    // …then Exit(1) precedes Enter(2), atomically submitted.
    expect(fake.submitted).toEqual(['E:1', 'X:1', 'E:2']);
  });

  it('skips intermediate targets under pressure', async () => {
    const fake = fakeDispatch();
    const pump = createHoverPump(fake.dispatch);
    pump.hover(target(1));
    pump.hover(target(2)); // intermediate — pointer moved on before settle
    pump.hover(target(3));
    pump.hover(null);
    pump.hover(target(4)); // final resting target
    await fake.settleAll();
    await fake.settleAll();
    expect(fake.submitted).toEqual(['E:1', 'X:1', 'E:4']); // 2 and 3 never happened
  });

  it('settling on the same target is free; leaving to nothing exits once', async () => {
    const fake = fakeDispatch();
    const pump = createHoverPump(fake.dispatch);
    pump.hover(target(1));
    await fake.settleAll();
    pump.hover(target(1)); // no transition
    pump.hover(target(1));
    expect(fake.submitted).toEqual(['E:1']);
    pump.hover(null);
    await fake.settleAll();
    expect(fake.submitted).toEqual(['E:1', 'X:1']);
    pump.hover(null); // still nothing — no double exit
    expect(fake.submitted).toEqual(['E:1', 'X:1']);
  });

  it('honours per-target event flags so tree-less halves never dispatch', async () => {
    const fake = fakeDispatch();
    const pump = createHoverPump(fake.dispatch);
    pump.hover(target(1, { enter: false })); // only an /X tree exists
    expect(fake.submitted).toEqual([]);
    await fake.settleAll();
    pump.hover(target(2, { exit: false })); // only an /E tree exists
    expect(fake.submitted).toEqual(['X:1', 'E:2']);
    await fake.settleAll();
    pump.hover(null);
    expect(fake.submitted).toEqual(['X:1', 'E:2']); // 2's exit flagged off
  });

  it('reset forgets the delivered target without dispatching', async () => {
    const fake = fakeDispatch();
    const pump = createHoverPump(fake.dispatch);
    pump.hover(target(1));
    await fake.settleAll();
    pump.reset();
    pump.hover(target(2));
    await fake.settleAll();
    expect(fake.submitted).toEqual(['E:1', 'E:2']); // no X:1 — state was dropped
  });
});
