import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  passwordPromptFromState,
  securityStateFromProbe,
  wirePack,
  type DocumentIdentity,
  type DocumentSecurityService,
  type DocumentSecurityState,
  type DocumentSecurityProbeInfo,
  type DocumentUnlockInput,
  type DocumentUnlockResult,
  type PasswordPrompt,
  type DocCapability,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

export class LocalDocumentSecurityService implements DocumentSecurityService {
  private state: DocumentSecurityState;

  constructor(
    initial: DocumentSecurityProbeInfo,
    private readonly docId: string,
    private readonly queue: WorkerQueue,
    private readonly view: { isClosed(): boolean },
    /**
     * Optional ScopeGuard so the service can expose the same
     * `effectiveScope` / `identity` shape the cloud SDK does. Without
     * it (legacy LocalEngine callers), `effectiveScope` is empty
     * and `identity` is null — the security state itself still
     * works.
     */
    private readonly guard: ScopeGuard | null = null,
  ) {
    this.state = securityStateFromProbe(initial);
  }

  get current(): DocumentSecurityState {
    return this.state;
  }

  /**
   * Expanded capability set from the scope + pdf bits supplied at
   * `engine.open()`. Identical algorithm to the cloud SDK's local-
   * fallback path — both call `expandRawScope` from engine-core.
   * Returns an empty array when no ScopeGuard was wired (legacy
   * open path with no scope).
   */
  get effectiveScope(): ReadonlyArray<string> {
    return this.guard ? this.guard.effectiveScope() : [];
  }

  /**
   * Wildcard-aware authorization check — the same predicate the page/
   * annotation services enforce with (`ScopeGuard.can`/`assertCapability`).
   * Returns `false` on the legacy no-ScopeGuard open path (no scope was
   * supplied, so we can't affirm a grant — UI should hide edit affordances).
   */
  allows(cap: DocCapability): boolean {
    return this.guard ? this.guard.can(cap) : false;
  }

  /** Identity claims supplied at `engine.open()`, or null when none. */
  get identity(): DocumentIdentity | null {
    if (!this.guard) return null;
    const id = this.guard.identity();
    return id && Object.keys(id).length > 0 ? id : null;
  }

  /**
   * "Should I prompt for a password?" — single source of truth,
   * computed via the same `passwordPromptFromState` helper the cloud
   * SDK calls. Identical contract across engines.
   */
  get passwordPrompt(): PasswordPrompt {
    return passwordPromptFromState(this.state);
  }

  unlock(input: DocumentUnlockInput): AbortablePromise<DocumentUnlockResult> {
    if (this.view.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${this.docId}`),
      );
    }
    const submission = this.queue.enqueue<WorkerResultPayload>(
      {
        buildPack: (jobId: JobId) =>
          wirePack({
            kind: 'document.checkPasswordPermissions',
            jobId,
            docId: this.docId,
            password: input.password,
            mode: input.mode ?? 'any',
          }),
      },
      { priority: Priority.HIGH },
    );
    return AbortablePromise.run<DocumentUnlockResult>(async (signal) => {
      const onAbort = () => submission.abort(signal.reason);
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });

      const payload = await submission;
      if (payload.tag !== 'document.checkPasswordPermissions') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.state = securityStateFromProbe(payload.security);
      return { security: this.state };
    });
  }
}
