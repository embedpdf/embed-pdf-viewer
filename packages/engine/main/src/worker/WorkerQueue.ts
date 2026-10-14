import {
  AbortablePromise,
  AbortError,
  EngineError,
  EngineErrorCode,
  clearlyOutranks,
  deserializeError,
  placeFor,
  rank,
  wirePack,
  type CallFacts,
  type CallPriority,
  type JobTarget,
  type PageBox,
  type PageRef,
  type RequestEffect,
  type ViewSets,
  type WirePack,
  type WorkerJobRequest,
  type WorkingSetPage,
} from '@embedpdf/engine-core/runtime';

import { nextJobId } from './jobIds';
import { nextJob } from './jobOrder';
import type { JobId, WorkerRequest, WorkerResponse, WorkerResultPayload } from './protocol';
import type { Transport } from '../transport/Transport';

export interface JobSpec {
  /**
   * Producer-supplied factory: given a freshly allocated `jobId`, return
   * the typed request plus its transfer manifest. For non-binary kinds
   * use `wirePack(req)`; for kinds that move buffers use
   * `wirePack(req, [buffer])`. It runs when the job is queued: the request
   * states the job's effect and page, which decide when it runs.
   *
   * It may return a promise when the request needs bytes read first (a
   * Blob's). The job still takes its place in line when queued, as `line`
   * describes it, so every call made after it waits for it as for any other
   * job of its document; it is sent once its request is built.
   */
  buildPack: (jobId: JobId) => WirePack<WorkerJobRequest> | Promise<WirePack<WorkerJobRequest>>;
  /**
   * The job's place in line while its request is being built: required when
   * `buildPack` returns a promise, and must match the request it builds.
   */
  line?: JobLine;
  /** The part of the request's page the job is about (a tile), in page space. */
  region?: PageBox;
}

/** What decides a job's place in line: its effect, its document and its page. */
interface JobPlace {
  readonly effect: RequestEffect;
  readonly docId: string | undefined;
  readonly page?: PageRef;
}

/** A job's place in line before its request exists: always of a document. */
export interface JobLine extends JobPlace {
  readonly docId: string;
}

/** Where a document's calls queue: the worker queue, with the facts of the handle they're made through. */
export interface JobQueue {
  enqueue<R extends WorkerResultPayload>(spec: JobSpec): AbortablePromise<R>;
}

interface Job {
  readonly jobId: JobId;
  /** Null while an async `buildPack` builds it. */
  pack: WirePack<WorkerJobRequest> | null;
  built: boolean;
  readonly effect: RequestEffect;
  readonly docId: string | undefined;
  readonly target: JobTarget;
  readonly priority: CallPriority;
  /** Recomputed before each pick, from the document's working sets as they are then. */
  rank: number;
  sent: boolean;
  /**
   * Told to stop for a more urgent job (see {@link WorkerQueue.preemptFor}):
   * when the worker answers that it stopped, the job goes back in line.
   */
  preempted: boolean;
  resolve: (payload: WorkerResultPayload) => void;
  reject: (err: unknown) => void;
  /**
   * Once true, any subsequent response from the worker is ignored and the
   * caller sees AbortError instead. This makes the abort contract hold
   * even when the host completes the work faster than the abort message
   * can propagate.
   */
  aborted: boolean;
  abortReason: unknown;
}

/**
 * The line of jobs to the worker: every document's calls, sent one at a time
 * (or `concurrency` at a time) in the order {@link nextJob} picks.
 *
 * - A job's request states its effect, which keeps its document's order
 *   (`jobOrder.ts`); among the jobs that may run, the highest rank goes first.
 * - A job's rank is its call's priority, then its place: where its page is in
 *   the views' working sets ({@link setWorkingSet}), worked out again before
 *   every pick, so a job follows the camera with no caller involved.
 * - A running read gives way to a job that clearly outranks it (a higher
 *   priority, or a better place): the queue tells the worker to stop it, and
 *   puts it back in line where it was. Its caller never sees that. The worker
 *   stops a read at its next slice, and keeps the page it half loaded.
 * - `abort()` before the job is sent removes it: it never reaches the worker.
 *   After, it sends an AbortRequest; the worker rejects when it next checks
 *   its signal, and the caller sees an AbortError either way.
 */
export class WorkerQueue implements JobQueue {
  /** Every job not done yet, sent or not, in call order. */
  private readonly jobs: Job[] = [];
  private readonly byId = new Map<JobId, Job>();
  /** Per document, per view: what the view shows (see {@link setWorkingSet}). */
  private readonly workingSets = new Map<string, Map<string, Map<number, WorkingSetPage>>>();
  private readonly unsubscribe: () => void;
  private readonly maxConcurrency: number;
  private inFlight = 0;

  private destroyed = false;

