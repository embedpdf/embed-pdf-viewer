import type { Kysely } from 'kysely';
import type { Database as Schema } from '../schema';

export interface WeakAnnotationSessionRow {
  id: string;
  tenantId: string;
  docId: string;
  layerName: string;
  sub: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
}

export interface WeakAnnotationSessionScope {
  tenantId: string;
  docId: string;
  layerName: string;
}

export class WeakAnnotationSessionsRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async create(input: {
    id: string;
    tenantId: string;
    docId: string;
    layerName: string;
    sub: string;
    pageObjectNumbers: readonly number[];
    expiresAt: number;
  }): Promise<WeakAnnotationSessionRow> {
    const now = Date.now();
    await this.db.transaction().execute(async (trx) => {
      await trx
        .insertInto('weak_annotation_sessions')
        .values({
          id: input.id,
          tenant_id: input.tenantId,
          doc_id: input.docId,
          layer_name: input.layerName,
          sub: input.sub,
          created_at: now,
          updated_at: now,
          expires_at: input.expiresAt,
        })
        .execute();
      await replacePages(trx, input.id, input.pageObjectNumbers, now, input.expiresAt);
    });
    return {
      id: input.id,
      tenantId: input.tenantId,
      docId: input.docId,
      layerName: input.layerName,
      sub: input.sub,
      createdAt: now,
      updatedAt: now,
      expiresAt: input.expiresAt,
    };
  }

  async findOwned(
    scope: WeakAnnotationSessionScope,
    sessionId: string,
    sub: string,
  ): Promise<WeakAnnotationSessionRow | null> {
    const row = await this.db
      .selectFrom('weak_annotation_sessions')
      .selectAll()
      .where('id', '=', sessionId)
      .where('tenant_id', '=', scope.tenantId)
      .where('doc_id', '=', scope.docId)
      .where('layer_name', '=', scope.layerName)
      .where('sub', '=', sub)
      .executeTakeFirst();
    return row ? mapSessionRow(row) : null;
  }

  async pageObjectNumbers(sessionId: string): Promise<number[]> {
    const rows = await this.db
      .selectFrom('weak_annotation_session_pages')
      .select('page_object_number')
      .where('session_id', '=', sessionId)
      .orderBy('page_object_number', 'asc')
      .execute();
    return rows.map((row) => Number(row.page_object_number));
  }

  async updatePages(
    session: WeakAnnotationSessionRow,
    pageObjectNumbers: readonly number[],
    expiresAt: number,
  ): Promise<void> {
    const now = Date.now();
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('weak_annotation_sessions')
        .set({ updated_at: now, expires_at: expiresAt })
        .where('id', '=', session.id)
        .execute();
      await replacePages(trx, session.id, pageObjectNumbers, now, expiresAt);
    });
  }

  async heartbeat(session: WeakAnnotationSessionRow, expiresAt: number): Promise<void> {
    const now = Date.now();
    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('weak_annotation_sessions')
        .set({ updated_at: now, expires_at: expiresAt })
        .where('id', '=', session.id)
        .execute();
      await trx
        .updateTable('weak_annotation_session_pages')
        .set({ updated_at: now, expires_at: expiresAt })
        .where('session_id', '=', session.id)
        .execute();
    });
  }

  async release(sessionId: string): Promise<void> {
    await this.db.deleteFrom('weak_annotation_sessions').where('id', '=', sessionId).execute();
  }

  async activeEditorsForPage(
    scope: WeakAnnotationSessionScope,
    pageObjectNumber: number,
    now: number,
  ): Promise<string[]> {
    const rows = await this.db
      .selectFrom('weak_annotation_sessions as s')
      .innerJoin('weak_annotation_session_pages as p', 'p.session_id', 's.id')
      .select('s.sub')
      .distinct()
      .where('s.tenant_id', '=', scope.tenantId)
      .where('s.doc_id', '=', scope.docId)
      .where('s.layer_name', '=', scope.layerName)
      .where('s.expires_at', '>', now)
      .where('p.expires_at', '>', now)
      .where('p.page_object_number', '=', pageObjectNumber)
      .execute();
    return rows.map((row) => row.sub);
  }
}

async function replacePages(
  trx: Kysely<Schema>,
  sessionId: string,
  pageObjectNumbers: readonly number[],
  now: number,
  expiresAt: number,
): Promise<void> {
  await trx
    .deleteFrom('weak_annotation_session_pages')
    .where('session_id', '=', sessionId)
    .execute();
  const uniquePages = [...new Set(pageObjectNumbers)];
  if (uniquePages.length === 0) return;
  await trx
    .insertInto('weak_annotation_session_pages')
    .values(
      uniquePages.map((pageObjectNumber) => ({
        session_id: sessionId,
        page_object_number: pageObjectNumber,
        updated_at: now,
        expires_at: expiresAt,
      })),
    )
    .execute();
}

function mapSessionRow(row: {
  id: string;
  tenant_id: string;
  doc_id: string;
  layer_name: string;
  sub: string;
  created_at: number;
  updated_at: number;
  expires_at: number;
}): WeakAnnotationSessionRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    docId: row.doc_id,
    layerName: row.layer_name,
    sub: row.sub,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    expiresAt: Number(row.expires_at),
  };
}
