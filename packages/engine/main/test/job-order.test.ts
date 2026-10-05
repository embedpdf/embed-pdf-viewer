/**
 * Which job goes next (`jobOrder.ts`): each document keeps the order its jobs'
 * effects ask for, a runtime write keeps every job's, and among the jobs that
 * may run the highest rank goes first, a job lending its rank to whatever holds
 * it back.
 */
import { describe, expect, test } from 'vitest';
import type { RequestEffect } from '@embedpdf/engine-core/runtime';

import { nextJob, type JobInLine } from '../src/worker/jobOrder';

interface Named extends JobInLine {
  readonly name: string;
  sent: boolean;
}

const job = (
  name: string,
  effect: RequestEffect,
  { doc = 'a', rank = 0 }: { doc?: string | undefined; rank?: number } = {},
): Named => ({ name, effect, docId: doc, rank, sent: false });

/** Runs the jobs one at a time, as a queue of one slot does, and names them in the order they ran. */
function runOrder(jobs: Named[]): string[] {
  const left = [...jobs];
  const order: string[] = [];
  for (;;) {
    const next = nextJob(left);
    if (!next) break;
    order.push(next.name);
    left.splice(left.indexOf(next), 1);
  }
  expect(left).toEqual([]);
  return order;
}

describe('the job order', () => {
  test('read, then close: the close waits for the read, whatever their ranks', () => {
    const read = job('read', 'read');
    const close = job('close', 'close', { rank: 9 });
    expect(nextJob([read, close])).toBe(read);
    expect(runOrder([read, close])).toEqual(['read', 'close']);
  });

  test('edit, save, edit: the save sees the first edit and not the second', () => {
    const order = runOrder([
      job('edit 1', 'write'),
      job('save', 'snapshot'),
      job('edit 2', 'write', { rank: 9 }),
    ]);
    expect(order).toEqual(['edit 1', 'save', 'edit 2']);
  });

  test('a save holds back no read: a read asked after it may run first', () => {
    const order = runOrder([job('save', 'snapshot'), job('read', 'read', { rank: 9 })]);
    expect(order).toEqual(['read', 'save']);
  });

  test('a read waits for the writes asked before it, not for those asked after', () => {
    expect(nextJob([job('edit', 'write'), job('read', 'read', { rank: 9 })])?.name).toBe('edit');
    expect(nextJob([job('read', 'read'), job('edit', 'write', { rank: 9 })])?.name).toBe('edit');
  });

  test('an urgent read behind three edits pulls them forward, in their order', () => {
    const order = runOrder([
      job('other page', 'read', { rank: 5 }),
      job('edit 1', 'write', { rank: 1 }),
      job('edit 2', 'write', { rank: 1 }),
      job('edit 3', 'write', { rank: 1 }),
      job('urgent read', 'read', { rank: 9 }),
    ]);
    expect(order).toEqual(['edit 1', 'edit 2', 'edit 3', 'urgent read', 'other page']);
  });

  test('another document waits for nothing here: its read runs before this one’s background write', () => {
    const order = runOrder([
      job('write a', 'write', { doc: 'a', rank: 1 }),
      job('read b', 'read', { doc: 'b', rank: 5 }),
      job('read a', 'read', { doc: 'a', rank: 2 }),
    ]);
    // The read of `a` lends its rank to the write it waits for, still below b's read.
    expect(order).toEqual(['read b', 'write a', 'read a']);
  });

  test('a runtime write waits for every job before it, and every job after it waits for it', () => {
    const order = runOrder([
      job('read a', 'read', { doc: 'a', rank: 1 }),
      job('fonts', 'runtimeWrite', { doc: undefined }),
      job('read b', 'read', { doc: 'b', rank: 9 }),
      job('write a', 'write', { doc: 'a', rank: 9 }),
    ]);
    expect(order).toEqual(['read a', 'fonts', 'read b', 'write a']);
  });

  test('an open holds back everything after it; a session change only the writes', () => {
    expect(runOrder([job('open', 'open'), job('read', 'read', { rank: 9 })])).toEqual([
      'open',
      'read',
    ]);
    expect(
      runOrder([
        job('font settings', 'session'),
        job('read', 'read', { rank: 5 }),
        job('edit', 'write', { rank: 3 }),
      ]),
    ).toEqual(['read', 'font settings', 'edit']);
  });

  test('a sent job is not sent again, and holds back what waits for it until it is done', () => {
    const edit = { ...job('edit', 'write'), sent: true };
    const read = job('read', 'read', { rank: 9 });
    expect(nextJob([edit, read])).toBeUndefined();
    expect(nextJob([read])).toBe(read);
  });

  test('equal ranks run in the order they were asked', () => {
    expect(runOrder([job('base', 'read'), job('tile 1', 'read'), job('tile 2', 'read')])).toEqual([
      'base',
      'tile 1',
      'tile 2',
    ]);
  });
});
