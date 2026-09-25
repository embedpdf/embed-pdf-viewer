/**
 * Randomized interleavings of changes to one record: restyles and flag
 * toggles whose engine writes settle in any order, some refused, with other
 * sessions' updates arriving meanwhile. The fake engine applies a write when
 * it answers it and publishes the result before the promise settles, as the
 * real engines do.
 *
 * After every step, each field shows the newest change the engine has not
 * settled for that field (a change stays until every older change of the
 * record settled), or else the engine's value. The record renders the way it
 * did when the user made the newest unsettled change (a restyle renders live,
 * whatever another session does meanwhile), or else by its render preference:
 * live once this session restyled it, the engine's raster again after
 * another session's update. Once everything settled, the view is the engine's
 * record and nothing is pending.
 */
import type { DocumentEvent } from '@embedpdf/core';
import type { AnnotationDTO, AnnotationFlags, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { annotationHarness } from './harness';

const PAGE = toPageRef(1);
const REF: AnnotationRef = { kind: 'objectNumber', page: PAGE, annotObjectNumber: 20 };
const FLAGS: AnnotationFlags = {
  invisible: false,
  hidden: false,
  print: true,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
};
const COLORS = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#00ffff'];

interface EngineState {
  color: string;
  print: boolean;
}

const rgb = (hex: string) => ({
  r: parseInt(hex.slice(1, 3), 16),
  g: parseInt(hex.slice(3, 5), 16),
  b: parseInt(hex.slice(5, 7), 16),
});
const hex = ({ r, g, b }: { r: number; g: number; b: number }) =>
  `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;

const squareOf = (state: EngineState): AnnotationDTO =>
  ({
    ref: REF,
    page: PAGE,
    index: 20,
    identityQuality: 'durable',
    nm: null,
    ...FLAGS,
    print: state.print,
    contents: null,
    subject: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    subtype: 'square',
    rect: { left: 100, bottom: 700, right: 180, top: 760 },
    color: rgb(state.color),
    interiorColor: null,
    opacity: 1,
    strokeWidth: 2,
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
  }) as unknown as AnnotationDTO;

/** A small seeded generator (mulberry32), so a failure replays exactly. */
function random(seed: number) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)]! };
}

/** One write the fake engine holds until the test answers it. */
interface HeldWrite {
  patch: { color?: { r: number; g: number; b: number }; print?: boolean };
  resolve(result: unknown): void;
  reject(error: unknown): void;
}

type Source = 'vector' | 'baked';

/** One change the user made, as the test expects the view to treat it. */
interface UserChange {
  field: 'color' | 'print';
  value: string | boolean;
  state: 'pending' | 'accepted' | 'refused';
  /** How the record rendered once the user made the change. */
  source: Source;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function play(seed: number, steps: number) {
  const rng = random(seed);
  const harness = annotationHarness();
  const engine: EngineState = { color: '#000000', print: true };
  await harness.load([squareOf(engine)]);
  harness.capability.select(REF);

  const held: HeldWrite[] = [];
  const changes: UserChange[] = [];
  harness.update.mockImplementation(
    (_ref: AnnotationRef, patch: HeldWrite['patch']) =>
      new Promise((resolve, reject) => held.push({ patch, resolve, reject })),
  );

  // Writes are held in the order they were made, one per change.
  const inFlight: UserChange[] = [];
  /** Whether the record renders live once nothing is pending. */
  let preferVector = false;

  /** The changes still showing: not refused, and unsettled or behind an unsettled older one. */
  const outstanding = () =>
    changes.filter(
      (change, index) =>
        change.state !== 'refused' &&
        (change.state === 'pending' ||
          changes.slice(0, index).some((older) => older.state === 'pending')),
    );
  const expected = (field: UserChange['field']) => {
    const newest = outstanding()
      .filter((change) => change.field === field)
      .at(-1);
    if (newest) return newest.value;
    return field === 'color' ? engine.color : engine.print;
  };
  const expectedSource = (): Source =>
    outstanding().at(-1)?.source ?? (preferVector ? 'vector' : 'baked');
  const check = (label: string) => {
    const annotation = harness.capability.get(REF)!;
    expect(annotation.props.color, `${label}: color`).toBe(expected('color'));
    expect(annotation.flags.print, `${label}: print`).toBe(expected('print'));
    const item = harness.capability.listPageItems(PAGE).find(({ id }) => id === 'obj:20')!;
    expect(item.source, `${label}: source`).toBe(expectedSource());
  };

  for (let step = 0; step < steps; step++) {
    const roll = rng.next();
    const label = `seed ${seed} step ${step}`;
    if (roll < 0.3) {
      const color = rng.pick(COLORS);
      void harness.capability.updateSelection({ color });
      // A restyle renders live: this session owns the appearance now.
      const change: UserChange = {
        field: 'color',
        value: color,
        state: 'pending',
        source: 'vector',
      };
      preferVector = true;
      changes.push(change);
      inFlight.push(change);
    } else if (roll < 0.5) {
      const print = !harness.capability.get(REF)!.flags.print;
      // Flags leave the appearance alone: the record renders as it did.
      const source = expectedSource();
      void harness.capability.updateSelectionFlags({ print });
      const change: UserChange = { field: 'print', value: print, state: 'pending', source };
      if (source === 'vector') preferVector = true;
      changes.push(change);
      inFlight.push(change);
    } else if (roll < 0.85 && held.length) {
      const index = Math.floor(rng.next() * held.length);
      const change = inFlight.splice(index, 1)[0]!;
      const [write] = held.splice(index, 1);
      if (rng.next() < 0.75) {
        if (write!.patch.color) engine.color = hex(write!.patch.color);
        if (write!.patch.print !== undefined) engine.print = write!.patch.print;
        change.state = 'accepted';
        write!.resolve({ annotation: squareOf(engine) });
      } else {
        change.state = 'refused';
        write!.reject(new Error('refused'));
      }
      await flush();
    } else {
      // Another session changes the record: its raster is the truth again.
      if (rng.next() < 0.5) engine.color = rng.pick(COLORS);
      else engine.print = !engine.print;
      preferVector = false;
      harness.emit({
        type: 'annotation.updated',
        page: PAGE,
        origin: { kind: 'remote', sessionId: 'cloud:bob', sub: 'bob', ts: 0, serverId: step + 100 },
        annotation: squareOf(engine),
        appearance: { changed: false },
        meta: {
          affectedPages: [],
          cacheDelta: null,
          changed: [],
          weakRefsInvalidated: false,
          shouldRefetch: null,
        },
      } as unknown as DocumentEvent);
    }
    check(label);
  }

  // Answer everything still in flight, in a random order.
  while (held.length) {
    const index = Math.floor(rng.next() * held.length);
    const change = inFlight.splice(index, 1)[0]!;
    const [write] = held.splice(index, 1);
    if (write!.patch.color) engine.color = hex(write!.patch.color);
    if (write!.patch.print !== undefined) engine.print = write!.patch.print;
    change.state = 'accepted';
    write!.resolve({ annotation: squareOf(engine) });
    await flush();
    check(`seed ${seed} drain`);
  }
  expect(harness.state().pending).toEqual([]);
  expect(harness.capability.get(REF)!.props.color).toBe(engine.color);
  expect(harness.capability.get(REF)!.flags.print).toBe(engine.print);
}

describe('randomized interleavings of changes to one record', () => {
  for (const seed of Array.from({ length: 40 }, (_, index) => index + 1)) {
    it(`seed ${seed}`, async () => {
      await play(seed, 40);
    });
  }
});
