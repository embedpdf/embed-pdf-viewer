/**
 * The base version catalog (migrations 030, 044): a document's upload, and
 * every version a signature made. `documents.base_sha` is the upload; a
 * completed signature inserts the next row along its layer's chain (number =
 * parent's + 1) and moves only that layer's `base_sha`, in the same
 * transaction. A version's plane pointers are what its manifest publishes;
 * version 1 carries the initial epochs, so an unsigned document (only
 * version 1) reads the same as one without a catalog row.
 */
import type { Kysely, Transaction } from 'kysely';

import type { BaseVersionsTable, Database as Schema } from '../schema';

type DbExecutor = Kysely<Schema> | Transaction<Schema>;

/** The doc-level plane pointers a base version publishes. */
export interface BasePlanePointers {
  layoutVersion: number;
  metadataVersion: number;
  attachmentsVersion: number;
  annotationsVersion: number;
  formsVersion: number;
  outlineVersion: number;
}

/** The initial epochs: what version 1 (an upload) carries. */
export const INITIAL_BASE_POINTERS: Readonly<BasePlanePointers> = Object.freeze({
  layoutVersion: 1,
  metadataVersion: 1,
  attachmentsVersion: 1,
  annotationsVersion: 1,
  formsVersion: 1,
  outlineVersion: 1,
});

export interface BaseVersionRow extends BasePlanePointers {
  tenantId: string;
  docId: string;
  /** The layer whose signature made it; `null` for the upload. */
  layerId: string | null;
  sha256: string;
  byteLength: number;
  number: number;
  parentSha256: string | null;
  producerKind: 'upload' | 'signature';
  producerRef: string | null;
  /** `null` = the legacy `StorageKeys.basePdf` key. */
  storageKey: string | null;
  createdAt: number;
}

export interface InsertInitialBaseVersion {
  tenantId: string;
  docId: string;
  sha256: string;
  byteLength: number;
  createdAt: number;
}

export interface InsertPublishedBaseVersion extends BasePlanePointers {
  tenantId: string;
  docId: string;
  /** The signing layer: the version is its own. */
  layerId: string;
  sha256: string;
  byteLength: number;
  /** The layer's base the signature was built on; the new number is its number + 1. */
  parent: Pick<BaseVersionRow, 'sha256' | 'number'>;
  signingId: string;
  storageKey: string;
  createdAt: number;
}

export class BaseVersionsRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async find(
    docId: string,
    sha256: string,
    executor: DbExecutor = this.db,
  ): Promise<BaseVersionRow | null> {
    const row = await executor
      .selectFrom('base_versions')
      .selectAll()
      .where('doc_id', '=', docId)
      .where('sha256', '=', sha256)
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  async require(
    docId: string,
    sha256: string,
    executor: DbExecutor = this.db,
  ): Promise<BaseVersionRow> {
    const row = await this.find(docId, sha256, executor);
    if (!row) throw new Error(`base version ${sha256} of ${docId} is not catalogued`);
    return row;
  }

  /** Oldest first. */
  async listForDocument(docId: string, executor: DbExecutor = this.db): Promise<BaseVersionRow[]> {
    const rows = await executor
      .selectFrom('base_versions')
      .selectAll()
      .where('doc_id', '=', docId)
      .orderBy('number', 'asc')
      .execute();
    return rows.map(mapRow);
  }

  /**
   * Version 1 of a freshly committed upload. Idempotent: the row is the
   * document's identity, so a replayed commit changes nothing.
   */
  async insertInitial(
    input: InsertInitialBaseVersion,
    executor: DbExecutor = this.db,
  ): Promise<void> {
    await executor
      .insertInto('base_versions')
      .values({
        tenant_id: input.tenantId,
        doc_id: input.docId,
        layer_id: null,
        sha256: input.sha256,
        byte_length: input.byteLength,
        number: 1,
        parent_sha256: null,
        producer_kind: 'upload',
        producer_ref: null,
        storage_key: null,
        layout_version: INITIAL_BASE_POINTERS.layoutVersion,
        metadata_version: INITIAL_BASE_POINTERS.metadataVersion,
        attachments_version: INITIAL_BASE_POINTERS.attachmentsVersion,
        annotations_version: INITIAL_BASE_POINTERS.annotationsVersion,
        forms_version: INITIAL_BASE_POINTERS.formsVersion,
        outline_version: INITIAL_BASE_POINTERS.outlineVersion,
        created_at: input.createdAt,
      })
      .onConflict((oc) => oc.columns(['doc_id', 'sha256']).doNothing())
      .execute();
  }

  /**
   * The version a completed signature made in its layer. Inside the
   * completion transaction: the `(layer_id, number)` uniqueness is the third
   * fence, so two completions racing over the same parent cannot both insert
   * parent + 1.
   */
  async insertPublished(
    trx: Transaction<Schema>,
    input: InsertPublishedBaseVersion,
  ): Promise<BaseVersionRow> {
    const values: BaseVersionsTable = {
      tenant_id: input.tenantId,
      doc_id: input.docId,
      layer_id: input.layerId,
      sha256: input.sha256,
      byte_length: input.byteLength,
      number: input.parent.number + 1,
      parent_sha256: input.parent.sha256,
      producer_kind: 'signature',
      producer_ref: input.signingId,
      storage_key: input.storageKey,
      layout_version: input.layoutVersion,
      metadata_version: input.metadataVersion,
      attachments_version: input.attachmentsVersion,
      annotations_version: input.annotationsVersion,
      forms_version: input.formsVersion,
      outline_version: input.outlineVersion,
      created_at: input.createdAt,
    };
    await trx.insertInto('base_versions').values(values).execute();
    return mapRow(values);
  }

  /**
   * Forget a deleted layer's versions. Their files go with the layer's
   * storage; a version another live layer is on stays (only data from
   * before migration 044 can be in that state).
   */
  async deleteForLayer(executor: DbExecutor, docId: string, layerId: string): Promise<void> {
    await executor
      .deleteFrom('base_versions')
      .where('doc_id', '=', docId)
      .where('layer_id', '=', layerId)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('layers')
              .select('layers.id')
              .whereRef('layers.doc_id', '=', 'base_versions.doc_id')
              .whereRef('layers.base_sha', '=', 'base_versions.sha256')
              .where('layers.deleted_at', 'is', null)
              .where('layers.id', '!=', layerId),
          ),
        ),
      )
      .execute();
  }
}

function mapRow(row: BaseVersionsTable): BaseVersionRow {
  return {
    tenantId: row.tenant_id,
    docId: row.doc_id,
    layerId: row.layer_id ?? null,
    sha256: row.sha256,
    byteLength: Number(row.byte_length),
    number: Number(row.number),
    parentSha256: row.parent_sha256,
    producerKind: row.producer_kind,
    producerRef: row.producer_ref,
    storageKey: row.storage_key,
    layoutVersion: Number(row.layout_version),
    metadataVersion: Number(row.metadata_version),
    attachmentsVersion: Number(row.attachments_version),
    annotationsVersion: Number(row.annotations_version),
    formsVersion: Number(row.forms_version),
    outlineVersion: Number(row.outline_version ?? 1),
    createdAt: Number(row.created_at),
  };
}
