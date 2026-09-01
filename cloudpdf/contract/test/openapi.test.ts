import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { EngineErrorPayloadSchema, wirePaths, wireTemplates } from '@embedpdf/engine-core/wire';

import { adminOperations, adminWirePaths, allOperations, docOperations } from '../src/index';
import { buildAdminOpenApiDocument, sdkOperationName } from '../src/openapi';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};

describe('operation registry', () => {
  test('operationIds equal their registry keys and are unique across all surfaces', () => {
    const ids = Object.entries(allOperations).map(([key, op]) => {
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
          op.path.startsWith('/v1/deployment/') ||
          op.path === adminWirePaths.shareSessions,
        op.path,
      ).toBe(true);
      if (op.credentials.length === 0) {
        // The PUBLIC surface is exactly the share-session exchange: the
        // grant row is the authorization, so no bearer credential
        // exists. Any new unauthenticated operation must be added here
        // deliberately — an empty credential list anywhere else is a
        // registry mistake, not a new feature.
        expect(op.path, `${op.operationId} must not be unauthenticated`).toBe(
          adminWirePaths.shareSessions,
        );
        expect(op.scope.length).toBe(0);
        continue;
      }
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

  test('doc-plane operations follow the doc-surface rules', () => {
    const entries = Object.values(docOperations);
    expect(entries.length).toBeGreaterThan(0);
    for (const op of entries) {
      // Doc plane lives under /v1/docs and never under the admin surfaces.
      expect(op.path.startsWith('/v1/docs/:docId'), op.path).toBe(true);
      // Credentials: API token plus doc JWTs; never tenant JWTs (the
      // spec documents the intended pairing, not the skeleton-key path).
      expect([...op.credentials].sort()).toEqual(['api-token', 'doc-jwt']);
      // No tenant scopes; capabilities carry the doc-jwt authorization.
      expect(op.scope.length).toBe(0);
      expect(op.docCapabilities && op.docCapabilities.length).toBeTruthy();
      // Per-request password supply is documented on every doc operation.
      expect(op.requestHeaders?.some((h) => h.name === 'X-Document-Password')).toBe(true);
      // The viewer protocol stays out: no /v1/access, no @version variants.
      expect(op.path.includes('@')).toBe(false);
      // Success responses are typed: JSON bodies carry a schema (binary
      // responses are exempt — their contentType is the contract).
      for (const [status, response] of Object.entries(op.responses)) {
        const types =
          typeof response.contentType === 'string' ? [response.contentType] : response.contentType;
        if (Number(status) < 400 && types?.includes('application/json')) {
          expect(response.schema, `${op.operationId} ${status} must be typed`).toBeDefined();
        }
        // Doc-plane errors speak the engine envelope, not the admin one.
        if (Number(status) >= 400) {
          expect(response.schema, `${op.operationId} ${status}`).toBe(EngineErrorPayloadSchema);
        }
      }
    }
  });

  test('doc-plane templates are the engine-core statements of those paths', () => {
    // Templates come from engine-core (the wire authority); the builders
    // there produce the same URLs. Pin one representative pair so the
    // template/builder halves of paths.ts cannot drift.
    expect(wirePaths.docHead('doc-abc')).toBe(wireTemplates.docHead.replace(':docId', 'doc-abc'));
    for (const op of Object.values(docOperations)) {
      expect(Object.values(wireTemplates)).toContain(op.path);
    }
    expect(docOperations['doc.annotations.listAll']).toMatchObject({
      method: 'GET',
      path: wireTemplates.layerAnnotationItemsAll,
    });
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
    expect(sub(adminOperations['documents.uploadProxy'].path)).toBe(
      adminWirePaths.documentUploadProxy(tid, id),
    );
    expect(sub(adminOperations['documents.download'].path)).toBe(
      adminWirePaths.documentDownload(tid, id),
    );
    expect(sub(adminOperations['documents.thumbnail'].path)).toBe(
      adminWirePaths.documentThumbnail(tid, id),
    );
    expect(sub(adminOperations['tokens.issue'].path)).toBe(adminWirePaths.tokenIssue(tid));
    expect(sub(adminOperations['tokens.revoke'].path)).toBe(adminWirePaths.tokenRevoke(tid, jti));
    expect(adminOperations['deployment.licenseStatus'].path).toBe(
      adminWirePaths.deploymentLicenseStatus,
    );
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
    const registryIds = Object.keys(allOperations).sort();
    expect(documentIds).toEqual(registryIds);
  });

  test('Fern SDK groups and method names follow the public SDK naming policy', () => {
    const doc = buildAdminOpenApiDocument({ version: pkg.version }) as {
      paths: Record<
        string,
        Record<
          string,
          {
            operationId: string;
            'x-fern-sdk-group-name': string[];
            'x-fern-sdk-method-name': string;
          }
        >
      >;
    };

    for (const operation of Object.values(doc.paths).flatMap((methods) => Object.values(methods))) {
      const parts = operation.operationId.split('.');
      expect(operation['x-fern-sdk-method-name']).toBe(parts.pop());
      expect(operation['x-fern-sdk-group-name']).toEqual(parts);
    }
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

  test('every local schema reference resolves within the OpenAPI document', () => {
    const doc = buildAdminOpenApiDocument({ version: pkg.version });
    const refs: string[] = [];

    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;

      for (const [key, child] of Object.entries(value)) {
        if (key === '$ref' && typeof child === 'string' && child.startsWith('#/')) {
          refs.push(child);
        }
        visit(child);
      }
    };
    visit(doc);

    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) {
      const target = ref
        .slice(2)
        .split('/')
        .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
        .reduce<unknown>((value, segment) => {
          expect(value, `${ref} stops before ${segment}`).toBeTruthy();
          return (value as Record<string, unknown>)[segment];
        }, doc);
      expect(target, ref).toBeDefined();
    }
  });

  test('shared action models remain named components instead of per-location SDK types', () => {
    const doc = buildAdminOpenApiDocument({ version: pkg.version }) as {
      components: { schemas: Record<string, any> };
    };
    const schemas = doc.components.schemas;

    expect(schemas.PdfActionNode.anyOf).toHaveLength(19);
    expect(schemas.PdfActionTree.properties.root).toEqual({
      allOf: [{ $ref: '#/components/schemas/PdfActionNode' }],
      nullable: true,
    });
    expect(
      schemas.DocAnnotationsList200Response.properties.annotations.items.anyOf[0].properties
        .actions,
    ).toEqual({ $ref: '#/components/schemas/PdfAnnotationActions' });
    expect(
      schemas.DocAnnotationsListAll200Response.properties.pages.items.properties.annotations.items
        .anyOf[0].properties.actions,
    ).toEqual({ $ref: '#/components/schemas/PdfAnnotationActions' });
    expect(
      schemas.DocFormsGet200Response.properties.fields.items.anyOf[0].properties.actions,
    ).toEqual({ $ref: '#/components/schemas/PdfFieldActions' });

    const refs: string[] = [];
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(visit);
        return;
      }
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === '$ref' && typeof child === 'string') refs.push(child);
        visit(child);
      }
    };
    visit(doc);
    expect(refs.filter((ref) => ref.includes('/properties/actions'))).toEqual([]);
  });
});

describe('sdkOperationName', () => {
  test('splits resource.method ids into SDK groups and method', () => {
    expect(sdkOperationName('documents.importFrom')).toEqual({
      groups: ['documents'],
      method: 'importFrom',
    });
    expect(sdkOperationName('doc.forms.importData')).toEqual({
      groups: ['doc', 'forms'],
      method: 'importData',
    });
  });

  test('rejects ids without a resource prefix', () => {
    expect(() => sdkOperationName('import')).toThrow(/resource\.method form/);
  });

  test('rejects method segments that are reserved words in a target SDK language', () => {
    // The original documents.import: Java and Python generators escaped it
    // to import_, silently forking the documented surface.
    expect(() => sdkOperationName('documents.import')).toThrow(/reserved word in Java and Python/);
    expect(() => sdkOperationName('documents.yield')).toThrow(/Python and Ruby/);
  });

  test('rejects reserved words in group segments too', () => {
    // Groups become accessor methods (Java client.documents()) and
    // attributes (Python client.documents), so they collide the same way.
    expect(() => sdkOperationName('class.list')).toThrow(/reserved word/);
  });
});
