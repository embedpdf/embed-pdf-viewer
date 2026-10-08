import {
  AbortablePromise,
  EngineError,
  EngineErrorCode,
  changeEvents,
  deserializeError,
  isSkippedItem,
  isUndoChange,
  objectNumbersNamedBy,
  opIdOf,
  resolveChangeResources,
  type Change,
  type ChangeAnswer,
  type ChangeOp,
  type ChangeResult,
  type PageCoordinates,
  type WireAnnotationResources,
  type WireResourceMap,
  type WriteOptions,
} from '@embedpdf/engine-core/runtime';
import {
  CHANGE_REQUEST_LIMITS,
  ChangeRequestSchema,
  ChangeResponseSchema,
  wirePaths,
  type LayerScopePlane,
} from '@embedpdf/engine-core/wire';
import type { SessionEventPublisher } from '@embedpdf/engine-services';

import { buildMutationForm } from './buildMutationForm';
import type { ManifestAccessor } from './CloudDocumentHandle';
import type { ChangeSender, CloudWrites, SentChange } from './CloudWrites';
import type { HttpClient } from '../transport/HttpClient';

/** How many `opId`s a handle remembers having published: far more than any retry spans. */
const PUBLISHED_MEMORY = 4096;

/**
 * `doc.apply` on the cloud: each change takes its place in the document's
 * line of writes, and goes out with the changes called right after it, as
 * one `POST …/changes` (see {@link CloudWrites.change}). The server checks
 * every op against the caller inside the write, so nothing about the ops is
 * checked here beyond what the request must hold.
 *
 * A change's events are published once its answer arrives, all sharing its
 * `opId`. A change asked again gets the first answer and publishes nothing:
 * this handle remembers the `opId`s it published.
 */
export class CloudDocumentChanges {
  /** The `opId`s this handle published events for, oldest first. */
  private readonly published = new Set<string>();

  constructor(
    private readonly isClosed: () => boolean,
    private readonly manifest: ManifestAccessor,
    private readonly publisher: SessionEventPublisher,
    private readonly writes: CloudWrites,
  ) {}

  apply(change: Change, options?: WriteOptions): AbortablePromise<ChangeResult> {
    if (this.isClosed()) {
      return AbortablePromise.rejectReason(
        new EngineError(EngineErrorCode.DocNotOpen, 'document is closed'),
      );
    }
    let opId: string;
    try {
      opId = opIdOf(options);
    } catch (err) {
      return AbortablePromise.rejectReason(err);
    }
    // An empty change writes nothing, so nothing goes to the server.
    if (!isUndoChange(change) && change.ops.length === 0) {
      return AbortablePromise.resolveValue<ChangeResult>({
        items: [],
        meta: { affectedPages: [], cacheDelta: null, opId, undoable: false },
      });
    }
    return AbortablePromise.run<ChangeResult>(async (signal) => {
      // In line now, so it keeps its place among this document's writes while
      // its bytes are read.
      const answer = await this.writes.change(signal, sentChangeOf(opId, change), {
        named: objectNumbersNamedBy(change),
        alone: carriesBytes(change),
      });
      if (answer.status === 'refused') throw deserializeError(answer.error);
      this.absorb(opId, change, answer.result);
      return answer.result;
    });
  }

  /**
   * Patch the cached manifest, then publish the change's events (in that
   * order: listeners reading the manifest see the change), unless this
   * handle published them already.
   */
  private absorb(opId: string, change: Change, result: ChangeResult): void {
    this.manifest.apply(result.meta, planesOf(result));
    if (this.published.has(opId)) return;
    this.published.add(opId);
    if (this.published.size > PUBLISHED_MEMORY) {
      this.published.delete(this.published.values().next().value!);
    }
    const undoOf = isUndoChange(change) ? change.undoOf : undefined;
    this.publisher.publishChange(opId, changeEvents(result), undoOf);
  }
}

/**
 * The sender of a document's requests of changes: JSON, or multipart when
 * any change carries bytes, each op naming its parts by key.
 */
