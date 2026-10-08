import {
  assertAnnotationBundleManifest,
  pdfAnnotationDraftOf,
  planAnnotationImport,
  toPageRef,
  type AnnotationActor,
  type BundleLimits,
  type AnnotationDraft,
  type Annotation,
  type BundleImportPages,
  type AnnotationImportResult,
  type WireAnnotationBundle,
  type WireAnnotationResources,
  type PdfCoordinates,
} from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule } from '@embedpdf/engine-runtime';

import { AnnotationBatchApplier, type BatchCreate } from './AnnotationBatchApplier';
import { annotationIndexByName } from './internal/read/annotationIndexByName';
import type { DocumentSession } from '../../document-session/DocumentSession';
import { throwIfAborted } from '../../shared/abort';
import type { FontRegistrar } from '../fonts/FontRegistrar';
import { visibleBoxReader } from '../pages/PagesReader';
import { assertImageWithinLimit, checkWireBundle } from '../transfer/checkWireBundle';

export interface AnnotationImportRequest {
  /** In page space, as bundles are: each item converts on the page it goes to. */
  readonly bundle: WireAnnotationBundle;
  readonly pages?: BundleImportPages;
  readonly attribution: 'restore' | 'stamp';
  /**
   * The session's identity: who `'stamp'` attributes each annotation to, and
   * whose user `'restore'` records as `importedBy`.
   */
  readonly actor?: AnnotationActor;
  readonly limits: BundleLimits;
}

/**
 * `doc.annotations.import`: a bundle's annotations, created in this document
 * as one change. The bundle is checked first, cheapest checks first: its
 * shape, counts and sizes against the limits, each resource against its id,
 * and each image's decoded size, before any image is decoded. Then
 * {@link planAnnotationImport} maps pages and works out what to leave out,
 * each create is measured on the page it goes to, from that page's
 * top-left, and {@link AnnotationBatchApplier} writes them, all or nothing. No
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

  import(
    request: AnnotationImportRequest,
    signal: AbortSignal,
  ): AnnotationImportResult<PdfCoordinates> {
    throwIfAborted(signal);
    const { bundle, limits } = request;
    this.assertBundle(bundle, limits);

    // A copy is a new annotation, so it gets a fresh name (the applier mints
    // one): a name the bundle carries is neither kept nor checked.
    const plan = planAnnotationImport({
      bundle: request.attribution === 'stamp' ? withoutNames(bundle) : bundle,
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

    const boxOf = visibleBoxReader(this.runtime, this.session);
    const creates = plan.creates.map((planned): BatchCreate => {
      const item = bundle.items[planned.item]!;
      const resources: WireAnnotationResources = {};
      for (const [role, id] of Object.entries(item.resources)) {
        resources[role as keyof WireAnnotationResources] = bundle.resources[id]!;
      }
      return {
        page: planned.page,
        draft: pdfAnnotationDraftOf(planned.draft, boxOf(planned.page), boxOf),
        ...(planned.replyTo
          ? { replyTo: { to: { planned: planned.replyTo.planned }, type: planned.replyTo.type } }
          : {}),
        ...(planned.parent !== undefined ? { parent: { planned: planned.parent } } : {}),
        resources,
        attribution: attributionOf(request, planned.draft, item.data),
        ...(item.data.subtype === 'file-attachment' && item.data.file
          ? {
              fileDates: {
                createdAt: item.data.file.createdAt,
                modifiedAt: item.data.file.modifiedAt,
              },
            }
          : {}),
        label: `import: item ${planned.item}`,
      };
    });
    const { created, meta } = new AnnotationBatchApplier(
      this.runtime,
      this.session,
      this.fonts,
    ).create(creates, signal);

    return {
      annotations: created,
      refMap: plan.creates.map((planned, at) => ({
        from: bundle.items[planned.item]!.data.ref,
        to: created[at]!.ref,
      })),
      dropped: [...plan.dropped],
      meta,
    };
  }

  private assertBundle(bundle: WireAnnotationBundle, limits: BundleLimits): void {
    const hashes = checkWireBundle(
      this.runtime,
      'annotation',
      bundle,
      limits,
      assertAnnotationBundleManifest,
    );
    // Kept for the drawing index, so a resource that many stamps place is
    // copied and hashed once.
    const drawings = this.session.drawingIndex();
    for (const [bytes, hex] of hashes) drawings.hashes.set(bytes, hex);
    for (const item of bundle.items) {
      const id = item.resources.appearance;
      if (id) assertImageWithinLimit('annotation', limits, bundle.resources[id]!);
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
  data: Annotation,
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
    },
    ...(actor?.userId ? { importedBy: actor.userId } : {}),
  };
}

/** `bundle` with every item's name dropped. */
function withoutNames(bundle: WireAnnotationBundle): WireAnnotationBundle {
  return {
    ...bundle,
    items: bundle.items.map((item) => ({ ...item, data: { ...item.data, nm: null } })),
  };
}