  constructor(
    private readonly transport: Transport,
    opts: { concurrency?: number } = {},
  ) {
    this.maxConcurrency = Math.max(1, opts.concurrency ?? 1);
    this.unsubscribe = transport.onMessage((msg) => this.handleResponse(msg));
  }

  /** The same queue, every job queued through it carrying `facts` (see `DocumentHandle.with`). */
  withFacts(facts: CallFacts): JobQueue {
    return { enqueue: (spec) => this.enqueue(spec, facts) };
  }

  enqueue<R extends WorkerResultPayload>(
    spec: JobSpec,
    facts: CallFacts = {},
  ): AbortablePromise<R> {
    if (this.destroyed) {
      return AbortablePromise.rejectReason<R>(
        new EngineError(EngineErrorCode.RuntimeUnavailable, 'engine has been destroyed'),
      );
    }
    const jobId = nextJobId();
    let built: WirePack<WorkerJobRequest> | Promise<WirePack<WorkerJobRequest>>;
    try {
      built = spec.buildPack(jobId);
    } catch (err) {
      return AbortablePromise.rejectReason<R>(err);
    }
    const pack = built instanceof Promise ? null : built;
    const line: JobPlace | undefined = pack ? lineOf(pack.payload) : spec.line;
    if (!line) {
      return AbortablePromise.rejectReason<R>(
        new EngineError(EngineErrorCode.Unknown, 'a job built later must state its line'),
      );
    }

    return new AbortablePromise<R>((resolve, reject, _progress, signal) => {
      const job: Job = {
        jobId,
        pack,
        built: pack !== null,
        effect: line.effect,
        docId: line.docId,
        target: {
          ...(line.page ? { page: line.page } : {}),
          ...(spec.region ? { region: spec.region } : {}),
          ...(facts.view !== undefined ? { view: facts.view } : {}),
        },
        priority: facts.priority ?? 'auto',
        rank: 0,
        sent: false,
        preempted: false,
        resolve: (payload) => resolve(payload as R),
        reject,
        aborted: false,
        abortReason: undefined,
      };
      this.jobs.push(job);
      this.byId.set(jobId, job);

      const onAbort = () => {
        if (!this.byId.has(jobId)) return;
        if (!job.sent) {
          this.remove(job);
          job.reject(new AbortError(signal.reason));
          // A job it held back may run now.
          this.tick();
          return;
        }
        job.aborted = true;
        job.abortReason = signal.reason;
        // Abort messages never carry buffers — pack with EMPTY_TRANSFER.
        this.transport.send(wirePack({ kind: 'abort', jobId }));
      };

      if (signal.aborted) {
        onAbort();
      } else {
        signal.addEventListener('abort', onAbort, { once: true });
      }

      if (built instanceof Promise) {
        built.then(
          (later) => this.built(job, later, line),
          (err: unknown) => this.failedToBuild(job, err),
        );
      }
      this.tick();
    });
  }

  /** An async request is ready: the job may be sent when its turn comes. */
  private built(job: Job, pack: WirePack<WorkerJobRequest>, line: JobPlace): void {
    if (!this.byId.has(job.jobId)) return; // aborted, or the queue shut down
    const actual = lineOf(pack.payload);
    if (
      actual.effect !== line.effect ||
      actual.docId !== line.docId ||
      actual.page?.objectNumber !== line.page?.objectNumber
    ) {
      this.failedToBuild(
        job,
        new EngineError(EngineErrorCode.Unknown, `job ${job.jobId} left the line it took`),
      );
      return;
    }
    job.pack = pack;
    job.built = true;
    this.tick();
  }

  /** Building the request failed: the job leaves the line and its caller sees why. */
  private failedToBuild(job: Job, err: unknown): void {
    if (!this.byId.has(job.jobId)) return;
    this.remove(job);
    job.reject(err);
    this.tick();
  }

  /**
   * What `view` shows of a document, replacing its last set; an empty set
   * withdraws it. The jobs waiting for the document take their new places at
   * the next pick, and the worker hears it at once, for the order its parsed
   * pages close in.
   */
  setWorkingSet(docId: string, view: string, pages: readonly WorkingSetPage[]): void {
    if (this.destroyed) return;
    let views = this.workingSets.get(docId);
    if (pages.length > 0) {
      if (!views) {
        views = new Map();
        this.workingSets.set(docId, views);
      }
      views.set(view, new Map(pages.map((entry) => [entry.page.objectNumber, entry])));
    } else {
      views?.delete(view);
      if (views?.size === 0) this.workingSets.delete(docId);
    }
    this.tell((jobId) =>
      wirePack({ kind: 'pages.workingSet', jobId, docId, view, pages: [...pages] }),
    );
    // A running read may now give way to work that moved on screen.
    this.tick();
  }

  /** A document closed: its views say nothing any more. */
  forgetWorkingSets(docId: string): void {
    this.workingSets.delete(docId);
  }