export function changeSender(http: HttpClient, docId: string, layerName: string): ChangeSender {
  const path = wirePaths.layerChanges(docId, layerName);
  // The schema checks the answers' shape; their types are core's.
  const parse = (raw: unknown) =>
    ChangeResponseSchema.parse(raw).changes as unknown as readonly ChangeAnswer[];
  return (changes, options) => {
    const { body, parts } = changeRequestOf(changes);
    // No caller's abort stops a request several changes share: once it's out,
    // every change in it is answered.
    const signal = new AbortController().signal;
    return Object.keys(parts).length > 0
      ? http.postMultipartJson(path, buildMutationForm(body, parts), parse, signal, options)
      : http.postJson(path, body, parse, signal, options);
  };
}

/**
 * A change ready to send: its bytes read, and checked against what a request
 * may hold, so a malformed change is refused alone rather than refusing the
 * request it would share.
 */
async function sentChangeOf(opId: string, change: Change): Promise<SentChange> {
  if (!isUndoChange(change) && change.ops.length > CHANGE_REQUEST_LIMITS.ops) {
    throw new EngineError(
      EngineErrorCode.PayloadTooLarge,
      `a change holds at most ${CHANGE_REQUEST_LIMITS.ops} ops`,
      { details: { limit: 'ops', max: CHANGE_REQUEST_LIMITS.ops, value: change.ops.length } },
    );
  }
  const sent: SentChange = { opId, change: (await resolveChangeResources(change)).change };
  // Checked as the server reads it: the JSON, after serialization.
  const { body } = changeRequestOf([sent]);
  const checked = ChangeRequestSchema.safeParse(JSON.parse(JSON.stringify(body)));
  if (!checked.success) {
    throw new EngineError(EngineErrorCode.InvalidArg, `invalid change: ${checked.error.message}`, {
      details: { issues: checked.error.issues },
    });
  }
  return sent;
}

/** A request's JSON and its parts: each op's bytes become a part the op names by key. */
function changeRequestOf(changes: readonly SentChange[]): {
  body: { changes: unknown[] };
  parts: WireResourceMap;
} {
  const parts: WireResourceMap = {};
  const part = (bytes: ArrayBuffer): string => {
    const key = `r${Object.keys(parts).length}`;
    parts[key] = { bytes };
    return key;
  };
  const opOf = (op: ChangeOp<PageCoordinates, WireAnnotationResources>): unknown => {
    switch (op.type) {
      case 'annotations.create':
      case 'annotations.update': {
        if (!op.resources) return op;
        const { appearance, file } = op.resources;
        return {
          ...op,
          resources: {
            ...(appearance ? { appearance: part(appearance) } : {}),
            ...(file ? { file: part(file) } : {}),
          },
        };
      }
      case 'forms.setSignatureAppearance':
        return { ...op, appearance: { pdf: part(op.appearance.pdf.buffer as ArrayBuffer) } };
      default:
        return op;
    }
  };
  const body = {
    changes: changes.map(({ opId, change }) =>
      isUndoChange(change) ? { opId, undoOf: change.undoOf } : { opId, ops: change.ops.map(opOf) },
    ),
  };
  return { body, parts };
}

/** Whether a change carries bytes: a drawing, an attached file, a signature's artwork. */
function carriesBytes(change: Change): boolean {
  if (isUndoChange(change)) return false;
  return change.ops.some(
    (op) =>
      op.type === 'forms.setSignatureAppearance' ||
      ((op.type === 'annotations.create' || op.type === 'annotations.update') &&
        op.resources !== undefined &&
        Object.values(op.resources).some((resource) => resource !== undefined)),
  );
}

/** The planes a change's writes took over from the base, each op by its family. */
function planesOf(result: ChangeResult): LayerScopePlane[] {
  const planes = new Set<LayerScopePlane>();
  for (const item of result.items) {
    if (isSkippedItem(item)) continue;
    if (item.type.startsWith('metadata.')) planes.add('metadata');
    else if (item.type.startsWith('forms.')) planes.add('forms');
    else planes.add('annotations');
  }
  return [...planes];
}
