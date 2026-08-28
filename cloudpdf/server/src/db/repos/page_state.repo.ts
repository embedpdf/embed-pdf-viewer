import type { Kysely } from 'kysely';

import type { Database as Schema } from '../schema';

export interface DurablePageRow {
  pageObjectNumber: number;
  contentVersion: number;
  annotationVersion: number;
  annotationGeneration: number;
  hasWeakAnnotations: boolean;
  updatedAt: number;
}

export interface UpsertDurablePageInput {
  pageObjectNumber: number;
  contentVersion?: number;
  annotationVersion?: number;
  annotationGeneration?: number;
  hasWeakAnnotations: boolean;
  updatedAt?: number;
}

export class DocumentPagesRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async findByDocument(docId: string): Promise<DurablePageRow[]> {
    const rows = await this.db
      .selectFrom('document_pages')
      .selectAll()
      .where('doc_id', '=', docId)
      .orderBy('page_object_number', 'asc')
      .execute();
    return rows.map(mapDocumentPageRow);
  }

  async hasRows(docId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('document_pages')
      .select('doc_id')
      .where('doc_id', '=', docId)
      .limit(1)
      .executeTakeFirst();
    return !!row;
  }

  async replaceForDocument(docId: string, pages: UpsertDurablePageInput[]): Promise<void> {
    const now = Date.now();
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('document_pages').where('doc_id', '=', docId).execute();
      if (pages.length === 0) return;
      await trx
        .insertInto('document_pages')
        .values(
          pages.map((page) => ({
            doc_id: docId,
            page_object_number: page.pageObjectNumber,
            content_version: page.contentVersion ?? 1,
            annotation_version: page.annotationVersion ?? 1,
            annotation_generation: page.annotationGeneration ?? 0,
            has_weak_annotations: page.hasWeakAnnotations ? 1 : 0,
            updated_at: page.updatedAt ?? now,
          })),
        )
        .execute();
    });
  }

  async upsertForDocument(docId: string, pages: UpsertDurablePageInput[]): Promise<void> {
    if (pages.length === 0) return;
    const now = Date.now();
    await this.db
      .insertInto('document_pages')
      .values(
        pages.map((page) => ({
          doc_id: docId,
          page_object_number: page.pageObjectNumber,
          content_version: page.contentVersion ?? 1,
          annotation_version: page.annotationVersion ?? 1,
          annotation_generation: page.annotationGeneration ?? 0,
          has_weak_annotations: page.hasWeakAnnotations ? 1 : 0,
          updated_at: page.updatedAt ?? now,
        })),
      )
      .onConflict((oc) =>
        oc.columns(['doc_id', 'page_object_number']).doUpdateSet((eb) => ({
          content_version: eb.ref('excluded.content_version'),
          annotation_version: eb.ref('excluded.annotation_version'),
          annotation_generation: eb.ref('excluded.annotation_generation'),
          has_weak_annotations: eb.ref('excluded.has_weak_annotations'),
          updated_at: eb.ref('excluded.updated_at'),
        })),
      )
      .execute();
  }

  async bumpAnnotationState(
    docId: string,
    pageObjectNumber: number,
    input: {
      bumpVersion: boolean;
      bumpGeneration: boolean;
      hasWeakAnnotations?: boolean;
    },
  ): Promise<void> {
    const row = await this.db
      .selectFrom('document_pages')
      .select(['annotation_version', 'annotation_generation'])
      .where('doc_id', '=', docId)
      .where('page_object_number', '=', pageObjectNumber)
      .executeTakeFirst();
    if (!row) return;
    await this.db
      .updateTable('document_pages')
      .set({
        annotation_version: Number(row.annotation_version) + (input.bumpVersion ? 1 : 0),
        annotation_generation: Number(row.annotation_generation) + (input.bumpGeneration ? 1 : 0),
        ...(typeof input.hasWeakAnnotations === 'boolean'
          ? { has_weak_annotations: input.hasWeakAnnotations ? 1 : 0 }
          : {}),
        updated_at: Date.now(),
      })
      .where('doc_id', '=', docId)
      .where('page_object_number', '=', pageObjectNumber)
      .execute();
  }
}

export interface LayerRow {
  id: string;
  docId: string;
  tenantId: string;
  name: string;
  docVersion: number;
  layoutVersion: number;
  metadataVersion: number;
  attachmentsVersion: number;
  /** Bulk-annotations pointer — see `LayersTable.annotations_version`. */
  annotationsVersion: number;
  /** Audit-log head at this layer's state — the manifest's `auditHead`. */
  lastAuditId: number;
  currentVersion: number;
  currentArtifactKey: string | null;
  currentArtifactSha: string | null;
  currentArtifactSize: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateLayerInput {
  id: string;
  docId: string;
  tenantId: string;
  name: string;
}

export class LayersRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async findByDocAndName(docId: string, name: string): Promise<LayerRow | null> {
    const row = await this.db
      .selectFrom('layers')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('name', '=', name)
      .executeTakeFirst();
    return row ? mapLayerRow(row) : null;
  }