  /**
   * Sends a message the worker takes on arrival and never answers (a working
   * set): past every job waiting here, with no slot and no reply.
   */
  tell(buildPack: (jobId: JobId) => WirePack<WorkerRequest>): void {
    if (this.destroyed) return;
    this.transport.send(buildPack(nextJobId()));
  }

  private tick(): void {
    if (this.destroyed) return;
    for (;;) {
      const job = this.pick();
      if (!job) return;
      if (this.inFlight >= this.maxConcurrency) {
        this.preemptFor(job);
        return;
      }
      job.sent = true;
      this.inFlight += 1;
      this.transport.send(job.pack!);
    }
  }

  /**
   * Tells the worker to stop the running read `next` clearly outranks, the
   * least urgent one if several run. Only reads give way: a read must never
   * see half a write, and saves and opens can't stop part way. A read with
   * buffers to move can't be sent twice, so it runs on.
   */
  private preemptFor(next: Job): void {
    let victim: Job | undefined;
    let victimRank = 0;
    for (const running of this.jobs) {
      if (!running.sent || running.preempted || running.aborted) continue;
      if (running.effect !== 'read' || running.pack!.transfer.length > 0) continue;
      const now = this.rankNow(running);
      if (!clearlyOutranks(next.rank, now)) continue;
      if (!victim || now < victimRank) {
        victim = running;
        victimRank = now;
      }
    }
    if (!victim) return;
    victim.preempted = true;
    this.transport.send(wirePack({ kind: 'abort', jobId: victim.jobId }));
  }

  /** The job to send next, every waiting job ranked by where it is now. */
  private pick(): Job | undefined {
    for (const job of this.jobs) {
      if (!job.sent) job.rank = this.rankNow(job);
    }
    return nextJob(this.jobs);
  }

  /** The job's rank with the working sets as they are now. */
  private rankNow(job: Job): number {
    return rank(
      { priority: job.priority, ...(job.target.region ? { region: job.target.region } : {}) },
      placeFor(job.target, this.viewsOf(job.docId)),
    );
  }

  private viewsOf(docId: string | undefined): ViewSets {
    return (docId === undefined ? undefined : this.workingSets.get(docId)) ?? NO_VIEWS;
  }

  private remove(job: Job): void {
    this.byId.delete(job.jobId);
    const index = this.jobs.indexOf(job);
    if (index >= 0) this.jobs.splice(index, 1);
  }

  private handleResponse(msg: WorkerResponse): void {
    const job = this.byId.get(msg.jobId);
    if (!job?.sent) return; // stale, or not one of ours
    this.inFlight -= 1;
    if (job.preempted && !job.aborted && stoppedBy(msg)) {
      // Stopped for a more urgent job, not by its caller: back in line where it
      // was in call order, under the same id, to be sent again when its turn
      // comes. Nothing else is in flight for that id.
      job.sent = false;
      job.preempted = false;
      this.tick();
      return;
    }
    this.remove(job);

    if (job.aborted) {
      job.reject(new AbortError(job.abortReason));
    } else if (msg.kind === 'resolve') {
      job.resolve(msg.result);
    } else {
      const err = deserializeError(msg.error);
      if (err.code === EngineErrorCode.Aborted) {
        job.reject(new AbortError(err.message));
      } else {
        job.reject(err);
      }
    }

    this.tick();
  }

  async shutdown(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    // Reject anything not sent yet.
    for (const job of [...this.jobs]) {
      if (job.sent) continue;
      this.remove(job);
      job.reject(new EngineError(EngineErrorCode.RuntimeUnavailable, 'engine destroyed'));
    }

    // In-flight: best-effort send shutdown then settle.
    try {
      const id = nextJobId();
      const settle = new Promise<void>((resolveSettle) => {
        const off = this.transport.onMessage((m) => {
          if (m.jobId === id) {
            off();
            resolveSettle();
          }
        });
        // Shutdown carries no buffers.
        this.transport.send(wirePack({ kind: 'shutdown', jobId: id }));
      });
      await Promise.race([settle, new Promise<void>((r) => setTimeout(r, 50))]);
    } catch {
      // ignore
    }

    for (const job of [...this.jobs]) {
      this.remove(job);
      job.reject(new EngineError(EngineErrorCode.RuntimeUnavailable, 'engine destroyed'));
    }
    this.inFlight = 0;

    this.unsubscribe();
    await this.transport.terminate();
  }
}

const NO_VIEWS: ViewSets = new Map();

/** The place a built request states. */
function lineOf(request: WorkerJobRequest): JobPlace {
  return {
    effect: request.effect,
    docId: 'docId' in request ? request.docId : undefined,
    ...('page' in request && request.page ? { page: request.page } : {}),
  };
}

/** Whether the worker answered that the job stopped on an abort. */
function stoppedBy(msg: WorkerResponse): boolean {
  return msg.kind === 'reject' && msg.error.code === EngineErrorCode.Aborted;
}
