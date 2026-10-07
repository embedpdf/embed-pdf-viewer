import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  opIdOf,
  wirePack,
  type CustomMetadata,
  type CustomMetadataPatch,
  type CustomMetadataService,
  type CustomMetadataUpdateResult,
  type DocCapability,
  type DocumentMetadata,
  type MetadataPatch,
  type MetadataService,
  type MetadataUpdateResult,
  type WriteOptions,
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ScopeGuard } from '../scope';
import type { WorkerResultPayload } from '../worker/protocol';
import type { JobId } from '../worker/protocol';
import type { JobQueue, JobSpec } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

interface MetadataDeps {
  docId: string;
  queue: JobQueue;
  view: DocClosedView;
  guard: ScopeGuard;
}

/**
 * One metadata job: refused on a closed document, a missing capability or an
 * invalid `opId`, otherwise the worker round trip, with the payload's tag
 * checked. `buildPack` and `pick` get the job's `opId` (the caller's, else a
 * fresh one).
 */
function runMetadataJob<Tag extends WorkerResultPayload['tag'], T>(
  deps: MetadataDeps,
  capability: DocCapability,
  job: { tag: Tag; buildPack: (jobId: JobId, opId: string) => ReturnType<JobSpec['buildPack']> },
  pick: (payload: Extract<WorkerResultPayload, { tag: Tag }>, opId: string) => T,
  options?: WriteOptions,
): AbortablePromise<T> {
  if (deps.view.isClosed()) {
    return AbortablePromise.rejectReason(
      new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${deps.docId}`),
    );
  }
  let opId: string;
  try {
    opId = opIdOf(options);
    deps.guard.assertCapability(capability);
  } catch (err) {
    return AbortablePromise.rejectReason(err);
  }
  const submission = deps.queue.enqueue<WorkerResultPayload>({
    buildPack: (jobId) => job.buildPack(jobId, opId),
  });
  return AbortablePromise.run<T>(async (signal) => {
    const onAbort = () => submission.abort(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    const payload = await submission;
    if (payload.tag !== job.tag) {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
    }
    return pick(payload as Extract<WorkerResultPayload, { tag: Tag }>, opId);
  });
}

// Reads are session-level, the same gate as /head and /manifest on the cloud
// (`doc.open`); writes map to the cloud's POST routes, gated by
// `doc.metadata.modify` (PDF bit 4).

class LocalCustomMetadataService implements CustomMetadataService {
  constructor(
    private readonly deps: MetadataDeps,
    private readonly publisher: SessionEventPublisher,
  ) {}

  get(): AbortablePromise<CustomMetadata> {
    const { docId } = this.deps;
    return runMetadataJob(
      this.deps,
      'doc.open',
      {
        tag: 'metadata.readCustom',
        buildPack: (jobId) =>
          wirePack({ kind: 'metadata.readCustom', effect: 'read', jobId, docId }),
      },
      (payload) => payload.custom,
    );
  }

  update(
    patch: CustomMetadataPatch,
    options?: WriteOptions,
  ): AbortablePromise<CustomMetadataUpdateResult> {
    const { docId } = this.deps;
    return runMetadataJob(
      this.deps,
      'doc.metadata.modify',
      {
        tag: 'metadata.updateCustom',
        buildPack: (jobId, opId) =>
          wirePack({ kind: 'metadata.updateCustom', effect: 'write', jobId, opId, docId, patch }),
      },
      (payload, opId) => {
        this.publisher.publishWrite(opId, { type: 'metadata.customUpdated', ...payload.result });
        return payload.result;
      },
      options,
    );
  }
}

export class LocalMetadataService implements MetadataService {
  readonly custom: CustomMetadataService;
  private readonly deps: MetadataDeps;

  constructor(
    docId: string,
    queue: JobQueue,
    view: DocClosedView,
    guard: ScopeGuard,
    private readonly publisher: SessionEventPublisher,
  ) {
    this.deps = { docId, queue, view, guard };
    this.custom = new LocalCustomMetadataService(this.deps, publisher);
  }

  get(): AbortablePromise<DocumentMetadata> {
    const { docId } = this.deps;
    return runMetadataJob(
      this.deps,
      'doc.open',
      {
        tag: 'metadata.read',
        buildPack: (jobId) => wirePack({ kind: 'metadata.read', effect: 'read', jobId, docId }),
      },
      (payload) => payload.metadata,
    );
  }

  update(patch: MetadataPatch, options?: WriteOptions): AbortablePromise<MetadataUpdateResult> {
    const { docId } = this.deps;
    return runMetadataJob(
      this.deps,
      'doc.metadata.modify',
      {
        tag: 'metadata.update',
        buildPack: (jobId, opId) =>
          wirePack({ kind: 'metadata.update', effect: 'write', jobId, opId, docId, patch }),
      },
      (payload, opId) => {
        this.publisher.publishWrite(opId, { type: 'metadata.updated', ...payload.result });
        return payload.result;
      },
      options,
    );
  }
}