  async createEmpty(input: CreateLayerInput): Promise<LayerRow> {
    const now = Date.now();
    await this.db
      .insertInto('layers')
      .values({
        id: input.id,
        doc_id: input.docId,
        tenant_id: input.tenantId,
        name: input.name,
        doc_version: 1,
        attachments_version: 1,
        annotations_version: 1,
        layout_version: 1,
        metadata_version: 1,
        last_audit_id: 0,
        current_version: 0,
        current_artifact_key: null,
        current_artifact_sha: null,
        current_artifact_size: null,
        created_at: now,
        updated_at: now,
      })
      .onConflict((oc) => oc.columns(['doc_id', 'name']).doNothing())
      .execute();
    const row = await this.findByDocAndName(input.docId, input.name);
    if (!row)
      throw new Error(`createEmpty: layer vanished after insert: ${input.docId}/${input.name}`);
    return row;
  }
}

export class LayerPagesRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async findByLayer(layerId: string): Promise<DurablePageRow[]> {
    const rows = await this.db
      .selectFrom('layer_pages')
      .selectAll()
      .where('layer_id', '=', layerId)
      .orderBy('page_object_number', 'asc')
      .execute();
    return rows.map(mapLayerPageRow);
  }

  async hasRows(layerId: string): Promise<boolean> {
    const row = await this.db
      .selectFrom('layer_pages')
      .select('layer_id')
      .where('layer_id', '=', layerId)
      .limit(1)
      .executeTakeFirst();
    return !!row;
  }

  async replaceForLayer(layerId: string, pages: UpsertDurablePageInput[]): Promise<void> {
    const now = Date.now();
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('layer_pages').where('layer_id', '=', layerId).execute();
      if (pages.length === 0) return;
      await trx
        .insertInto('layer_pages')
        .values(
          pages.map((page) => ({
            layer_id: layerId,
            page_object_number: page.pageObjectNumber,
            content_version: page.contentVersion ?? 1,
            annotation_version: page.annotationVersion ?? 1,
            annotation_generation: page.annotationGeneration ?? 0,
            has_weak_annotations: page.hasWeakAnnotations ? 1 : 0,
            updated_at: page.updatedAt ?? now,
          })),
        )
        .execute();
    });
  }

  /**
   * First materialization of a layer's page rows from the immutable base.
   * MUST be concurrency-safe across replicas: two replicas whose first-ever
   * writes race both observe "no rows yet" and both snapshot — the values
   * are identical (derived from `document_pages`), so the loser's inserts
   * are simply ignored. A delete-then-insert here turns that benign race
   * into a unique violation that fails one replica's first write.
   */
  async snapshotImmutableBaseForLayer(layerId: string, pages: DurablePageRow[]): Promise<void> {
    if (pages.length === 0) return;
    const now = Date.now();
    await this.db
      .insertInto('layer_pages')
      .values(
        pages.map((page) => ({
          layer_id: layerId,
          page_object_number: page.pageObjectNumber,
          // `document_pages` describes the immutable base view, so these
          // counters are the initial CDN/revision epoch. After snapshotting,
          // only `layer_pages` advance.
          content_version: page.contentVersion,
          annotation_version: page.annotationVersion,
          annotation_generation: page.annotationGeneration,
          has_weak_annotations: page.hasWeakAnnotations ? 1 : 0,
          updated_at: page.updatedAt ?? now,
        })),
      )
      .onConflict((oc) => oc.columns(['layer_id', 'page_object_number']).doNothing())
      .execute();
  }
}

function mapDocumentPageRow(row: {
  page_object_number: number;
  content_version: number;
  annotation_version: number;
  annotation_generation: number;
  has_weak_annotations: boolean | number;
  updated_at: number;
}): DurablePageRow {
  return {
    pageObjectNumber: Number(row.page_object_number),
    contentVersion: Number(row.content_version),
    annotationVersion: Number(row.annotation_version),
    annotationGeneration: Number(row.annotation_generation),
    hasWeakAnnotations: Boolean(row.has_weak_annotations),
    updatedAt: Number(row.updated_at),
  };
}

function mapLayerPageRow(row: {
  page_object_number: number;
  content_version: number;
  annotation_version: number;
  annotation_generation: number;
  has_weak_annotations: boolean | number;
  updated_at: number;
}): DurablePageRow {
  return mapDocumentPageRow(row);
}

function mapLayerRow(row: {
  id: string;
  doc_id: string;
  tenant_id: string;
  name: string;
  doc_version: number;
  layout_version: number;
  metadata_version: number;
  attachments_version: number;
  annotations_version?: number | bigint;
  current_version: number;
  current_artifact_key: string | null;
  current_artifact_sha: string | null;
  current_artifact_size: number | null;
  last_audit_id?: number | bigint;
  created_at: number;
  updated_at: number;
}): LayerRow {
  return {
    id: row.id,
    docId: row.doc_id,
    tenantId: row.tenant_id,
    name: row.name,
    docVersion: Number(row.doc_version),
    layoutVersion: Number(row.layout_version),
    metadataVersion: Number(row.metadata_version),
    attachmentsVersion: Number(row.attachments_version),
    annotationsVersion: Number(row.annotations_version ?? 1),
    lastAuditId: Number(row.last_audit_id ?? 0),
    currentVersion: Number(row.current_version),
    currentArtifactKey: row.current_artifact_key,
    currentArtifactSha: row.current_artifact_sha,
    currentArtifactSize:
      row.current_artifact_size === null ? null : Number(row.current_artifact_size),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}
