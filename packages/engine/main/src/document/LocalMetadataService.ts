import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
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
} from '@embedpdf/engine-core/runtime';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import type { ScopeGuard } from '../scope';
import { Priority } from '../worker/Priority';
import type { WorkerResultPayload } from '../worker/protocol';
import type { JobSpec, WorkerQueue } from '../worker/WorkerQueue';

interface DocClosedView {
  isClosed(): boolean;
}

interface MetadataDeps {
  docId: string;
  queue: WorkerQueue;
  view: DocClosedView;
  guard: ScopeGuard;
}

/**
 * One metadata job: refused on a closed document or a missing capability,
 * otherwise the worker round trip, with the payload's tag checked.
 */
function runMetadataJob<Tag extends WorkerResultPayload['tag'], T>(
  deps: MetadataDeps,
  capability: DocCapability,
  job: { tag: Tag; priority: Priority; buildPack: JobSpec['buildPack'] },
  pick: (payload: Extract<WorkerResultPayload, { tag: Tag }>) => T,
): AbortablePromise<T> {
  if (deps.view.isClosed()) {
    return AbortablePromise.rejectReason(
      new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${deps.docId}`),
    );
  }
  try {
    deps.guard.assertCapability(capability);
  } catch (err) {
    return AbortablePromise.rejectReason(err);
  }
  const submission = deps.queue.enqueue<WorkerResultPayload>(
    { buildPack: job.buildPack },
    { priority: job.priority },
  );
  return AbortablePromise.run<T>(async (signal) => {
    const onAbort = () => submission.abort(signal.reason);
    if (signal.aborted) onAbort();
    else signal.addEventListener('abort', onAbort, { once: true });
    const payload = await submission;
    if (payload.tag !== job.tag) {
      throw new EngineError(EngineErrorCode.WireFormat, `unexpected payload tag: ${payload.tag}`);
    }
    return pick(payload as Extract<WorkerResultPayload, { tag: Tag }>);
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
        priority: Priority.MEDIUM,
        buildPack: (jobId) => wirePack({ kind: 'metadata.readCustom', jobId, docId }),
      },
      (payload) => payload.custom,
    );
  }

  update(patch: CustomMetadataPatch): AbortablePromise<CustomMetadataUpdateResult> {
    const { docId } = this.deps;
    return runMetadataJob(
      this.deps,
      'doc.metadata.modify',
      {
        tag: 'metadata.updateCustom',
        priority: Priority.HIGH,
        buildPack: (jobId) => wirePack({ kind: 'metadata.updateCustom', jobId, docId, patch }),
      },
      (payload) => {
        this.publisher.publishLocal({ type: 'metadata.customUpdated', ...payload.result });
        return payload.result;
      },
    );
  }
}

export class LocalMetadataService implements MetadataService {
  readonly custom: CustomMetadataService;
  private readonly deps: MetadataDeps;

  constructor(
    docId: string,
    queue: WorkerQueue,
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
        priority: Priority.MEDIUM,
        buildPack: (jobId) => wirePack({ kind: 'metadata.read', jobId, docId }),
      },
      (payload) => payload.metadata,
    );
  }

  update(patch: MetadataPatch): AbortablePromise<MetadataUpdateResult> {
    const { docId } = this.deps;
    return runMetadataJob(
      this.deps,
      'doc.metadata.modify',
      {
        tag: 'metadata.update',
        priority: Priority.HIGH,
        buildPack: (jobId) => wirePack({ kind: 'metadata.update', jobId, docId, patch }),
      },
      (payload) => {
        this.publisher.publishLocal({ type: 'metadata.updated', ...payload.result });
        return payload.result;
      },
    );
  }
}
