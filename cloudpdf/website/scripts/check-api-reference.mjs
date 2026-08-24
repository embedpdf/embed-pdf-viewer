#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import {
  collectOperations,
  LANGUAGE_NAMES,
  readOpenApi,
  repositoryRootFrom,
} from './sdk-snippets.mjs';

const repositoryRoot = repositoryRootFrom(import.meta.url);
const openapiPath = `${repositoryRoot}/cloudpdf/contract/openapi.json`;
const manifestPath = `${repositoryRoot}/cloudpdf/website/src/generated/sdk-snippets.json`;
const openapi = readOpenApi(repositoryRoot);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const operations = collectOperations(openapi);
const failures = [];

if (manifest.canonicalVersion !== openapi.info.version) {
  failures.push(
    `Version mismatch: OpenAPI is ${openapi.info.version}, snippets are ${manifest.canonicalVersion}`,
  );
}

const openapiSha256 = createHash('sha256').update(readFileSync(openapiPath)).digest('hex');
if (manifest.openapiSha256 !== openapiSha256) {
  failures.push('The snippet manifest was generated from a different OpenAPI document.');
}

const expectedOperationIds = new Set(operations.map((operation) => operation.operationId));
for (const operationId of expectedOperationIds) {
  for (const language of LANGUAGE_NAMES) {
    const snippet = manifest.operations?.[operationId]?.[language];
    if (!snippet?.source?.trim()) failures.push(`Missing snippet: ${operationId}:${language}`);
  }
}
for (const operationId of Object.keys(manifest.operations ?? {})) {
  if (!expectedOperationIds.has(operationId))
    failures.push(`Unknown snippet operation: ${operationId}`);
}

failures.push(...unrenderableSchemas(openapi));

if (failures.length) {
  console.error(
    `API reference manifest validation failed:\n${failures.map((value) => `- ${value}`).join('\n')}`,
  );
  console.error(
    'Run `pnpm api:sync` from the repository root to regenerate stale SDKs and rebuild the manifest.',
  );
  process.exit(1);
}

console.log(
  `API reference manifest is valid (${operations.length} operations × ${LANGUAGE_NAMES.length} SDKs).`,
);

console.log(
  'Every documented schema renders: refs resolve, unions are labelled, objects have fields.',
);

/**
 * The reference renders whatever the contract emits, so a schema the page
 * cannot show becomes a silent hole rather than a build failure — `source`
 * shipped as `object | object` with nothing under it. These are the three
 * shapes that produce a dead end, checked here as a property of the
 * CONTRACT so that a new one fails the build instead of the reader:
 *
 *   - a `$ref` that resolves to nothing;
 *   - a union of objects with no property pinned to a distinct literal in
 *     every branch, leaving the variants nameable only as "Option 1";
 *   - an object with no properties, no union, and no `additionalProperties`,
 *     which renders as the bare word `object`.
 *
 * The resolver mirrors src/lib/api-reference.ts — deliberately a second
 * implementation, so this asserts the contract rather than the renderer.
 */
function unrenderableSchemas(document) {
  const problems = [];
  const visited = new Set();

  const resolve = (schema) => {
    if (!schema?.$ref) return schema;
    if (!schema.$ref.startsWith('#/')) return undefined;
    let node = document;
    for (const segment of schema.$ref.slice(2).split('/')) {
      const key = segment.replaceAll('~1', '/').replaceAll('~0', '~');
      node = Array.isArray(node) ? node[Number(key)] : node?.[key];
      if (node === undefined) return undefined;
    }
    return node;
  };

  const literalOf = (schema) => {
    if (schema?.const !== undefined) return String(schema.const);
    if (Array.isArray(schema?.enum) && schema.enum.length === 1) return String(schema.enum[0]);
    return undefined;
  };

  /** Mirrors unionDiscriminator(): one property, a distinct literal per branch. */
  const isLabelled = (variants) => {
    const pinned = variants.map((variant) => {
      const properties = resolve(variant)?.properties ?? {};
      return new Map(
        Object.entries(properties).flatMap(([name, property]) => {
          const literal = literalOf(property);
          return literal === undefined ? [] : [[name, literal]];
        }),
      );
    });
    return [...pinned[0].keys()].some((property) => {
      if (!pinned.every((branch) => branch.has(property))) return false;
      const values = pinned.map((branch) => branch.get(property));
      return new Set(values).size === values.length;
    });
  };

  const walk = (schema, where) => {
    if (!schema || typeof schema !== 'object') return;

    if (schema.$ref) {
      const target = resolve(schema);
      if (!target) {
        problems.push(`${where}: $ref does not resolve (${schema.$ref})`);
        return;
      }
      if (visited.has(schema.$ref)) return;
      visited.add(schema.$ref);
      walk(target, where);
      return;
    }

    const variants = schema.oneOf ?? schema.anyOf;
    if (variants) {
      const structured = variants.filter((variant) => resolve(variant)?.properties);
      if (structured.length > 1 && !isLabelled(variants)) {
        problems.push(
          `${where}: union of ${variants.length} object variants has no discriminating literal ` +
            `- the reference can only label them "Option 1", "Option 2", ...`,
        );
      }
      variants.forEach((variant, index) => walk(variant, `${where}/${index}`));
      return;
    }

    if (schema.allOf) {
      schema.allOf.forEach((member, index) => walk(member, `${where}&${index}`));
      return;
    }

    if (Array.isArray(schema.items)) {
      schema.items.forEach((item, index) => walk(item, `${where}[${index}]`));
      return;
    }
    if (schema.items) {
      walk(schema.items, `${where}[]`);
      return;
    }

    if (schema.properties) {
      for (const [name, property] of Object.entries(schema.properties)) {
        walk(property, `${where}.${name}`);
      }
      return;
    }

    // An open schema (`z.unknown()`, or the recursion back-edge the emitter
    // substitutes for a self-reference) is honest surface: it renders as
    // `unknown` and promises nothing. An object that declares itself an
    // object and then carries nothing is the dead end.
    const valueMap =
      schema.additionalProperties !== undefined && schema.additionalProperties !== false;
    if (schema.type === 'object' && !valueMap) {
      problems.push(`${where}: renders as a bare "object" - no properties, union, or value map`);
    }
  };

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (!operation?.operationId) continue;
      const at = `${operation.operationId} (${method.toUpperCase()} ${path})`;
      for (const parameter of operation.parameters ?? []) {
        walk(parameter.schema, `${at} parameter ${parameter.name}`);
      }
      for (const [type, media] of Object.entries(operation.requestBody?.content ?? {})) {
        walk(media.schema, `${at} request ${type}`);
      }
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        for (const [type, media] of Object.entries(response.content ?? {})) {
          walk(media.schema, `${at} ${status} ${type}`);
        }
      }
    }
  }

  return problems;
}
