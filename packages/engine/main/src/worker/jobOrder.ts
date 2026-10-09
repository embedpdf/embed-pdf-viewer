/**
 * Which job the queue sends next (the page residency plan, §10.5).
 *
 * Correctness first: each document keeps the order its jobs' effects ask for,
 * and a runtime write keeps the order of every job. A job may run once nothing
 * asked before it holds it back:
 *
 *   | Job (`effect`)                         | Waits for, asked before it and not done        |
 *   | :------------------------------------- | :--------------------------------------------- |
 *   | `read`                                 | a write, content write or open of its document |
 *   | `snapshot`, `session`, `write`,        | any job of its document but a read             |
 *   | `contentWrite`, `open`                 |                                                |
 *   | `close`                                | any job of its document                        |
 *   | `runtimeWrite`                         | any job                                        |
 *   | any job                                | a runtime write                                |
 *
 * A job whose request is still being built (its bytes are being read) holds
 * its place like any other, and runs once it is built.
 *
 * Then urgency: of the jobs that may run, the one with the highest rank goes
 * first, the earliest asked among equals. A job that holds others back lends
 * them its place in line: it runs at the highest rank of anything it holds
 * back, however indirectly, so an urgent read behind three edits pulls the
 * first edit forward, then the second, then the third. Across documents
 * nothing waits for anything, so a background write of one document delays no
 * read of another.
 */
import type { RequestEffect } from '@embedpdf/engine-core/runtime';

/** A job not done yet, as the order sees it. */
export interface JobInLine {
  readonly effect: RequestEffect;
  /** Its document; absent for a job of no document (fonts, a file probe). */
  readonly docId: string | undefined;
  /** Sent to the worker: it can't be sent again, but it holds back until it's done. */
  readonly sent: boolean;
  /** Its request is built. One that isn't yet holds back what it would, but can't be sent. */
  readonly built: boolean;
  /** How soon it should run (see `rank`): higher first. */
  readonly rank: number;
}

/** The effects a document's other ordered jobs keep their call order with. */
const ORDERED: ReadonlySet<RequestEffect> = new Set<RequestEffect>([
  'snapshot',
  'session',
  'write',
  'contentWrite',
  'open',
  'close',
]);

/** The effects a read waits for: what changes what it reads. */
const READ_WAITS_FOR: ReadonlySet<RequestEffect> = new Set<RequestEffect>([
  'write',
  'contentWrite',
  'open',
]);

/**
 * The job to send next, or undefined when every job waits for another (or
 * none is left). `jobs` is every job not done yet, sent or not, in call order.
 */
export function nextJob<J extends JobInLine>(jobs: readonly J[]): J | undefined {
  const blockers = blockersOf(jobs);

  // A job that holds others back runs at the highest rank among them. Blockers
  // are always asked earlier, so one pass from the last job back carries every
  // rank down its whole chain.
  const lent = jobs.map((job) => job.rank);
  for (let index = jobs.length - 1; index >= 0; index--) {
    for (const blocker of blockers[index]!) {
      lent[blocker] = Math.max(lent[blocker]!, lent[index]!);
    }
  }

  let next = -1;
  for (let index = 0; index < jobs.length; index++) {
    const job = jobs[index]!;
    if (job.sent || !job.built || blockers[index]!.length > 0) continue;
    if (next < 0 || lent[index]! > lent[next]!) next = index;
  }
  return next < 0 ? undefined : jobs[next];
}

/** Per job, the jobs asked before it that hold it back directly (see the table). */
function blockersOf(jobs: readonly JobInLine[]): number[][] {
  const lines = new Map<string, DocumentLine>();
  let lastRuntimeWrite = -1;
  return jobs.map((job, index) => {
    const blockers: number[] = [];
    if (lastRuntimeWrite >= 0) blockers.push(lastRuntimeWrite);
    if (job.effect === 'runtimeWrite') {
      for (let earlier = 0; earlier < index; earlier++) blockers.push(earlier);
      lastRuntimeWrite = index;
      return blockers;
    }
    if (job.docId === undefined) return blockers;

    let line = lines.get(job.docId);
    if (!line) {
      line = { jobs: [], lastOrdered: -1, lastChange: -1 };
      lines.set(job.docId, line);
    }
    if (job.effect === 'close') blockers.push(...line.jobs);
    else if (job.effect === 'read') pushIfAny(blockers, line.lastChange);
    else pushIfAny(blockers, line.lastOrdered);

    line.jobs.push(index);
    if (ORDERED.has(job.effect)) line.lastOrdered = index;
    if (READ_WAITS_FOR.has(job.effect)) line.lastChange = index;
    return blockers;
  });
}

/** One document's jobs not done yet, as `blockersOf` walks them. */
interface DocumentLine {
  readonly jobs: number[];
  /** The latest ordered job (see {@link ORDERED}), or -1. */
  lastOrdered: number;
  /** The latest job a read waits for (see {@link READ_WAITS_FOR}), or -1. */
  lastChange: number;
}

function pushIfAny(blockers: number[], index: number): void {
  if (index >= 0) blockers.push(index);
}
