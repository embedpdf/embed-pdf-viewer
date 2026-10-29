import { randomBytes } from 'node:crypto';

import { sql, type Kysely } from 'kysely';

import { isForeignKeyViolation } from '../db/foreignKeyViolation';
import { DocumentsRepo } from '../db/repos/documents.repo';
import {
  FoldersRepo,
  MAX_FOLDER_DEPTH,
  type FolderListOptions,
  type FolderRow,
} from '../db/repos/folders.repo';
import type { TenantsRepo } from '../db/repos/tenants.repo';
import { nameKeyOf } from '../db/names';
import type { Database as Schema } from '../db/schema';

export interface FolderServiceOptions {
  db: Kysely<Schema>;
  tenants: TenantsRepo;
  /** Provision a missing tenant on its first folder, as uploads do. */
  autoProvisionTenant?: boolean;
  /**
   * Finish, in the background, the deletes a recursive folder delete began.
   * Without it the sweeper finishes them once they are stale.
   */
  finishDeletes?: (tenantId: string, docIds: string[]) => void;
}

export interface MoveIntoInput {
  documentIds: ReadonlyArray<string>;
  folderIds: ReadonlyArray<string>;
}

/** Ids per move, documents and folders together. */
export const MAX_MOVE_IDS = 1000;

/** Tries a recursive delete gets when uploads keep landing in its folders. */
const RECURSIVE_DELETE_ATTEMPTS = 3;

/**
 * A tenant's folder tree: create, rename, move and delete folders, and
 * move documents between them. Every change to a tree runs under that
 * tenant's tree lock, so the checks that span rows (sibling names, loops,
 * depth, emptiness) see the tree the change applies to.
 */
export class FolderService {
  private readonly db: Kysely<Schema>;
  private readonly folders: FoldersRepo;
  private readonly tenants: TenantsRepo;
  private readonly autoProvisionTenant: boolean;
  private readonly finishDeletes?: (tenantId: string, docIds: string[]) => void;

  constructor(opts: FolderServiceOptions) {
    this.db = opts.db;
    this.folders = new FoldersRepo(opts.db);
    this.tenants = opts.tenants;
    this.autoProvisionTenant = opts.autoProvisionTenant ?? false;
    if (opts.finishDeletes) this.finishDeletes = opts.finishDeletes;
  }

  async create(input: {
    tenantId: string;
    sub: string | null;
    name: string;
    parentId: string | null;
  }): Promise<FolderRow> {
    if (this.autoProvisionTenant) {
      await this.tenants.ensure({ id: input.tenantId, autoProvisioned: true });
    }
    return this.withTreeLock(input.tenantId, async ({ folders, tenantExists }) => {
      if (!tenantExists) throw withDetails('NotFound', 404, `tenant not found: ${input.tenantId}`);
      let parentDepth = 0;
      if (input.parentId !== null) {
        await folders.requireOwned(input.parentId, input.tenantId);
        parentDepth = (await folders.ancestorsOf(input.parentId)).length;
      }
      if (parentDepth + 1 > MAX_FOLDER_DEPTH) throw tooDeep();
      await requireNamesFree(folders, input.tenantId, input.parentId, [input.name], new Set());
      return folders.insert({
        id: generateFolderId(),
        tenantId: input.tenantId,
        parentId: input.parentId,
        name: input.name,
        createdBy: input.sub,
      });
    });
  }

  /** Lists by name; a parent folder that does not exist is NotFound, not an empty list. */
  async list(tenantId: string, opts: FolderListOptions): Promise<FolderRow[]> {
    if (opts.parentId) await this.folders.requireOwned(opts.parentId, tenantId);
    return this.folders.listForTenant(tenantId, opts);
  }

  /** The folder and the folders above it, from the top level down. */
  async get(
    tenantId: string,
    folderId: string,
  ): Promise<{ folder: FolderRow; path: Array<{ id: string; name: string }> }> {
    const folder = await this.folders.requireOwned(folderId, tenantId);
    const ancestors = await this.folders.ancestorsOf(folderId);
    return { folder, path: ancestors.slice(1).reverse() };
  }

  async rename(tenantId: string, folderId: string, name: string): Promise<FolderRow> {
    return this.withTreeLock(tenantId, async ({ folders }) => {
      const folder = await folders.requireOwned(folderId, tenantId);
      await requireNamesFree(folders, tenantId, folder.parentId, [name], new Set([folderId]));
      await folders.rename(folderId, name);
      return (await folders.findById(folderId))!;
    });
  }

  /**
   * Move documents and folders into `targetId` (`null`: the top level).
   * Everything moves or nothing does; a folder moves with all it holds,
   * and the documents inside it are not touched.
   */
  async moveInto(tenantId: string, targetId: string | null, input: MoveIntoInput): Promise<void> {
    const documentIds = [...new Set(input.documentIds)];
    const folderIds = [...new Set(input.folderIds)];
    if (documentIds.length + folderIds.length === 0) {
      throw invalidArg('name at least one document or folder to move');
    }
    if (documentIds.length + folderIds.length > MAX_MOVE_IDS) {
      throw invalidArg(`a move takes at most ${MAX_MOVE_IDS} ids`);
    }
    await this.withTreeLock(tenantId, async ({ folders, documents }) => {
      if (targetId !== null) await folders.requireOwned(targetId, tenantId);

      const movableDocuments = new Set(await documents.listMovableIds(tenantId, documentIds));
      const moved = await folders.findOwned(tenantId, folderIds);
      const ownedFolderIds = new Set(moved.map((folder) => folder.id));
      const missingDocumentIds = documentIds.filter((id) => !movableDocuments.has(id));
      const missingFolderIds = folderIds.filter((id) => !ownedFolderIds.has(id));
      if (missingDocumentIds.length > 0 || missingFolderIds.length > 0) {
        throw withDetails(
          'NotFound',
          404,
          'some documents or folders do not exist in this tenant',
          { documentIds: missingDocumentIds, folderIds: missingFolderIds },
        );
      }

      const movedIds = new Set(folderIds);
      const targetPath = targetId === null ? [] : await folders.ancestorsOf(targetId);
      const loop = targetPath.find((ancestor) => movedIds.has(ancestor.id));
      if (loop) {
        throw conflict('cycle', `folder ${loop.id} cannot move into itself or a folder inside it`, {
          folderId: loop.id,
        });
      }
      for (const folder of moved) {
        if (targetPath.length + (await folders.heightOf(folder.id)) > MAX_FOLDER_DEPTH) {
          throw tooDeep();
        }
      }
      await requireNamesFree(
        folders,
        tenantId,
        targetId,
        moved.map((folder) => folder.name),
        movedIds,
      );

      await folders.setParent(folderIds, targetId);
      await documents.moveToFolder(tenantId, documentIds, targetId);
    });
  }

