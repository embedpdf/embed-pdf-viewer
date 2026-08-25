import type { WorkerResultPayload } from '@embedpdf/engine-core/runtime';

import type { BuildPack, EnginePool } from './EnginePool';
import type { CrashJournal } from '../services/CrashJournal';

/**
 * Quarantine enforcement as a decorator over ANY EnginePool: one choke
 * point gating every sha-attributable entry point — `runOpen` and
 * `runAdHoc` (which covers thumbnail warms and the ingestion security
 * probe), AND `run(docId)` via a residency mirror, because a document
 * opened on this replica BEFORE another replica quarantined its sha
 * must stop being served here on the next call, not at the next
 * open/evict (review round 2). Mirror lifecycle: set on a successful
 * sha-carrying runOpen, dropped on close; an entry surviving a pool
 * eviction is harmless (the very next call fails DocNotOpen and the
 * reopen is gated). In observe-only mode the journal's assert is a
 * no-op, so wrapping is always safe and costs nothing.
 */
export class QuarantiningEnginePool implements EnginePool {
  private readonly residency = new Map<string, string>();

  constructor(
    private readonly inner: EnginePool,
    private readonly journal: CrashJournal,
    /** The running binary's identity — narrows enforcement to it. */
    private readonly activeBuild: () => string | null,
  ) {}

  async runOpen(
    docId: string,
    baseShaOrBuild: string | BuildPack,
    buildOrSignal?: BuildPack | AbortSignal,
    maybeSignal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    if (typeof baseShaOrBuild === 'string') {
      await this.journal.assertNotQuarantined(baseShaOrBuild, this.activeBuild());
      const result = await this.inner.runOpen(
        docId,
        baseShaOrBuild,
        buildOrSignal as BuildPack,
        maybeSignal,
      );
      this.residency.set(docId, baseShaOrBuild);
      return result;
    }
    return this.inner.runOpen(docId, baseShaOrBuild, buildOrSignal as AbortSignal | undefined);
  }

  async runAdHoc(
    baseSha: string | undefined,
    build: BuildPack,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    if (baseSha !== undefined) {
      await this.journal.assertNotQuarantined(baseSha, this.activeBuild());
    }
    return this.inner.runAdHoc(baseSha, build, signal);
  }

  async run(docId: string, build: BuildPack, signal?: AbortSignal): Promise<WorkerResultPayload> {
    const sha = this.residency.get(docId);
    if (sha !== undefined) {
      await this.journal.assertNotQuarantined(sha, this.activeBuild());
    }
    return this.inner.run(docId, build, signal);
  }

  close(docId: string, signal?: AbortSignal): Promise<WorkerResultPayload | null> {
    this.residency.delete(docId);
    return this.inner.close(docId, signal);
  }

  destroy(): Promise<void> {
    return this.inner.destroy();
  }

  inspect(): Array<{ slot: number; docIds: string[]; baseShas: string[] }> {
    return this.inner.inspect();
  }

  stats(): { slots: number; docs: number; inFlight: number } {
    return this.inner.stats();
  }

  generation(): number {
    return this.inner.generation();
  }

  health(): { state: 'ready' | 'starting' | 'backoff'; downSinceMs: number | null } {
    return this.inner.health();
  }
}
