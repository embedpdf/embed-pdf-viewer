import openapiDocument from '../../../contract/openapi.json';
import snippetDocument from '../generated/sdk-snippets.json';

import { applyInstallChannel } from '@embedpdf/docs-kit/mdx/install-channel';

export type JsonSchema = {
  $ref?: string;
  type?: string | string[];
  format?: string;
  description?: string;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  nullable?: boolean;
  /** An array's element schema, or its positional schemas when it is a tuple. */
  items?: JsonSchema | JsonSchema[];
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
    // The npm SDK rides the same release channel as the docs' other install
    // commands (`@cloudpdf/sdk`'s `latest` is a 0.0.0 placeholder until GA).
    // Non-npm ecosystems keep their manifest-recorded commands.
    install: applyInstallChannel(config.install),
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

/**
 * A `$ref` target. Reused sub-schemas are emitted as pointers INTO the
 * component that first declared them (`.../DocAnnotationsList200Response/
 * properties/annotations/items/anyOf/0/properties/color`), so resolving only
 * `#/components/schemas/{name}` left several hundred refs unresolved — they
 * rendered as their last path segment with no fields beneath it.
 */
function pointerTarget(ref: string): JsonSchema | undefined {
  if (!ref.startsWith('#/')) return undefined;
  let node: unknown = openapi;
  for (const segment of ref.slice(2).split('/')) {
    const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
    if (Array.isArray(node)) node = node[Number(key)];
    else if (node && typeof node === 'object') node = (node as Record<string, unknown>)[key];
    else return undefined;
  }
  return node && typeof node === 'object' ? (node as JsonSchema) : undefined;
}

/** The schema name of a component ref — undefined for a pointer into one. */
function componentName(ref: string): string | undefined {
  return /^#\/components\/schemas\/([^/]+)$/.exec(ref)?.[1];
}

export function resolveSchema(schema: JsonSchema): { name?: string; schema: JsonSchema } {
  if (!schema.$ref) return { schema };
  return { name: componentName(schema.$ref), schema: pointerTarget(schema.$ref) ?? schema };
}

/**
 * The schema a field really shows: past its `$ref`, and past one array
 * wrapper, since a list of X documents as the fields of X.
 */
export function unwrapSchema(schema?: JsonSchema): JsonSchema | undefined {
  if (!schema) return undefined;
  const resolved = resolveSchema(schema).schema;
  if (resolved.type === 'array' && resolved.items && !Array.isArray(resolved.items)) {
    return resolveSchema(resolved.items).schema;
  }
  return resolved;
}

/**
 * The branches of a union worth showing as separate shapes — empty for
 * everything else. A union of scalars (`"*" | "docs.read" | ...`) or of
 * tuples is already fully described by its type string, so only unions with
 * at least one structured branch earn variant tabs.
 */
export function unionVariants(schema?: JsonSchema): JsonSchema[] {
  const resolved = unwrapSchema(schema);
  const variants = resolved?.oneOf ?? resolved?.anyOf ?? [];
  return variants.some((variant) => resolveSchema(variant).schema.properties) ? variants : [];
}

/** Object properties, unwrapping a `$ref` and/or an array wrapper on the way. */
export function schemaFields(schema?: JsonSchema): Array<{
  name: string;
  schema: JsonSchema;
  required: boolean;
  description?: string;
}> {
  const resolved = unwrapSchema(schema);
  return Object.entries(resolved?.properties ?? {}).map(([name, property]) => ({
    name,
    schema: property,
    required: (resolved?.required ?? []).includes(name),
    description: property.description,
  }));
}

/** The literal a schema pins, when it pins exactly one. */
function literalOf(schema: JsonSchema): string | undefined {
  if (schema.const !== undefined) return String(schema.const);
  if (schema.enum?.length === 1) return String(schema.enum[0]);
  return undefined;
}

/**
 * The property every branch of a union pins to a DIFFERENT literal — computed
 * across the branches rather than per branch, because a branch can pin more
 * than one: three of the nineteen annotation variants pin `intent` as well as
 * `subtype`, and labelling each branch by its own first literal mixed the two
 * vocabularies (`highlight`, `underline`, `ink-highlight`, ...).
 */
export function unionDiscriminator(
  variants: JsonSchema[],
): { property: string; values: string[] } | undefined {
  if (variants.length < 2) return undefined;
  const pinned = variants.map((variant) => {
    const properties = resolveSchema(variant).schema.properties ?? {};
    return new Map(
      Object.entries(properties).flatMap(([name, property]) => {
        const literal = literalOf(property);
        return literal === undefined ? [] : [[name, literal] as const];
      }),
    );
  });

  for (const property of pinned[0].keys()) {
    if (!pinned.every((branch) => branch.has(property))) continue;
    const values = pinned.map((branch) => branch.get(property)!);
    if (new Set(values).size === values.length) return { property, values };
  }
  return undefined;
}

/** Display labels for a union's branches, in branch order. */
export function variantLabels(variants: JsonSchema[]): string[] {
  const discriminator = unionDiscriminator(variants);
  return variants.map(
    (variant, index) =>
      discriminator?.values[index] ?? resolveSchema(variant).name ?? `Option ${index + 1}`,
  );
}

/** Past this many branches a union prints its count instead of its labels. */
const UNION_SUMMARY_LIMIT = 4;

export function schemaType(schema?: JsonSchema): string {
  return typeString(schema, new Set());
}

function typeString(schema: JsonSchema | undefined, seen: Set<string>): string {
  if (!schema) return 'unknown';
  if (schema.$ref) {
    const name = componentName(schema.$ref);
    if (name) return name;
    // A pointer into a component names a property, not a type — show the
    // shape it points at instead. `seen` guards a pathological cycle.
    if (seen.has(schema.$ref)) return 'object';
    const target = pointerTarget(schema.$ref);
    return target ? typeString(target, new Set([...seen, schema.$ref])) : 'object';
  }
  if (schema.const !== undefined) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((value) => JSON.stringify(value)).join(' | ');

  const variants = schema.oneOf ?? schema.anyOf;
  if (variants) return unionString(variants, seen);
  if (schema.allOf) return schema.allOf.map((member) => typeString(member, seen)).join(' & ');

  if (schema.type === 'array') {
    if (Array.isArray(schema.items)) {
      return `[${schema.items.map((item) => typeString(item, seen)).join(', ')}]`;
    }
    const item = typeString(schema.items, seen);
    // `"a" | "b"[]` reads as a union with an array on the end.
    return /^\d+ variants$/.test(item) || item.includes(' | ') ? `(${item})[]` : `${item}[]`;
  }

  // `z.unknown()` and the recursion back-edge the emitter substitutes for a
  // self-reference both arrive as an open schema. The reference says
  // `unknown` — true, and unlike `object` it does not promise fields.
  if (
    schema.type === undefined &&
    !schema.properties &&
    schema.additionalProperties === undefined
  ) {
    return 'unknown';
  }

  const type = Array.isArray(schema.type) ? schema.type.join(' | ') : (schema.type ?? 'object');
  return schema.format ? `${type}<${schema.format}>` : type;
}

/**
 * A union reads as the choice it offers: a tagged union prints its tag
 * literals (`"url" | "connection"`), a union of enums merges into one enum,
 * anything else falls back to its branch types. Past a handful of branches
 * the list stops being readable and becomes a count — the variant tabs
 * under the row carry the detail.
 */
function unionString(variants: JsonSchema[], seen: Set<string>): string {
  const literals = variants.flatMap((variant) => {
    const resolved = resolveSchema(variant).schema;
    if (resolved.properties) return [];
    if (resolved.const !== undefined) return [JSON.stringify(resolved.const)];
    return (resolved.enum ?? []).map((value) => JSON.stringify(value));
  });
  if (literals.length >= variants.length) return [...new Set(literals)].join(' | ');

  if (variants.length > UNION_SUMMARY_LIMIT) return `${variants.length} variants`;
  const discriminator = unionDiscriminator(variants);
  if (discriminator) return discriminator.values.map((value) => JSON.stringify(value)).join(' | ');
  return variants.map((variant) => typeString(variant, seen)).join(' | ');
}

/**
 * The choice a request body puts to the caller: the union at its root, or
 * the first property that is one. Fern generates a single example per
 * operation and takes the first branch of any union in it, so without this
 * the docs would show one shape of a two-shape body and say nothing about
 * the other.
 */
export function requestBodyChoice(
  operation: ApiOperation,
): { property?: string; variants: JsonSchema[]; labels: string[] } | undefined {
  const schema = jsonBodySchema(operation);
  if (!schema) return undefined;

  const rootVariants = unionVariants(schema);
  if (rootVariants.length > 1) {
    return { variants: rootVariants, labels: variantLabels(rootVariants) };
  }
  for (const field of schemaFields(schema)) {
    const variants = unionVariants(field.schema);
    if (variants.length > 1) {
      return { property: field.name, variants, labels: variantLabels(variants) };
    }
  }
  return undefined;
}

/** A body the reference can show as JSON — `documents.uploadProxy` sends bytes. */
function jsonBodySchema(operation: ApiOperation): JsonSchema | undefined {
  return operation.requestBody?.content?.['application/json']?.schema;
}

/** Guards against a schema that nests further than any real request body. */
const MAX_EXAMPLE_DEPTH = 8;

/**
 * A JSON value standing in for a schema: required fields only (they are
 * what a caller must send), enum and literal values verbatim, and property
 * names as string placeholders — the same convention the generated SDK
 * examples use (`url: "url"`), so the wire example and the SDK example
 * describe one request rather than two.
 */
function exampleValue(schema: JsonSchema | undefined, name: string, depth = 0): unknown {
  const resolved = schema ? resolveSchema(schema).schema : undefined;
  if (!resolved || depth > MAX_EXAMPLE_DEPTH) return null;
  if (resolved.const !== undefined) return resolved.const;
  if (resolved.enum?.length) return resolved.enum[0];

  const variants = resolved.oneOf ?? resolved.anyOf;
  if (variants?.length) return exampleValue(variants[0], name, depth + 1);

  if (resolved.type === 'array') {
    if (Array.isArray(resolved.items)) {
      return resolved.items.map((item) => exampleValue(item, name, depth + 1));
    }
    return [exampleValue(resolved.items, name, depth + 1)];
  }

  if (resolved.properties) {
    const required = new Set(resolved.required ?? []);
    const entries = Object.entries(resolved.properties);
    // An all-optional body would otherwise example as `{}`.
    const shown = required.size ? entries.filter(([key]) => required.has(key)) : entries;
    return Object.fromEntries(shown.map(([key, p]) => [key, exampleValue(p, key, depth + 1)]));
  }

  switch (Array.isArray(resolved.type) ? resolved.type[0] : resolved.type) {
    case 'integer':
    case 'number':
      return 1;
    case 'boolean':
      return true;
    case 'string':
      return name;
    case 'object':
      return {};
    default:
      return null;
  }
}

/** The request body a caller would send, with one branch of `choice` taken. */
export function exampleRequestBody(
  operation: ApiOperation,
  choice?: { property?: string; variant: JsonSchema },
): string {
  const schema = jsonBodySchema(operation);
  if (!schema) return '';
  const body = exampleValue(schema, 'body');
  if (!choice) return JSON.stringify(body, null, 2);
  if (!choice.property) return JSON.stringify(exampleValue(choice.variant, 'body'), null, 2);
  return JSON.stringify(
    {
      ...(body as Record<string, unknown>),
      [choice.property]: exampleValue(choice.variant, choice.property),
    },
    null,
    2,
  );
}
