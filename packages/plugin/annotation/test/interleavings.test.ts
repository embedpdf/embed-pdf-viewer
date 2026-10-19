/**
 * Randomized interleavings of changes to one record, on the change queue:
 * restyles and flag toggles, each one change, answered in the order they were
 * staged (as both engines answer), some refused, with other sessions' updates
 * arriving meanwhile. A restyle to the colour the record already shows
 * changes nothing and sends nothing. The fake engine applies a change when it
 * answers it and publishes its events before the answer, as the real engines
 * do.
 *
 * After every step, each field shows the newest change the engine hasn't
 * answered for that field, or else the engine's value. The record draws live
 * when what it shows differs visibly from the engine's record (a colour the
 * engine's raster doesn't have), and otherwise by its render preference:
 * live once this session restyled it, the engine's raster again after
 * another session's update. Once everything is answered, the view is the
 * engine's record and nothing is pending.
 */
import type { DocumentEvent } from '@embedpdf/core';
import type { AnnotationFlags, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import { annotationHarness, type FileAnnotation, dataOf } from './harness';

const PAGE = toPageRef(1);
const REF: AnnotationRef = { kind: 'objectNumber', page: PAGE, objectNumber: 20 };
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

const squareOf = (state: EngineState): FileAnnotation =>
  ({
    ref: REF,
    page: PAGE,
    hasAppearance: true,
    appearanceState: null,
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
    box: { left: 100, bottom: 700, right: 180, top: 760 },
    color: state.color,
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
  }) as unknown as FileAnnotation;

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

/** The change the fake engine is applying, held until the test answers it. */
interface HeldWrite {
  patch: { color?: string; print?: boolean };
  resolve(result: unknown): void;
  reject(error: unknown): void;
}

type Source = 'vector' | 'baked';

/** One change the user made and the engine hasn't answered yet. */
interface UserChange {
  field: 'color' | 'print';
  value: string | boolean;
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

async function play(seed: number, steps: number) {
  const rng = random(seed);
  const harness = annotationHarness();
  const engine: EngineState = { color: '#000000', print: true };
  await harness.load([squareOf(engine)]);
  harness.capability.selection.set([REF]);

  // The engine works on one change at a time: the oldest unanswered one.
  const held: HeldWrite[] = [];
  harness.update.mockImplementation(
    (_ref: AnnotationRef, patch: HeldWrite['patch']) =>
      new Promise((resolve, reject) => held.push({ patch, resolve, reject })),
  );

  /** The user's changes the engine hasn't answered, oldest first. */
  const unanswered: UserChange[] = [];
  /** Whether the record draws live when it shows what the engine has. */
  let preferVector = false;

  const expected = (field: UserChange['field']) => {
    const newest = unanswered.filter((change) => change.field === field).at(-1);
    if (newest) return newest.value;
    return field === 'color' ? engine.color : engine.print;
  };
  // A colour the engine's raster doesn't show draws live; a flag never matters.
  const expectedSource = (): Source =>
    expected('color') !== engine.color || preferVector ? 'vector' : 'baked';
  const check = (label: string) => {
    const annotation = harness.capability.get(REF)!;
    expect(dataOf(annotation).color, `${label}: color`).toBe(expected('color'));
    expect(annotation.print, `${label}: print`).toBe(expected('print'));
    const item = harness.capability.listPageItems(PAGE).find(({ id }) => id === 'obj:20')!;
    expect(item.source, `${label}: source`).toBe(expectedSource());
    expect(harness.pending(), `${label}: pending`).toHaveLength(unanswered.length);
  };

  /** The engine answers the oldest change: applies it, or refuses it. */
  const answerOldest = async (accept: boolean) => {
    const change = unanswered.shift()!;
    const write = held.shift()!;
    expect(write.patch).toMatchObject({ [change.field]: change.value });
    if (accept) {
      if (write.patch.color) engine.color = write.patch.color;
      if (write.patch.print !== undefined) engine.print = write.patch.print;
      write.resolve({ annotation: squareOf(engine) });
    } else {
      write.reject(new Error('refused'));
    }
    // The answer lands, and the engine starts on the next change.
    await flush();
  };

  for (let step = 0; step < steps; step++) {
    const roll = rng.next();
    const label = `seed ${seed} step ${step}`;
    if (roll < 0.3) {
      const color = rng.pick(COLORS);
      void harness.capability.selection.update({ color });
      // The colour it already shows: no change, and nothing sent.
      if (color !== expected('color')) {
        // A restyle draws live: this session owns the appearance now.
        preferVector = true;
        unanswered.push({ field: 'color', value: color });
      }
    } else if (roll < 0.5) {
      const print = !harness.capability.get(REF)!.print;
      // Flags leave the appearance alone: the record draws as it did, and keeps drawing so.
      if (expectedSource() === 'vector') preferVector = true;
      void harness.capability.selection.update({ print });
      unanswered.push({ field: 'print', value: print });
    } else if (roll < 0.85 && unanswered.length) {
      await answerOldest(rng.next() < 0.75);
    } else {
      // Another session changes the record: its raster is the truth again.
      if (rng.next() < 0.5) engine.color = rng.pick(COLORS);
      else engine.print = !engine.print;
      preferVector = false;
      harness.emit({
        type: 'annotations.updated',
        page: PAGE,
        origin: { kind: 'remote', sessionId: 'cloud:bob', sub: 'bob', ts: 0, serverId: step + 100 },
        annotation: squareOf(engine),
        appearance: { changed: false },
        meta: { affectedPages: [], cacheDelta: null, changed: [] },
      } as unknown as DocumentEvent);
    }
    check(label);
  }

  // Answer everything still on its way, in order.
  while (unanswered.length) {
    await answerOldest(true);
    check(`seed ${seed} drain`);
  }
  expect(harness.pending()).toEqual([]);
  expect(dataOf(harness.capability.get(REF)).color).toBe(engine.color);
  expect(harness.capability.get(REF)!.print).toBe(engine.print);
}

describe('randomized interleavings of changes to one record', () => {
  for (const seed of Array.from({ length: 40 }, (_, index) => index + 1)) {
    it(`seed ${seed}`, async () => {
      await play(seed, 40);
    });
  }
});
