import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { adminOperations, adminWirePaths } from '../src/index';
import { buildAdminOpenApiDocument } from '../src/openapi';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

describe('operation registry', () => {
  test('operationIds equal their registry keys and are unique', () => {
    const ids = Object.entries(adminOperations).map(([key, op]) => {
      expect(op.operationId).toBe(key);
      return op.operationId;
    });
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('every operation lives on a known surface with a coherent credential set', () => {
    for (const op of Object.values(adminOperations)) {
      expect(
        op.path === '/v1/tenants' ||
          op.path.startsWith('/v1/tenants/') ||
          op.path.startsWith('/v1/deployment/'),
        op.path,
      ).toBe(true);
      expect(op.credentials.length).toBeGreaterThan(0);
      if (op.credentials.includes('tenant-jwt')) {
        // Scope governs the tenant-jwt path, so it must exist there…
        expect(op.scope.length).toBeGreaterThan(0);
        // …and tenant-jwt operations must live under a tenant subtree.
        expect(op.path.startsWith('/v1/tenants/:tenantId/')).toBe(true);
      } else {
        // API-token-only operations have no scope model.
        expect(op.scope.length).toBe(0);
      }
    }
  });

  test('path templates agree with the adminWirePaths builders', () => {
    // The builders produce concrete client URLs; the templates are the
    // server/OpenAPI representation. This pins them together so neither
    // can drift without failing CI.
    const tid = 'tenant-abc_123';
    const id = 'doc-abc_123';
    const jti = 'jti-abc_123';
    const sub = (template: string): string =>
      template
        .replace(':tenantId', encodeURIComponent(tid))
        .replace(':id', encodeURIComponent(id))
        .replace(':jti', encodeURIComponent(jti));

    expect(sub(adminOperations['documents.init'].path)).toBe(adminWirePaths.documentsInit(tid));
    expect(sub(adminOperations['documents.list'].path)).toBe(adminWirePaths.documents(tid));
    expect(sub(adminOperations['documents.get'].path)).toBe(adminWirePaths.document(tid, id));
    expect(sub(adminOperations['documents.delete'].path)).toBe(adminWirePaths.document(tid, id));
    expect(sub(adminOperations['documents.commit'].path)).toBe(
      adminWirePaths.documentCommit(tid, id),
    );
    expect(sub(adminOperations['documents.uploadDirect'].path)).toBe(
      adminWirePaths.documentUploadDirect(tid, id),
    );
    expect(sub(adminOperations['documents.download'].path)).toBe(
      adminWirePaths.documentDownload(tid, id),
    );
    expect(sub(adminOperations['documents.thumbnail'].path)).toBe(
      adminWirePaths.documentThumbnail(tid, id),
    );
    expect(sub(adminOperations['tokens.revoke'].path)).toBe(adminWirePaths.tokenRevoke(tid, jti));
    expect(adminOperations['license.status'].path).toBe(adminWirePaths.deploymentLicenseStatus);
    expect(adminOperations['tenants.create'].path).toBe(adminWirePaths.tenants);
    expect(adminOperations['tenants.list'].path).toBe(adminWirePaths.tenants);
    expect(sub(adminOperations['tenants.get'].path)).toBe(adminWirePaths.tenant(tid));
    expect(sub(adminOperations['tenants.delete'].path)).toBe(adminWirePaths.tenant(tid));
  });
});

describe('openapi document', () => {
  test('committed openapi.json matches the registry (run `pnpm emit:openapi` after contract changes)', () => {
    const committed = JSON.parse(
      readFileSync(new URL('../openapi.json', import.meta.url), 'utf8'),
    ) as unknown;
    const generated = buildAdminOpenApiDocument({ version: pkg.version });
    expect(committed).toEqual(generated);
  });

  test('every registry operation appears exactly once in the document', () => {
    const doc = buildAdminOpenApiDocument({ version: pkg.version }) as {
      paths: Record<string, Record<string, { operationId: string }>>;
    };
    const documentIds = Object.values(doc.paths)
      .flatMap((methods) => Object.values(methods))
      .map((op) => op.operationId)
      .sort();
    const registryIds = Object.keys(adminOperations).sort();
    expect(documentIds).toEqual(registryIds);
  });

  test('query parameter schemas are unwrapped value shapes, not anyOf unions', () => {
    const doc = buildAdminOpenApiDocument({ version: pkg.version }) as {
      paths: Record<string, { get?: { parameters?: Array<{ schema: Record<string, unknown> }> } }>;
    };
    const params = doc.paths['/v1/tenants/{tenantId}/documents']!.get!.parameters!.filter(
      (p) => (p as { in?: string }).in === 'query',
    );
    for (const param of params) {
      expect(param.schema['anyOf']).toBeUndefined();
      expect(param.schema['type']).toBeDefined();
    }
  });
});
