import { sql, type Kysely, type RawBuilder } from 'kysely';

import { nameKeyOf } from '../names';
import type { Database as Schema } from '../schema';

/** Folders nest at most this many levels; the recursive queries stop there too. */
export const MAX_FOLDER_DEPTH = 100;

/**
 * A `WITH RECURSIVE` clause naming `below(id, depth)`: the folder and
 * every folder under it, the folder itself at depth one. Statements that
 * act on a whole subtree start with it, so a subtree of any size is one
 * statement rather than a list of ids.
 */
export function foldersBelow(id: string): RawBuilder<unknown> {
  return sql`
    WITH RECURSIVE below(id, depth) AS (
      SELECT id, 1 FROM folders WHERE id = ${id}
      UNION ALL
      SELECT f.id, b.depth + 1
        FROM folders f JOIN below b ON f.parent_id = b.id
       WHERE b.depth < ${MAX_FOLDER_DEPTH}
    )
  `;
}

export interface FolderRow {
  id: string;
  tenantId: string;
  /** Null at the top level. */
  parentId: string | null;
  name: string;
  createdAt: number;
  updatedAt: number;
  createdBy: string | null;
}

export interface FolderListOptions {
  /** Only folders directly in this folder; `null` is the top level. Without it, every folder. */
  parentId?: string | null;
  limit?: number;
  /** Keyset cursor: only folders strictly after this position in name order. */
  after?: { key: string; id: string };
}

export interface CreateFolderInput {
  id: string;
  tenantId: string;
  parentId: string | null;
  name: string;
  createdBy: string | null;
}

/**
 * Pure-data access to the `folders` table. A folder stores only its parent;
 * ancestors and everything below a folder come from recursive queries that
 * stop at {@link MAX_FOLDER_DEPTH} levels. Checks that span rows (names,
 * loops, depth) belong to the folder service, which runs them under the
 * tenant's tree lock.
 */
export class FoldersRepo {
  constructor(private readonly db: Kysely<Schema>) {}

  async insert(input: CreateFolderInput): Promise<FolderRow> {
    const now = Date.now();
    const row = {
      id: input.id,
      tenant_id: input.tenantId,
      parent_id: input.parentId,
      name: input.name,
      name_key: nameKeyOf(input.name),
      created_at: now,
      updated_at: now,
      created_by: input.createdBy,
    };
    await this.db.insertInto('folders').values(row).execute();
    return mapRow(row);
  }

  async findById(id: string): Promise<FolderRow | null> {
    const row = await this.db
      .selectFrom('folders')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? mapRow(row) : null;
  }

  /** Of `ids`, the folders in the tenant. */
  async findOwned(tenantId: string, ids: ReadonlyArray<string>): Promise<FolderRow[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .selectFrom('folders')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('id', 'in', [...ids])
      .execute();
    return rows.map(mapRow);
  }

  /** Strict variant: throws NotFound, or Forbidden for another tenant's folder. */
  async requireOwned(id: string, tenantId: string): Promise<FolderRow> {
    const folder = await this.findById(id);
    if (!folder) throwError('NotFound', `folder not found: ${id}`);
    if (folder.tenantId !== tenantId)
      throwError('Forbidden', `folder does not belong to tenant: ${id}`);
    return folder;
  }

  async listForTenant(tenantId: string, opts: FolderListOptions = {}): Promise<FolderRow[]> {
    let q = this.db
      .selectFrom('folders')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .orderBy('name_key', 'asc')
      .orderBy('id', 'asc');
    if (opts.parentId !== undefined) {
      q =
        opts.parentId === null
          ? q.where('parent_id', 'is', null)
          : q.where('parent_id', '=', opts.parentId);
    }
    if (opts.after) {
      const { key, id } = opts.after;
      q = q.where((eb) =>
        eb.or([eb('name_key', '>', key), eb.and([eb('name_key', '=', key), eb('id', '>', id)])]),
      );
    }
    if (opts.limit) q = q.limit(opts.limit);
    const rows = await q.execute();
    return rows.map(mapRow);
  }

