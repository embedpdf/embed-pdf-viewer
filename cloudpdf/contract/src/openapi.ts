/**
 * OpenAPI 3.1 emitter for the backend-callable operation registry.
 *
 * The registry (`allOperations`) is the contract; this module is a
 * pure projection of it — no hand-authored paths, schemas, or scopes.
 * `scripts/emit-openapi.mjs` writes the committed `openapi.json`, and
 * the freshness test fails CI whenever the two diverge. Downstream
 * consumers (Fern SDK generation, API reference docs) read the
 * committed artifact, never this module.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';
import { EngineErrorPayloadSchema } from '@embedpdf/engine-core/wire';

import {
  AdminErrorPayloadSchema,
  allOperations,
  docsGroups,
  type AdminCredential,
  type AdminOperation,
  type AdminOperationBody,
  type AdminOperationResponse,
} from './index';

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  204: 'No content',
  400: 'Bad request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not found',
  409: 'Conflict',
  410: 'Gone',
  422: 'Unprocessable',
};

const SECURITY_SCHEME: Record<AdminCredential, string> = {
  'api-token': 'apiToken',
  'tenant-jwt': 'tenantToken',
  'doc-jwt': 'docToken',
};

const ADMIN_ERROR_REF = '#/components/schemas/AdminErrorPayload';
const ENGINE_ERROR_REF = '#/components/schemas/EngineErrorPayload';

export interface BuildAdminOpenApiOptions {
  /** Package version stamped into `info.version`; keeps the emitter pure. */
  version: string;
}

export function buildAdminOpenApiDocument(opts: BuildAdminOpenApiOptions): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const schemas: Record<string, Record<string, unknown>> = {};

  registerSchema(schemas, 'AdminErrorPayload', AdminErrorPayloadSchema);
  registerSchema(schemas, 'EngineErrorPayload', EngineErrorPayloadSchema);

  for (const op of Object.values(allOperations) as AdminOperation[]) {
    assertDocsGroupsCover(op);
    const openApiPath = toOpenApiPath(op.path);
    const method = op.method.toLowerCase();
    const entry = (paths[openApiPath] ??= {});
    entry[method] = operationObject(op, schemas);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'CloudPDF Engine API',
      version: opts.version,
      description:
        'The backend-callable surface of the CloudPDF document engine: deployment and ' +
        'tenant administration plus the document operations (reads, annotations, forms, ' +
        'page operations, redaction, download). Interactive viewing goes through the ' +
        'CloudPDF viewer SDKs, whose session protocol is deliberately not part of this ' +
        'API. Generated from the @cloudpdf/contract operation registry — do not edit by hand.',
      license: { name: 'Apache-2.0', identifier: 'Apache-2.0' },
    },
    paths: sortKeys(paths),
    // Docs navigation manifest: section titles and URL slugs for the API
    // reference, in sidebar order (see `docsGroups` in the registry).
    'x-docs-groups': docsGroups,
    components: {
      securitySchemes: {
        apiToken: {
          type: 'http',
          scheme: 'bearer',
          'x-docs-title': 'API token',
          description:
            "The deployment's static root credential (CLOUDPDF_API_AUTH_TOKENS), valid on every surface.",
        },
        tenantToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          'x-docs-title': 'Tenant token',
          description:
            "Delegated tenant JWT, valid only under its own /v1/tenants/{tenantId}/ subtree — the path tenant must equal the token's tenant_id. Doc-scoped viewer tokens are rejected on every admin route.",
        },
        docToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          'x-docs-title': 'Document token',
          description:
            'Doc-scoped JWT, valid only on the /v1/docs/{docId} subtree it names, gated by ' +
            "the capability scopes it carries (each operation's x-required-capability).",
        },
      },
      schemas,
    },
  };
}

/**
 * Every prefix of an operation's group path must have a `docsGroups`
 * entry — the docs sidebar needs a title and slug for each level. This
 * is the moment a new group becomes part of API design, not a website
 * build failure three packages later.
 */
function assertDocsGroupsCover(op: AdminOperation): void {
  const { groups } = sdkOperationName(op.operationId);
  for (let depth = 1; depth <= groups.length; depth += 1) {
    const key = groups.slice(0, depth).join('.');
    if (!(key in docsGroups)) {
      throw new Error(`Operation ${op.operationId} has no docsGroups entry for "${key}"`);
    }
  }
}

function operationObject(
  op: AdminOperation,
  schemas: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const parameters = [...pathParameters(op), ...queryParameters(op), ...headerParameters(op)];
  const sdkName = sdkOperationName(op.operationId);
  const out: Record<string, unknown> = {
    operationId: op.operationId,
    'x-fern-sdk-group-name': sdkName.groups,
    'x-fern-sdk-method-name': sdkName.method,
    'x-docs-title': op.title,
    summary: op.summary,
    ...(op.notes ? { description: op.notes } : {}),
    security: op.credentials.map((credential) => ({ [SECURITY_SCHEME[credential]]: [] })),
    'x-required-scope': [...op.scope],
    ...(op.docCapabilities ? { 'x-required-capability': [...op.docCapabilities] } : {}),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(op.body ? { requestBody: requestBody(op, op.body, schemas) } : {}),
    responses: responses(op, schemas),
  };
  return out;
}

function sdkOperationName(operationId: string): { groups: string[]; method: string } {
  const parts = operationId.split('.');
  const method = parts.pop();
  if (!method || parts.length === 0) {
    throw new Error(`Operation ID must use resource.method form: ${operationId}`);
  }
  return { groups: parts, method };
}

