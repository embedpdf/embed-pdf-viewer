import openapiDocument from '../../../contract/openapi.json';
import snippetDocument from '../generated/sdk-snippets.json';

export type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  nullable?: boolean;
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
};

export type ApiParameter = {
  name: string;
  in: 'path' | 'query' | 'header' | 'cookie';
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
};

export type ApiOperation = {
  operationId: string;
  summary: string;
  description?: string;
  security?: Array<Record<string, string[]>>;
  parameters?: ApiParameter[];
  requestBody?: {
    required?: boolean;
    description?: string;
    content?: Record<string, { schema?: JsonSchema }>;
  };
  responses: Record<
    string,
    { description?: string; content?: Record<string, { schema?: JsonSchema }> }
  >;
  'x-required-scope'?: string[];
  'x-required-capability'?: string[];
  'x-fern-sdk-group-name': string[];
  'x-fern-sdk-method-name': string;
  /** Editorial display name, authored in the contract registry. */
  'x-docs-title': string;
};

export type LocatedOperation = {
  method: string;
  path: string;
  operation: ApiOperation;
};

type Snippet = {
  status: 'available' | 'alternative';
  note?: string;
  source: string;
  /** Lines 1..frameLines are the shared frame (imports + client construction). */
  frameLines: number;
};

export type SdkLanguage = {
  label: string;
  fence: string;
  /** Published package coordinate. */
  pkg: string;
  install: string;
  installFence: string;
  /** Standalone client-construction block (imports + client). */
  frame: string;
};

type SnippetManifest = {
  canonicalVersion: string;
  openapiSha256: string;
  languages: Record<string, SdkLanguage>;
  operations: Record<string, Record<string, Snippet>>;
};

const openapi = openapiDocument as unknown as {
  info: { version: string };
  paths: Record<string, Record<string, unknown>>;
  /** Docs navigation manifest, in sidebar order. Authored in the contract. */
  'x-docs-groups': Record<string, { title: string; slug?: string }>;
  components: {
    schemas: Record<string, JsonSchema>;
    securitySchemes: Record<string, { description?: string; 'x-docs-title'?: string }>;
  };
};

const snippets = snippetDocument as unknown as SnippetManifest;
const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

export function getApiOperation(operationId: string): LocatedOperation {
  for (const [path, pathItem] of Object.entries(openapi.paths)) {
    for (const method of HTTP_METHODS) {
      const candidate = pathItem[method] as ApiOperation | undefined;
      if (candidate?.operationId === operationId) {
        return { method: method.toUpperCase(), path, operation: candidate };
      }
    }
  }
  throw new Error(`Unknown CloudPDF API operation: ${operationId}`);
}

export function getOperationSnippets(operationId: string) {
  const operationSnippets = snippets.operations[operationId];
  if (!operationSnippets) throw new Error(`No SDK snippets for ${operationId}`);

  return Object.entries(snippets.languages).map(([language, config]) => {
    const snippet = operationSnippets[language];
    if (!snippet) throw new Error(`No ${language} SDK snippet for ${operationId}`);
    return { language, ...config, ...snippet };
  });
}

/** The official SDKs, in the order they appear in every language switcher. */
export function getSdkLanguages(): Array<SdkLanguage & { language: string }> {
  return Object.entries(snippets.languages).map(([language, config]) => ({
    language,
    ...config,
  }));
}

export function getApiVersion() {
  if (openapi.info.version !== snippets.canonicalVersion) {
    // Every contract release moves this version, so a plain version bump
    // is the common cause and re-extracting is the whole fix. Only an
    // actual operation change needs the SDKs regenerated first, since
    // the manifest is extracted from their reference.md.
    throw new Error(
      `API reference version mismatch: OpenAPI is ${openapi.info.version}, snippets are ${snippets.canonicalVersion}.\n` +
        `Regenerate the manifest: pnpm --filter @cloudpdf/website api:snippets\n` +
        `If the contract's operations changed, regenerate the SDKs first.`,
    );
  }
  return snippets.canonicalVersion;
}

export function getSecurityScheme(name: string) {
  return openapi.components.securitySchemes[name];
}

/**
 * True when only the deployment API token can call the operation — the
 * contract's own signal that this is operator surface. On managed
 * CloudPDF those operations belong to the platform, so the docs badge
 * them "self-hosted" instead of hiding them.
 */
