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
  type SessionEventPublisher,
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

import { buildMutationForm } from './buildMutationForm';
import { assertServerTakesMark, exactBuffer, markPart } from './signatureMark';
import type { ManifestAccessor } from './CloudDocumentHandle';
import type { ChangeSender, CloudWrites, SentChange } from './CloudWrites';
import type { HttpClient } from '../transport/HttpClient';
import { forAnyoneTheServerLacks, type ForAnyoneWrite } from './anyoneFields';
import {
  fieldFactsTheServerLacks,
  widgetLayoutTheServerLacks,
  type FieldWrite,
  type WidgetWrite,
} from './fieldFacts';
import { opsTheServerLacks } from '../transport/serverVersion';

/** How many `opId`s a handle remembers having published: far more than any retry spans. */
const PUBLISHED_MEMORY = 4096;

/**
 * `doc.apply` on the cloud: each change takes its place in the document's
 * line of writes, and goes out with the changes called right after it, as
 * one `POST …/changes` (see {@link CloudWrites.change}). The server checks
 * every op against the caller inside the write, so nothing about the ops is
 * checked here beyond what the request must hold, and that the server has
 * each kind of op: an older server refuses a request with a kind it doesn't
 * know whole, with every change that shares it.
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
    /** The version the server last said it is; `null` before it said so. */
    private readonly serverVersion: () => string | null,
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
    // A kind of op the server doesn't have yet is refused here, alone, and so
    // is a field's purpose, format or `forAnyone`, or a widget's layout, on its
    // way to a server older than them.
    const lacking = isUndoChange(change)
      ? null
      : (opsTheServerLacks(
          this.serverVersion(),
          change.ops.map((op) => op.type),
        ) ??
        fieldFactsTheServerLacks(this.serverVersion(), ...change.ops.flatMap(fieldWritesOf)) ??
        forAnyoneTheServerLacks(this.serverVersion(), ...change.ops.flatMap(fieldWritesOf)) ??
        widgetLayoutTheServerLacks(this.serverVersion(), ...change.ops.flatMap(widgetWritesOf)));
    if (lacking) return AbortablePromise.rejectReason(lacking);
    return AbortablePromise.run<ChangeResult>(async (signal) => {
      // In line now, so it keeps its place among this document's writes while
      // its bytes are read.
      const answer = await this.writes.change(
        signal,
        sentChangeOf(opId, change, this.serverVersion()),
        {
          named: objectNumbersNamedBy(change),
          alone: carriesBytes(change),
        },
      );
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
    // A change of the page set patches the manifest's page rows, as its single verbs did.
    for (const item of result.items) {
      if (item.type === 'pages.delete') this.manifest.applyPageDelete(result.meta, item.pages);
      else if (
        item.type === 'pages.insert' ||
        item.type === 'pages.insertBlank' ||
        item.type === 'pages.copy' ||
        item.type === 'pages.restore'
      ) {
        this.manifest.applyPageInsert(result.meta);
      }
    }
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
 * may hold and what the server takes, so a malformed change is refused alone
 * rather than refusing the request it would share.
 */
async function sentChangeOf(
  opId: string,
  change: Change,
  serverVersion: string | null,
): Promise<SentChange> {
  if (!isUndoChange(change) && change.ops.length > CHANGE_REQUEST_LIMITS.ops) {
    throw new EngineError(
      EngineErrorCode.PayloadTooLarge,
      `a change holds at most ${CHANGE_REQUEST_LIMITS.ops} ops`,
      { details: { limit: 'ops', max: CHANGE_REQUEST_LIMITS.ops, value: change.ops.length } },
    );
  }
  const sent: SentChange = { opId, change: (await resolveChangeResources(change)).change };
  // A mark the server can't take as it is meant is refused here, alone.
  if (!isUndoChange(sent.change)) {
    for (const op of sent.change.ops) {
      if (op.type === 'forms.setSignatureAppearance') {
        assertServerTakesMark(op.appearance, serverVersion);
      }
    }
  }
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
      case 'forms.setSignatureAppearance': {
        const { appearance, ...rest } = op;
        // `null`, no mark, travels as it is: no part.
        const mark = markPart(appearance);
        return { ...rest, resources: { appearance: mark && part(mark) } };
      }
      case 'forms.setButtonImage': {
        const { image, ...rest } = op;
        // `null`, no image, travels as it is: no part. The bytes were read
        // and checked (`resolveChangeResources`).
        const bytes = image && exactBuffer(image as Uint8Array);
        return { ...rest, resources: { image: bytes && part(bytes) } };
      }
      case 'pages.insert': {
        const { source, ...rest } = op;
        return { ...rest, resources: { source: part(source.slice().buffer as ArrayBuffer) } };
      }
      case 'attachments.create': {
        // Without its bytes, the request's schema refuses the change.
        const { file } = op.resources;
        return { ...op, resources: file ? { file: part(file) } : {} };
      }
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

/**
 * What an op writes of a field, or expects of one: a create's draft, an
 * update's patch, and what an update or a delete expects. They are what can
 * name a field's purpose or format.
 */
function fieldWritesOf(
  op: Extract<Change, { ops: unknown }>['ops'][number],
): (FieldWrite & ForAnyoneWrite)[] {
  switch (op.type) {
    case 'forms.create':
      return [op.draft];
    case 'forms.update':
      return [op.patch, op.expect];
    case 'forms.delete':
      return [op.expect];
    default:
      return [];
  }
}

/**
 * What an op writes of a widget, or expects of one: a create's placements,
 * an added widget's, an updated widget's patch and what it expects, and an
 * annotation write of a widget. They are what can name a layout.
 */
function widgetWritesOf(op: Extract<Change, { ops: unknown }>['ops'][number]): WidgetWrite[] {
  switch (op.type) {
    case 'forms.create':
      return [...(op.draft.widgets ?? [])];
    case 'forms.addWidget':
      return [op.placement];
    case 'forms.updateWidget':
      return [op.patch, op.expect];
    case 'annotations.create':
      return op.data.subtype === 'widget' ? [op.data] : [];
    case 'annotations.update':
      return op.patch.subtype === 'widget' || 'layout' in op.patch ? [op.patch as WidgetWrite] : [];
    default:
      return [];
  }
}

/**
 * Whether a change carries bytes: a drawing, an attached file, a signature's
 * artwork, a push button's image, a PDF whose pages come in.
 */
function carriesBytes(change: Change): boolean {
  if (isUndoChange(change)) return false;
  return change.ops.some(
    (op) =>
      (op.type === 'forms.setSignatureAppearance' && op.appearance !== null) ||
      (op.type === 'forms.setButtonImage' && op.image !== null) ||
      op.type === 'pages.insert' ||
      op.type === 'attachments.create' ||
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
    else if (item.type.startsWith('outline.')) planes.add('outline');
    else if (item.type.startsWith('pages.')) planes.add('layout');
    else if (item.type.startsWith('forms.')) planes.add('forms');
    else if (item.type.startsWith('attachments.')) planes.add('attachments');
    else planes.add('annotations');
  }
  return [...planes];
}
