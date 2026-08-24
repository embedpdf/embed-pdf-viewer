/**
 * In-process async import worker — the phase 3b claim loop. NOT a
 * separate deployment unit: it runs inside the server process like
 * the pending-sweeper, and multi-replica deployments are safe because
 * claims are atomic and every transition is FENCED by the claim's
 * lease token (a worker whose lease expired cannot overwrite its
 * replacement's work).
 *
 * The six 3b correctness properties, and where they live:
 *   1. fenced transitions        — lease_token in every job UPDATE (repo);
 *   2. reconcile-on-claim        — ready→succeed / failed→fail before any
 *                                  transfer, closing the crash window
 *                                  between document commit and job-succeed;
 *   3. exhausted retryables      — the WORKER fails the document and
 *                                  deletes any destination bytes a crashed
 *                                  attempt fully uploaded before commit;
 *   4. atomic doc+job creation   — lifecycle.createQueuedImport (trx);
 *   5. non-overlapping loops     — a fixed set of sequential while-loops,
 *                                  never interval-fired ticks;
 *   6. pinned retries            — requested revision, else the revision
 *                                  captured (fenced) on the first
 *                                  successful open, else expected.sha256.
 *
 * The lease is sized to the transfer timeout plus margin, so an
 * attempt can never outlive its lease — which is why a single lease
 * per attempt suffices and no heartbeat machinery exists.
 */
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';

import type { DocumentImportRow, DocumentImportsRepo } from '../db/repos/document_imports.repo';
import type { DocumentsRepo } from '../db/repos/documents.repo';
import {
  sanitizeImportDetail,
  type DocumentLifecycleService,
} from '../services/DocumentLifecycleService';
import { StorageKeys } from '../storage/keys';
import type { ObjectStore } from '../storage/ObjectStore';
import type { ImportPolicy } from './config/ImportPolicySchema';

export interface ImportWorkerOptions {
  jobs: DocumentImportsRepo;
  documents: DocumentsRepo;
  lifecycle: DocumentLifecycleService;
  storage: ObjectStore;
  policy: ImportPolicy;
  /** Idle delay between empty polls. Default 1s. */
  pollMs?: number;
  /** Number of sequential claim loops; defaults to policy.maxConcurrent. */
  loops?: number;
  onError?: (err: unknown, ctx: { jobId?: string; docId?: string }) => void;
}

const LEASE_MARGIN_MS = 60_000;

export class ImportWorker {
  private readonly owner = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  private running = false;
  private loopPromises: Promise<void>[] = [];
  private readonly wakeups = new Set<() => void>();

  constructor(private readonly opts: ImportWorkerOptions) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    const loops = Math.max(1, this.opts.loops ?? this.opts.policy.maxConcurrent);
    this.loopPromises = Array.from({ length: loops }, () => this.loop());
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const wake of [...this.wakeups]) wake();
    await Promise.all(this.loopPromises);
    this.loopPromises = [];
  }

  /** Claim and process at most one job. Exposed for deterministic tests. */
  async poll(): Promise<'idle' | 'processed'> {
    const leaseMs = this.opts.policy.timeoutMs + LEASE_MARGIN_MS;
    const job = await this.opts.jobs.claimNext(this.owner, leaseMs);
    if (!job) return 'idle';
    await this.process(job);
    return 'processed';
  }

  private async loop(): Promise<void> {
    while (this.running) {
      let outcome: 'idle' | 'processed' = 'idle';
      try {
        outcome = await this.poll();
      } catch (err) {
        this.opts.onError?.(err, {});
      }
      if (!this.running) return;
      if (outcome === 'idle') await this.sleep(this.opts.pollMs ?? 1000);
    }
  }

  /** Interruptible idle sleep — stop() wakes every sleeper immediately. */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const wake = (): void => {
        clearTimeout(timer);
        this.wakeups.delete(wake);
        resolve();
      };
      const timer = setTimeout(wake, ms);
      timer.unref?.();
      this.wakeups.add(wake);
    });
  }

  private async process(job: DocumentImportRow): Promise<void> {
    const token = job.leaseToken;
    if (!token) return; // claim always mints one; defensive
    const { jobs, documents, lifecycle } = this.opts;
    try {
      const doc = await documents.findById(job.docId);
      // Reconcile BEFORE transferring: a crash between document
      // commit and job-succeed must complete the bookkeeping, never
      // re-transfer against a ready document.
      if (!doc || doc.tenantId !== job.tenantId) {
        await jobs.failJob(job.id, token, 'document no longer exists');
        return;
      }
      if (doc.state === 'ready') {
        await jobs.succeed(job.id, token, { resolvedRevision: job.resolvedRevision });
        return;
      }
      if (doc.state === 'failed') {
        await jobs.failJob(job.id, token, doc.failureReason ?? 'document failed');
        return;
      }
      if (doc.state !== 'pending') {
        await jobs.failJob(job.id, token, `document is in state ${doc.state}`);
        return;
      }
      const outcome = await lifecycle.executeQueuedTransfer(doc, job, {
        onOpened: async (resolvedRevision) => {
          if (resolvedRevision && !job.requestedRevision && !job.resolvedRevision) {
            await jobs.recordResolvedRevision(job.id, token, resolvedRevision);
          }
        },
      });
      await jobs.succeed(job.id, token, {
        resolvedRevision: outcome.resolvedRevision,
        sourceKind: outcome.sourceKind,
        sourceLocation: outcome.sourceLocation,
      });
    } catch (err) {
      await this.recordFailure(job, token, err);
    }
  }

  private async recordFailure(job: DocumentImportRow, token: string, err: unknown): Promise<void> {
    const { jobs, documents, storage } = this.opts;
    const status = (err as { status?: number } | null)?.status;
    const detail = sanitizeImportDetail(err);
    try {
      if (status !== 502) {
        // Terminal: the transfer path already marked the DOCUMENT
        // failed for source/content errors; the job records the rest.
        await jobs.failJob(job.id, token, detail);
        return;
      }
      if (job.attempts >= job.maxAttempts) {
        // Exhausted retryables: the transfer path deliberately leaves
        // the document pending — the WORKER owns this terminal
        // transition, plus cleanup of bytes a crashed attempt may
        // have fully uploaded before commit.
        await documents.markFailed(
          job.docId,
          job.tenantId,
          `import_retries_exhausted: ${detail}`.slice(0, 500),
        );
        await storage.delete(StorageKeys.basePdf(job.tenantId, job.docId)).catch(() => undefined);
        await jobs.failJob(job.id, token, `retries exhausted: ${detail}`);
        return;
      }
      const backoff = Math.min(30_000 * 2 ** Math.max(0, job.attempts - 1), 15 * 60_000);
      await jobs.retryLater(job.id, token, detail, Date.now() + backoff);
    } catch (recordErr) {
      this.opts.onError?.(recordErr, { jobId: job.id, docId: job.docId });
    }
  }
}