function headerParameters(op: AdminOperation): Array<Record<string, unknown>> {
  if (!op.requestHeaders) return [];
  return op.requestHeaders.map((header) => ({
    name: header.name,
    in: 'header',
    required: header.required ?? false,
    description: header.description,
    schema: { type: 'string' },
  }));
}

function pathParameters(op: AdminOperation): Array<Record<string, unknown>> {
  const names = [...op.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]!);
  const shape = op.params ? objectShape(op.params) : {};
  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: shape[name] ? inlineSchemaOf(shape[name]!) : { type: 'string' },
  }));
}

function queryParameters(op: AdminOperation): Array<Record<string, unknown>> {
  if (!op.query) return [];
  return Object.entries(objectShape(op.query)).map(([name, prop]) => ({
    name,
    in: 'query',
    required: !prop.isOptional(),
    // Optionality is carried by `required` above; strip the ZodOptional
    // wrapper so the schema describes the value's shape rather than
    // `T | undefined` (which converts to a meaningless anyOf/not).
    schema: inlineSchemaOf(unwrapOptional(prop)),
  }));
}

function unwrapOptional(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  while (current instanceof z.ZodOptional) current = current.unwrap() as z.ZodTypeAny;
  return current;
}

function requestBody(
  op: AdminOperation,
  body: AdminOperationBody,
  schemas: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const schema = body.schema
    ? registerSchema(schemas, `${sdkTypeName(op.operationId)}Request`, body.schema)
    : undefined;
  return {
    required: body.required ?? true,
    content: contentObject(body.contentType, schema),
  };
}

function responses(
  op: AdminOperation,
  schemas: Record<string, Record<string, unknown>>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const typedResponses = Object.values(op.responses).filter((response) => response.schema).length;
  for (const [status, response] of Object.entries(op.responses) as Array<
    [string, AdminOperationResponse]
  >) {
    const schema = response.schema
      ? registerSchema(
          schemas,
          `${sdkTypeName(op.operationId)}${typedResponses > 1 ? status : ''}Response`,
          response.schema,
        )
      : undefined;
    out[status] = {
      description: STATUS_TEXT[Number(status)] ?? 'Response',
      ...(response.contentType ? { content: contentObject(response.contentType, schema) } : {}),
    };
  }
  // Every operation can additionally fail with its plane's standard
  // error envelope (401 from the auth hook, 403 from scope/capability
  // checks, licensing 403s, 5xx). Admin surfaces speak the admin
  // envelope; the doc plane speaks the engine's.
  out['default'] = {
    description: 'Error',
    content: {
      'application/json': {
        schema: { $ref: op.credentials.includes('doc-jwt') ? ENGINE_ERROR_REF : ADMIN_ERROR_REF },
      },
    },
  };
  return out;
}

function contentObject(
  contentType: string | ReadonlyArray<string>,
  schema?: Record<string, unknown>,
): Record<string, unknown> {
  const types = typeof contentType === 'string' ? [contentType] : contentType;
  return Object.fromEntries(types.map((t) => [t, mediaObject(t, schema)]));
}

function mediaObject(
  contentType: string,
  schema?: Record<string, unknown>,
): Record<string, unknown> {
  if (schema) return { schema };
  if (contentType === 'multipart/form-data') {
    return {
      schema: {
        type: 'object',
        properties: { file: { type: 'string', format: 'binary' } },
        required: ['file'],
      },
    };
  }
  return { schema: { type: 'string', format: 'binary' } };
}

function registerSchema(
  schemas: Record<string, Record<string, unknown>>,
  name: string,
  schema: z.ZodTypeAny,
): Record<string, unknown> {
  if (schemas[name]) throw new Error(`Duplicate OpenAPI schema name: ${name}`);
  const componentPath = ['components', 'schemas', name];
  const referenced = zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'root',
    basePath: ['#', ...componentPath],
  }) as Record<string, unknown>;
  // Fern's OpenAPI importer currently expands property-level recursive refs
  // until it exhausts the Node heap. Preserve every ordinary reuse ref and
  // replace only the recursive back-edge with the same valid open schema (`{}`)
  // that zod-to-json-schema uses for its non-reference strategy.
  schemas[name] = breakAncestorReferences(referenced, componentPath) as Record<string, unknown>;
  return { $ref: `#/components/schemas/${name}` };
}

function breakAncestorReferences(value: unknown, path: string[]): unknown {
  if (Array.isArray(value)) {
    return value.map((child, index) => breakAncestorReferences(child, [...path, String(index)]));
  }
  if (!value || typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  if (typeof record.$ref === 'string' && record.$ref.startsWith('#/')) {
    const target = record.$ref
      .slice(2)
      .split('/')
      .map((segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~'));
    if (target.length <= path.length && target.every((segment, index) => path[index] === segment)) {
      return {};
    }
  }

  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      breakAncestorReferences(child, [...path, key]),
    ]),
  );
}

function inlineSchemaOf(schema: z.ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
}

function sdkTypeName(operationId: string): string {
  return operationId
    .split('.')
    .map((part) => `${part[0]!.toUpperCase()}${part.slice(1)}`)
    .join('');
}

function objectShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  if (schema instanceof z.ZodObject) {
    return schema.shape as Record<string, z.ZodTypeAny>;
  }
  return {};
}

function toOpenApiPath(template: string): string {
  return template.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

function sortKeys<T>(obj: Record<string, T>): Record<string, T> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}
