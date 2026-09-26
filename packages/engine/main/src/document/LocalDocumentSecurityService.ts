import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  collabTargetOf,
  passwordPromptFromState,
  securityStateFromProbe,
  wirePack,
  type Identity,
  type DocumentSecurityService,
  type DocumentSecurityState,
  type DocumentSecurityProbeInfo,
  type DocumentUnlockInput,
  type DocumentUnlockResult,
  type PasswordPrompt,
  type AnnotationOwner,
  type DocCapability,
} from '@embedpdf/engine-core/runtime';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { JobId, WorkerResultPayload } from '../worker/protocol';
import type { WorkerQueue } from '../worker/WorkerQueue';

export class LocalDocumentSecurityService implements DocumentSecurityService {
  private securityState: DocumentSecurityState;

  constructor(
    initial: DocumentSecurityProbeInfo,
    private readonly docId: string,
    private readonly queue: WorkerQueue,
    private readonly view: { isClosed(): boolean },
    /**
     * Optional ScopeGuard so the service can expose the same
     * `scope` / `identity` shape the cloud SDK does. Without
     * it (legacy LocalEngine callers), `scope` is empty
     * and `identity` is null — the security state itself still
     * works.
     */
    private readonly guard: ScopeGuard | null = null,
  ) {
    this.securityState = securityStateFromProbe(initial);
  }

  get state(): DocumentSecurityState {
    return this.securityState;
  }

  /**
   * Expanded capability set from the scope + pdf bits supplied at
   * `engine.open()`. Identical algorithm to the cloud SDK's local-
   * fallback path — both call `expandRawScope` from engine-core.
   * Returns an empty array when no ScopeGuard was wired (legacy
   * open path with no scope).
   */
  get scope(): ReadonlyArray<string> {
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

  /**
   * Per-record annotation authorization mirrors — delegate to the same
   * ScopeGuard predicates the annotation service enforces with
   * (`assertCollab`/`assertSetGroup`), so a control gated on these can
   * never disagree with the engine's own deny. False on the legacy
   * no-scope open path, same rule as `allows`.
   */
  allowsAnnotation(action: 'create'): boolean;
  allowsAnnotation(action: 'update' | 'delete', annotation: AnnotationOwner): boolean;
  allowsAnnotation(action: 'set-group', target: { groupId: string }): boolean;
  allowsAnnotation(
    action: 'create' | 'update' | 'delete' | 'set-group',
    target?: AnnotationOwner | { groupId: string },
  ): boolean {
    const guard = this.guard;
    if (!guard) return false;
    switch (action) {
      case 'create':
        return guard.canCollab('create', guard.targetForSelfCreate());
      case 'set-group':
        return guard.canSetGroup((target as { groupId: string }).groupId);
      default:
        return guard.canCollab(action, collabTargetOf((target ?? {}) as AnnotationOwner));
    }
  }

  /** Identity claims supplied at `engine.open()`, or null when none. */
  get identity(): Identity | null {
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
    return passwordPromptFromState(this.state, this.passwordRejected);
  }

  /** Whether the last password tried was wrong (the prompt's `incorrect`). */
  private passwordRejected = false;

  /** A locked open whose password was given and wrong: the prompt says so. */
  markPasswordRejected(): void {
    this.passwordRejected = true;
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

      let payload: WorkerResultPayload;
      try {
        payload = await submission;
      } catch (error) {
        if (EngineError.is(error, EngineErrorCode.DocPasswordIncorrect)) {
          this.passwordRejected = true;
        }
        throw error;
      }
      this.passwordRejected = false;
      if (payload.tag !== 'document.checkPasswordPermissions') {
        throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
      }
      this.securityState = securityStateFromProbe(payload.security);
      // The unlock loaded the document for real: the file's permission bits
      // are the ones this password opens it with (all of them for the owner
      // password), its signatures are known, and both apply from the next
      // call on.
      this.guard?.setPdfPermissions(payload.security.pdfPermissionsBits);
      this.guard?.setProtection(payload.protection ?? null);
      return { security: this.state };
    });
  }
}