export function isOperatorOnly(operation: ApiOperation): boolean {
  const credentials = [
    ...new Set((operation.security ?? []).flatMap((alternative) => Object.keys(alternative))),
  ];
  return credentials.length === 1 && credentials[0] === 'apiToken';
}

export type ApiGroup = {
  key: string;
  title: string;
  href: string;
  /** Every operation in the group is operator (API-token-only) surface. */
  operatorOnly: boolean;
  operations: Array<{ operationId: string; title: string; method: string; href: string }>;
};

/** URL segments of a group path, mirroring generate-api-reference.mjs. */
function groupSegments(groups: string[]): string[] {
  return groups.map((name, index) => {
    const entry = openapi['x-docs-groups'][groups.slice(0, index + 1).join('.')];
    return entry?.slug ?? name;
  });
}

function kebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/_/g, '-')
    .toLowerCase();
}

/** Docs route of an operation page, mirroring generate-api-reference.mjs. */
function operationHref(groups: string[], sdkMethod: string): string {
  return `/docs/api-reference/${groupSegments(groups).join('/')}/${kebabCase(sdkMethod)}`;
}

function eachOperation(): Array<{
  operationId: string;
  method: string;
  groups: string[];
  operation: ApiOperation;
}> {
  const found = [];
  for (const pathItem of Object.values(openapi.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method] as ApiOperation | undefined;
      if (!operation) continue;
      found.push({
        operationId: operation.operationId,
        method: method.toUpperCase(),
        groups: operation['x-fern-sdk-group-name'],
        operation,
      });
    }
  }
  return found;
}

/**
 * The reference's resource groups, in contract order, each with its
 * operations. Derived from `x-docs-groups` so a new group in the
 * contract appears on the overview without touching the website.
 */
export function getApiGroups(): ApiGroup[] {
  const operations = eachOperation();
  return Object.entries(openapi['x-docs-groups']).map(([key, entry]) => {
    const parts = key.split('.');
    const members = operations.filter((item) => item.groups.join('.') === key);
    return {
      key,
      title: entry.title,
      href: `/docs/api-reference/${groupSegments(parts).join('/')}`,
      operatorOnly: members.length > 0 && members.every((item) => isOperatorOnly(item.operation)),
      operations: members.map((item) => ({
        operationId: item.operationId,
        title: item.operation['x-docs-title'],
        method: item.method,
        href: operationHref(item.groups, item.operation['x-fern-sdk-method-name']),
      })),
    };
  });
}

export function getOperationCount(): number {
  return eachOperation().length;
}

/**
 * Every doc capability (or tenant scope) with the operations it
 * unlocks. Picking capabilities for a viewer token otherwise means
 * opening twenty operation pages; this is the same data, inverted.
 */
export function getGrantIndex(kind: 'x-required-capability' | 'x-required-scope') {
  const index = new Map<string, Array<{ title: string; href: string; method: string }>>();
  for (const item of eachOperation()) {
    for (const grant of item.operation[kind] ?? []) {
      const list = index.get(grant) ?? [];
      list.push({
        title: item.operation['x-docs-title'],
        href: operationHref(item.groups, item.operation['x-fern-sdk-method-name']),
        method: item.method,
      });
      index.set(grant, list);
    }
  }
  return [...index.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([grant, operations]) => ({ grant, operations }));
}

export function resolveSchema(schema: JsonSchema): { name?: string; schema: JsonSchema } {
  if (!schema.$ref) return { schema };
  const name = schema.$ref.split('/').at(-1);
  const resolved = name ? openapi.components.schemas[name] : undefined;
  return { name, schema: resolved ?? schema };
}

export function schemaType(schema?: JsonSchema): string {
  if (!schema) return 'unknown';
  if (schema.$ref) return schema.$ref.split('/').at(-1) ?? 'object';
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');
  if (schema.oneOf) return schema.oneOf.map(schemaType).join(' | ');
  if (schema.anyOf) return schema.anyOf.map(schemaType).join(' | ');
  if (schema.allOf) return schema.allOf.map(schemaType).join(' & ');
  if (schema.type === 'array') return `${schemaType(schema.items)}[]`;

  const type = Array.isArray(schema.type) ? schema.type.join(' | ') : (schema.type ?? 'object');
  return schema.format ? `${type}<${schema.format}>` : type;
}
