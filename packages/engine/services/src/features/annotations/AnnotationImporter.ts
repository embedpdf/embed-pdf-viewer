import {
  EngineError,
  EngineErrorCode,
  assertBundleManifest,
  assertWithinLimit,
  planAnnotationImport,
  sniffBinaryMetadata,
  toPageRef,
  type AnnotationActor,
  type AnnotationBundleLimits,
  type AnnotationDraft,
  type AnnotationDTO,
  type AnnotationImportPages,
  type AnnotationImportResult,
  type WireAnnotationBundle,
  type WireAnnotationResources,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { AnnotationBatchApplier, type BatchCreate } from './AnnotationBatchApplier';
import { sha256HexOf } from './internal/digest';
import { annotationIndexByName } from './internal/read/annotationIndexByName';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';

export interface AnnotationImportRequest {
  readonly bundle: WireAnnotationBundle;
  readonly pages?: AnnotationImportPages;
  readonly attribution: 'restore' | 'stamp';
  /**
   * The session's identity: who `'stamp'` attributes each annotation to, and
   * whose user `'restore'` records as `importedBy`.
   */
  readonly actor?: AnnotationActor;
  readonly limits: AnnotationBundleLimits;
}

/**
 * `doc.annotations.import`: a bundle's annotations, created in this document
 * as one change. The bundle is checked first, cheapest checks first: its
 * shape, counts and sizes against the limits, each resource against its id,
 * and each image's decoded size, before any image is decoded. Then
 * {@link planAnnotationImport} maps pages and works out what to leave out,
 * and {@link AnnotationBatchApplier} writes the rest, all or nothing. No
 * page is loaded: names are looked up in the page dictionaries, and
 * annotations made on raw handles.
 */
export class AnnotationImporter {
  constructor(
    private readonly runtime: PdfRuntimeModule,
    private readonly session: DocumentSession,
    /** This thread's font registry: FreeText faces by key. */
    private readonly fonts?: FontRegistrar,
  ) {}

  import(request: AnnotationImportRequest, signal: AbortSignal): AnnotationImportResult {
    throwIfAborted(signal);
    const { bundle, limits } = request;
    this.assertBundle(bundle, limits);

    const plan = planAnnotationImport({
      bundle,
      ...(request.pages !== undefined ? { pages: request.pages } : {}),
      target: this.session.allRecords().map((record) => ({
        page: toPageRef(record.pageObjectNumber),
        position: record.pageIndex,
      })),
      nameTaken: (page, nm) =>
        annotationIndexByName(
          this.runtime,
          this.session.requireDocPtr(),
          this.session.resolvePageRef(page).pageIndex,
          nm,
        ) >= 0,
    });

    const creates = plan.creates.map((planned): BatchCreate => {
      const item = bundle.items[planned.item]!;
      const resources: WireAnnotationResources = {};
      for (const [role, id] of Object.entries(item.resources)) {
        resources[role as keyof WireAnnotationResources] = bundle.resources[id]!;
      }
      return {
        page: planned.page,
        draft: planned.draft,
        ...(planned.replyTo
          ? { replyTo: { to: { planned: planned.replyTo.planned }, type: planned.replyTo.type } }
          : {}),
        ...(planned.parent !== undefined ? { parent: { planned: planned.parent } } : {}),
        resources,
        attribution: attributionOf(request, planned.draft, item.data),
        label: `import: item ${planned.item}`,
      };
    });
    const { created, meta } = new AnnotationBatchApplier(
      this.runtime,
      this.session,
      this.fonts,
    ).create(creates, signal);

    return {
      created,
      refMap: plan.creates.map((planned, at) => ({
        from: bundle.items[planned.item]!.data.ref,
        to: created[at]!.ref,
      })),
      dropped: [...plan.dropped],
      meta,
    };
  }

  private assertBundle(bundle: WireAnnotationBundle, limits: AnnotationBundleLimits): void {
    const { fn, mem } = this.runtime;
    const sizes = new Map<string, number>();
    for (const [id, bytes] of Object.entries(bundle.resources ?? {})) {
      if (!(bytes instanceof ArrayBuffer)) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `annotation bundle: resource ${id} is not bytes`,
        );
      }
      sizes.set(id, bytes.byteLength);
    }
    assertBundleManifest(bundle, sizes, limits);

    // The id is the hash: checked here, and kept for the drawing index, so
    // a resource that many stamps place is copied and hashed once.
    const drawings = this.session.drawingIndex();
    for (const [id, bytes] of Object.entries(bundle.resources)) {
      const hex = sha256HexOf(fn, mem, new Uint8Array(bytes));
      if (`sha256-${hex}` !== id) {
        throw new EngineError(
          EngineErrorCode.InvalidArg,
          `annotation bundle: resource ${id} doesn't match its id`,
        );
      }
      drawings.hashes.set(bytes, hex);
    }

    // A small PNG can decode to gigabytes: its size is read from its header.
    for (const item of bundle.items) {
      const id = item.resources.appearance;
      const meta = id ? sniffBinaryMetadata(bundle.resources[id]!) : null;
      if (meta && 'width' in meta) {
        assertWithinLimit(limits, 'imagePixels', meta.width * meta.height);
      }
    }
  }
}

/**
 * `'stamp'`: the session, in the group the item names, as `create` stamps it.
 * `'restore'`: the attribution the item has, and the session as `importedBy`.
 */
function attributionOf(
  request: AnnotationImportRequest,
  draft: AnnotationDraft,
  data: AnnotationDTO,
): BatchCreate['attribution'] {
  const { actor } = request;
  if (request.attribution === 'stamp') {
    const { groupId } = draft as { groupId?: string | null };
    const stamped = typeof groupId === 'string' ? { ...actor, groupId } : actor;
    return { kind: 'stamp', ...(stamped ? { actor: stamped } : {}) };
  }
  return {
    kind: 'restore',
    from: {
      author: data.author,
      createdAt: data.createdAt,
      modifiedAt: data.modifiedAt,
      userId: data.userId,
      createdBy: data.createdBy,
      modifiedBy: data.modifiedBy,
      groupId: data.groupId ?? null,
      ...(data.subtype === 'file-attachment' ? { file: data.file } : {}),
    },
    ...(actor?.userId ? { importedBy: actor.userId } : {}),
  };
}
