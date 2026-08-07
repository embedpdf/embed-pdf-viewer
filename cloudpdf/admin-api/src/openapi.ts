/**
 * OpenAPI 3.1 emitter for the admin operation registry.
 *
 * The registry (`adminOperations`) is the contract; this module is a
 * pure projection of it — no hand-authored paths, schemas, or scopes.
 * `scripts/emit-openapi.mjs` writes the committed `openapi.json`, and
 * the freshness test fails CI whenever the two diverge. Downstream
 * consumers (Fern SDK generation, API reference docs) read the
 * committed artifact, never this module.
 */

import { zodToJsonSchema } from 'zod-to-json-schema';
import { z } from 'zod';

import {
  AdminErrorPayloadSchema,
  adminOperations,
  type AdminOperation,
  type AdminOperationBody,
  type AdminOperationResponse,
} from './index';

const STATUS_TEXT: Record<number, string> = {
  200: 'OK',
  204: 'No content',
  400: 'Bad request',
  403: 'Forbidden',
  404: 'Not found',
};

const ERROR_REF = '#/components/schemas/AdminErrorPayload';

export interface BuildAdminOpenApiOptions {
  /** Package version stamped into `info.version`; keeps the emitter pure. */
  version: string;
}

export function buildAdminOpenApiDocument(
  opts: BuildAdminOpenApiOptions,
): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};

  for (const op of Object.values(adminOperations) as AdminOperation[]) {
    const openApiPath = toOpenApiPath(op.path);
    const entry = (paths[openApiPath] ??= {});
    entry[op.method.toLowerCase()] = operationObject(op);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'CloudPDF Admin API',
      version: opts.version,
      description:
        'Tenant-scoped admin surface of the CloudPDF document engine. ' +
        'Generated from the @cloudpdf/admin-api operation registry — do not edit by hand.',
      license: { name: 'Apache-2.0', identifier: 'Apache-2.0' },
    },
    paths: sortKeys(paths),
    components: {
      securitySchemes: {
        apiToken: {
          type: 'http',
          scheme: 'bearer',
          description:
            "The deployment's static root credential (CLOUDPDF_API_AUTH_TOKENS), valid on every surface.",
        },
        tenantToken: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            "Delegated tenant JWT, valid only under its own /v1/tenants/{tenantId}/ subtree — the path tenant must equal the token's tenant_id. Doc-scoped viewer tokens are rejected on every admin route.",
        },
      },
      schemas: {
        AdminErrorPayload: schemaOf(AdminErrorPayloadSchema),
      },
    },
  };
}

function operationObject(op: AdminOperation): Record<string, unknown> {
  const parameters = [...pathParameters(op), ...queryParameters(op)];
  const out: Record<string, unknown> = {
    operationId: op.operationId,
    summary: op.summary,
    ...(op.notes ? { description: op.notes } : {}),
    security: op.credentials.map((credential) =>
      credential === 'api-token' ? { apiToken: [] } : { tenantToken: [] },
    ),
    'x-required-scope': [...op.scope],
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(op.body ? { requestBody: requestBody(op.body) } : {}),
    responses: responses(op),
  };
  return out;
}

function pathParameters(op: AdminOperation): Array<Record<string, unknown>> {
  const names = [...op.path.matchAll(/:([A-Za-z0-9_]+)/g)].map((m) => m[1]!);
  const shape = op.params ? objectShape(op.params) : {};
  return names.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: shape[name] ? schemaOf(shape[name]!) : { type: 'string' },
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
    schema: schemaOf(unwrapOptional(prop)),
  }));
}

function unwrapOptional(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  while (current instanceof z.ZodOptional) current = current.unwrap() as z.ZodTypeAny;
  return current;
}

function requestBody(body: AdminOperationBody): Record<string, unknown> {
  return {
    required: body.required ?? true,
    content: contentObject(body.contentType, body.schema),
  };
}

function responses(op: AdminOperation): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [status, response] of Object.entries(op.responses) as Array<
    [string, AdminOperationResponse]
  >) {
    out[status] = {
      description: STATUS_TEXT[Number(status)] ?? 'Response',
      ...(response.contentType
        ? { content: contentObject(response.contentType, response.schema) }
        : {}),
    };
  }
  // Every operation can additionally fail with the standard error
  // envelope (401 from the auth hook, 403 from scope checks, licensing
  // 403s, 5xx). One shared default keeps the registry entries focused
  // on their operation-specific statuses.
  out['default'] = {
    description: 'Error',
    content: { 'application/json': { schema: { $ref: ERROR_REF } } },
  };
  return out;
}

function contentObject(
  contentType: string | ReadonlyArray<string>,
  schema?: z.ZodTypeAny,
): Record<string, unknown> {
  const types = typeof contentType === 'string' ? [contentType] : contentType;
  return Object.fromEntries(types.map((t) => [t, mediaObject(t, schema)]));
}

function mediaObject(contentType: string, schema?: z.ZodTypeAny): Record<string, unknown> {
  if (schema) return { schema: schemaOf(schema) };
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

function schemaOf(schema: z.ZodTypeAny): Record<string, unknown> {
  return zodToJsonSchema(schema, {
    target: 'openApi3',
    $refStrategy: 'none',
  }) as Record<string, unknown>;
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
