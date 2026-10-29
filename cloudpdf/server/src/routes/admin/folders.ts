import {
  FolderCreateRequestSchema,
  FolderListQuerySchema,
  FolderMoveIntoRequestSchema,
  FolderUpdateRequestSchema,
  adminOperations,
  type AdminOperation,
} from '@cloudpdf/contract';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { z } from 'zod';

import { decodeSortedListCursor, encodeSortedListCursor } from './_cursor';
import { formatIssues } from './_issues';
import { folderIdOfPlace, placeOfFolderId, ROOT_PLACE } from './_place';
import { requireTenantAccess } from '../../app/jwt-plugin';
import { nameKeyOf } from '../../db/names';
import type { FolderRow } from '../../db/repos/folders.repo';
import type { FolderService } from '../../services/FolderService';

export interface AdminFoldersRouteDeps {
  folders: FolderService;
}

/**
 * Tenant folder routes, mounted under `/v1/tenants/:tenantId/folders`.
 * The top level is the place `root`; documents move between folders with
 * `folders.moveInto`, the only route that changes where anything is.
 */
export async function registerAdminFoldersRoutes(
  app: FastifyInstance,
  deps: AdminFoldersRouteDeps,
): Promise<void> {
  const { folders } = deps;

  const mount = (
    op: AdminOperation,
    handler: (req: FastifyRequest, reply: FastifyReply) => unknown,
  ): void => {
    app.route({ method: op.method, url: op.path, handler });
  };

  const createOp = adminOperations['folders.create'];
  mount(createOp, async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    const ctx = requireTenantAccess(req, tenantId, createOp.scope);
    const body = parse(FolderCreateRequestSchema, req.body);
    const folder = await folders.create({
      tenantId: ctx.tenantId,
      sub: ctx.sub,
      name: body.name,
      parentId: folderIdOfPlace(body.parentId ?? ROOT_PLACE),
    });
    return reply.send({ folder: folderPublic(folder) });
  });

  const listOp = adminOperations['folders.list'];
  mount(listOp, async (req, reply) => {
    const { tenantId } = req.params as { tenantId: string };
    const ctx = requireTenantAccess(req, tenantId, listOp.scope);
    const { limit, cursor, parentId } = parse(FolderListQuerySchema, req.query ?? {});
    const after =
      cursor === undefined
        ? undefined
        : decodeSortedListCursor(cursor, { sort: 'name', order: 'asc', keyType: 'string' });

    // limit+1 probes for a next page without a count query.
    const rows = await folders.list(ctx.tenantId, {
      limit: limit + 1,
      parentId: parentId === undefined ? undefined : folderIdOfPlace(parentId),
      ...(after ? { after: { key: after.key as string, id: after.id } } : {}),
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    const nextCursor =
      rows.length > limit && last
        ? encodeSortedListCursor({
            sort: 'name',
            order: 'asc',
            key: nameKeyOf(last.name),
            id: last.id,
          })
        : null;
    return reply.send({ folders: page.map(folderPublic), nextCursor });
  });

  const getOp = adminOperations['folders.get'];
  mount(getOp, async (req, reply) => {
    const { tenantId, folderId } = req.params as { tenantId: string; folderId: string };
    const ctx = requireTenantAccess(req, tenantId, getOp.scope);
    const { folder, path } = await folders.get(ctx.tenantId, folderId);
    return reply.send({ folder: folderPublic(folder), path });
  });

  const updateOp = adminOperations['folders.update'];
  mount(updateOp, async (req, reply) => {
    const { tenantId, folderId } = req.params as { tenantId: string; folderId: string };
    const ctx = requireTenantAccess(req, tenantId, updateOp.scope);
    const body = parse(FolderUpdateRequestSchema, req.body);
    const folder = await folders.rename(ctx.tenantId, folderId, body.name);
    return reply.send({ folder: folderPublic(folder) });
  });

  const moveIntoOp = adminOperations['folders.moveInto'];
  mount(moveIntoOp, async (req, reply) => {
    const { tenantId, folderId } = req.params as { tenantId: string; folderId: string };
    const ctx = requireTenantAccess(req, tenantId, moveIntoOp.scope);
    const body = parse(FolderMoveIntoRequestSchema, req.body);
    await folders.moveInto(ctx.tenantId, folderIdOfPlace(folderId), {
      documentIds: body.documentIds ?? [],
      folderIds: body.folderIds ?? [],
    });
    return reply.code(204).send();
  });

  const deleteOp = adminOperations['folders.delete'];
  mount(deleteOp, async (req, reply) => {
    const { tenantId, folderId } = req.params as { tenantId: string; folderId: string };
    const ctx = requireTenantAccess(req, tenantId, deleteOp.scope);
    await folders.delete(ctx.tenantId, folderId);
    return reply.code(204).send();
  });
}

function folderPublic(folder: FolderRow): Record<string, unknown> {
  return {
    id: folder.id,
    tenantId: folder.tenantId,
    parentId: placeOfFolderId(folder.parentId),
    name: folder.name,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
    createdBy: folder.createdBy,
  };
}

function parse<Schema extends z.ZodTypeAny>(schema: Schema, input: unknown): z.infer<Schema> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const err = new Error(formatIssues(result.error.issues)) as Error & {
      code: string;
      status: number;
    };
    err.code = 'InvalidArg';
    err.status = 400;
    throw err;
  }
  return result.data;
}