  /**
   * Delete a folder. Without `recursive` only an empty one goes; anything
   * inside it is refused with what it holds. With `recursive`, one
   * transaction removes the folder and every folder under it and begins
   * deleting every document in them, so all of it leaves every list and
   * stops opening at once; their stored files go in the background.
   */
  async delete(tenantId: string, folderId: string, opts: { recursive: boolean }): Promise<void> {
    if (opts.recursive) return this.deleteRecursive(tenantId, folderId);
    try {
      await this.withTreeLock(tenantId, async ({ folders }) => {
        await folders.requireOwned(folderId, tenantId);
        await requireEmpty(folders, tenantId, folderId);
        await folders.delete(folderId);
      });
    } catch (err) {
      // An upload filed a document in the folder after the check.
      if (!isForeignKeyViolation(err)) throw err;
      await requireEmpty(this.folders, tenantId, folderId);
      throw err;
    }
  }

  private async deleteRecursive(tenantId: string, folderId: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        const docIds = await this.withTreeLock(tenantId, async ({ folders, documents }) => {
          await folders.requireOwned(folderId, tenantId);
          const begun = await documents.beginDeleteBelow(tenantId, folderId);
          await folders.deleteBelow(folderId);
          return begun;
        });
        if (docIds.length > 0) this.finishDeletes?.(tenantId, docIds);
        return;
      } catch (err) {
        // An upload filed a document in one of the folders after the
        // documents were marked: start over, and it is marked too.
        if (!isForeignKeyViolation(err) || attempt === RECURSIVE_DELETE_ATTEMPTS) throw err;
      }
    }
  }

  /**
   * Run `body` as the only change to the tenant's tree. On Postgres the
   * no-op write holds the tenant row until commit; it takes no key lock,
   * so uploads, which only reference the row, are not held up. SQLite runs
   * one writer at a time anyway. A tenant without a row has no tree, so
   * the folder checks in `body` answer for it.
   */
  private async withTreeLock<T>(
    tenantId: string,
    body: (scope: {
      folders: FoldersRepo;
      documents: DocumentsRepo;
      tenantExists: boolean;
    }) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction().execute(async (trx) => {
      const locked = await trx
        .updateTable('tenants')
        .set({ name: sql`name` })
        .where('id', '=', tenantId)
        .executeTakeFirst();
      return body({
        folders: new FoldersRepo(trx),
        documents: new DocumentsRepo(trx),
        tenantExists: Number(locked.numUpdatedRows) > 0,
      });
    });
  }
}

/**
 * Refuse names that clash, ignoring case, with each other or with the
 * folders already in `parentId`, apart from the folders in `except`, which
 * are the ones taking these names.
 */
async function requireNamesFree(
  folders: FoldersRepo,
  tenantId: string,
  parentId: string | null,
  names: ReadonlyArray<string>,
  except: ReadonlySet<string>,
): Promise<void> {
  const seen = new Set<string>();
  for (const name of names) {
    const key = nameKeyOf(name);
    if (seen.has(key)) throw nameTaken(name);
    seen.add(key);
  }
  const clash = (await folders.findChildrenNamed(tenantId, parentId, names)).find(
    (folder) => !except.has(folder.id),
  );
  if (clash) throw nameTaken(clash.name);
}

async function requireEmpty(folders: FoldersRepo, tenantId: string, folderId: string) {
  const contents = await folders.contentsOf(tenantId, folderId);
  if (contents.folders > 0 || contents.documents > 0) {
    throw conflict(
      'not-empty',
      `folder ${folderId} holds ${contents.folders} folders and ${contents.documents} documents`,
      contents,
    );
  }
}

function generateFolderId(): string {
  return `fld_${randomBytes(12).toString('hex')}`;
}

function nameTaken(name: string): Error {
  return conflict('name-taken', `a folder named "${name}" is already there`, { name });
}

function tooDeep(): Error {
  return conflict('too-deep', `folders nest at most ${MAX_FOLDER_DEPTH} levels`, {
    maxDepth: MAX_FOLDER_DEPTH,
  });
}

function conflict(reason: string, message: string, details: Record<string, unknown>): Error {
  return withDetails('Conflict', 409, message, { reason, ...details });
}

function invalidArg(message: string): Error {
  return withDetails('InvalidArg', 400, message);
}

function withDetails(
  code: string,
  status: number,
  message: string,
  details?: Record<string, unknown>,
): Error {
  const err = new Error(message) as Error & {
    code: string;
    status: number;
    details?: Record<string, unknown>;
  };
  err.code = code;
  err.status = status;
  if (details) err.details = details;
  return err;
}