  /** Folders directly in `parentId` (`null`: the top level) named like any of `names`, ignoring case. */
  async findChildrenNamed(
    tenantId: string,
    parentId: string | null,
    names: ReadonlyArray<string>,
  ): Promise<FolderRow[]> {
    if (names.length === 0) return [];
    let q = this.db
      .selectFrom('folders')
      .selectAll()
      .where('tenant_id', '=', tenantId)
      .where('name_key', 'in', names.map(nameKeyOf));
    q = parentId === null ? q.where('parent_id', 'is', null) : q.where('parent_id', '=', parentId);
    const rows = await q.execute();
    return rows.map(mapRow);
  }

  async rename(id: string, name: string): Promise<void> {
    await this.db
      .updateTable('folders')
      .set({ name, name_key: nameKeyOf(name), updated_at: Date.now() })
      .where('id', '=', id)
      .execute();
  }

  async setParent(ids: ReadonlyArray<string>, parentId: string | null): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .updateTable('folders')
      .set({ parent_id: parentId, updated_at: Date.now() })
      .where('id', 'in', [...ids])
      .execute();
  }

  async delete(id: string): Promise<void> {
    await this.db.deleteFrom('folders').where('id', '=', id).execute();
  }

  /** Delete the folder and every folder under it, in one statement. */
  async deleteBelow(id: string): Promise<void> {
    await sql`
      ${foldersBelow(id)}
      DELETE FROM folders WHERE id IN (SELECT id FROM below)
    `.execute(this.db);
  }

  /** The folder and every folder above it, nearest first; empty when it does not exist. */
  async ancestorsOf(id: string): Promise<Array<{ id: string; name: string }>> {
    const result = await sql<{ id: string; name: string; depth: number }>`
      WITH RECURSIVE ancestors(id, parent_id, name, depth) AS (
        SELECT id, parent_id, name, 1 FROM folders WHERE id = ${id}
        UNION ALL
        SELECT f.id, f.parent_id, f.name, a.depth + 1
          FROM folders f JOIN ancestors a ON f.id = a.parent_id
         WHERE a.depth < ${MAX_FOLDER_DEPTH}
      )
      SELECT id, name, depth FROM ancestors ORDER BY depth
    `.execute(this.db);
    return result.rows.map((row) => ({ id: row.id, name: row.name }));
  }

  /** Levels from the folder down to its deepest folder, the folder itself counting one. */
  async heightOf(id: string): Promise<number> {
    const result = await sql<{ height: number | null }>`
      ${foldersBelow(id)}
      SELECT max(depth) AS height FROM below
    `.execute(this.db);
    return Number(result.rows[0]?.height ?? 0);
  }

  /** What the folder holds at every level below it; documents being deleted are in no folder. */
  async contentsOf(tenantId: string, id: string): Promise<{ folders: number; documents: number }> {
    const result = await sql<{ folders: number; documents: number }>`
      ${foldersBelow(id)}
      SELECT
        (SELECT count(*) FROM below) - 1 AS folders,
        (SELECT count(*) FROM documents
          WHERE tenant_id = ${tenantId}
            AND folder_id IN (SELECT id FROM below)
            AND state <> 'deleting') AS documents
    `.execute(this.db);
    const row = result.rows[0];
    return { folders: Number(row?.folders ?? 0), documents: Number(row?.documents ?? 0) };
  }
}

function mapRow(r: {
  id: string;
  tenant_id: string;
  parent_id: string | null;
  name: string;
  created_at: number;
  updated_at: number;
  created_by: string | null;
}): FolderRow {
  return {
    id: r.id,
    tenantId: r.tenant_id,
    parentId: r.parent_id,
    name: r.name,
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    createdBy: r.created_by,
  };
}

function throwError(code: 'NotFound' | 'Forbidden', message: string): never {
  const err = new Error(message) as Error & { code: string };
  err.code = code;
  throw err;
}
