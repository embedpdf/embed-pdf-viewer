import type { AstNode } from '@embedpdf/docs-kit';

import {
  getApiGroups,
  getApiOperation,
  getApiVersion,
  getGrantIndex,
  getOperationCount,
  getOperationSnippets,
  getSdkLanguages,
  getSecurityScheme,
  resolveSchema,
  schemaType,
  type ApiParameter,
  type JsonSchema,
} from './api-reference';

/**
 * Markdown projections for the API-reference components — the `.md` export
 * and (later) the search corpus render the SAME data the pages do, from the
 * same lib, so the projection can never claim something the page does not.
 * Wired into the kit's Markdown pipeline via `DocsMarkdownSite.projectComponent`.
 */

/* ---------- tiny mdast builders ---------- */

const text = (value: string): AstNode => ({ type: 'text', value });
const inlineCode = (value: string): AstNode => ({ type: 'inlineCode', value });
const strong = (value: string): AstNode => ({ type: 'strong', children: [text(value)] });
const paragraph = (children: AstNode[]): AstNode => ({ type: 'paragraph', children });
const heading = (depth: number, value: string): AstNode => ({
  type: 'heading',
  depth,
  children: [text(value)],
});
const code = (lang: string, value: string): AstNode => ({ type: 'code', lang, value });
const link = (url: string, label: string): AstNode => ({
  type: 'link',
  url,
  children: [text(label)],
});
const listItem = (children: AstNode[]): AstNode => ({ type: 'listItem', spread: false, children });
const list = (items: AstNode[]): AstNode => ({
  type: 'list',
  ordered: false,
  spread: false,
  children: items,
});
const blockquote = (value: string): AstNode => ({
  type: 'blockquote',
  children: [paragraph([text(value)])],
});

/* ---------- schema fields (mirrors the page's FieldList) ---------- */

const MAX_FIELD_DEPTH = 3;

type Field = {
  name: string;
  schema?: JsonSchema;
  required?: boolean;
  description?: string;
  location?: string;
};

function childFields(schema?: JsonSchema): Field[] {
  if (!schema) return [];
  let resolved = resolveSchema(schema).schema;
  if (resolved.type === 'array' && resolved.items) {
    resolved = resolveSchema(resolved.items).schema;
  }
  return Object.entries(resolved.properties ?? {}).map(([name, property]) => ({
    name,
    schema: property,
    required: (resolved.required ?? []).includes(name),
    description: property.description,
  }));
}

function fieldItem(field: Field, depth: number): AstNode {
  const head: AstNode[] = [inlineCode(field.name), text(` ${schemaType(field.schema)}`)];
  if (field.location) head.push(text(` (${field.location})`));
  if (field.required) head.push(text(' — required'));
  if (field.description) head.push(text(` — ${field.description}`));

  const children: AstNode[] = [paragraph(head)];
  const nested = depth < MAX_FIELD_DEPTH ? childFields(field.schema) : [];
  if (nested.length > 0) {
    children.push(list(nested.map((child) => fieldItem(child, depth + 1))));
  }
  return listItem(children);
}

function schemaNodes(contentType: string, schema: JsonSchema | undefined): AstNode[] {
  const nodes: AstNode[] = [
    paragraph([inlineCode(contentType), text(` — ${schema ? schemaType(schema) : 'empty'}`)]),
  ];
  if (!schema) return nodes;

  const resolved = resolveSchema(schema).schema;
  if (resolved.description) nodes.push(paragraph([text(resolved.description)]));

  const variants = resolved.anyOf ?? resolved.oneOf ?? [];
  if (variants.length > 0) {
    for (const [index, variant] of variants.entries()) {
      const label = resolveSchema(variant).name ?? `Option ${index + 1}`;
      nodes.push(paragraph([strong(label)]));
      const fields = childFields(variant);
      if (fields.length > 0) nodes.push(list(fields.map((field) => fieldItem(field, 1))));
    }
    return nodes;
  }

  const fields = childFields(schema);
  if (fields.length > 0) nodes.push(list(fields.map((field) => fieldItem(field, 0))));
  return nodes;
}

/* ---------- component projections ---------- */

function projectApiOperation(operationId: string): AstNode[] {
  const { method, path, operation } = getApiOperation(operationId);
  const nodes: AstNode[] = [];

  nodes.push(
    paragraph([inlineCode(`${method} ${path}`), text(` · v${getApiVersion()}`)]),
    paragraph([text(operation.summary)]),
  );
  if (operation.description) nodes.push(paragraph([text(operation.description)]));

  const schemes = [
    ...new Set((operation.security ?? []).flatMap((alternative) => Object.keys(alternative))),
  ];
  const scopes = operation['x-required-scope'] ?? [];
  const capabilities = operation['x-required-capability'] ?? [];
  if (schemes.length || scopes.length || capabilities.length) {
    nodes.push(heading(2, 'Authentication'));
    if (schemes.length > 1) nodes.push(paragraph([text('Any one of these credentials is accepted.')]));
    nodes.push(
      list(
        schemes.map((scheme) => {
          const description = getSecurityScheme(scheme)?.description;
          return listItem([
            paragraph([strong(scheme), ...(description ? [text(` — ${description}`)] : [])]),
          ]);
        }),
      ),
    );
    if (scopes.length) {
      nodes.push(paragraph([strong('Required scope:'), text(' '), inlineCode(scopes.join(', '))]));
    }
    if (capabilities.length) {
      nodes.push(
        paragraph([strong('Document capability:'), text(' '), inlineCode(capabilities.join(', '))]),
      );
    }
  }

  const parameters = operation.parameters ?? [];
  if (parameters.length) {
    nodes.push(heading(2, 'Parameters'));
    nodes.push(
      list(
        parameters.map((parameter: ApiParameter) =>
          fieldItem(
            {
              name: parameter.name,
              schema: parameter.schema,
              required: parameter.required,
              description: parameter.description,
              location: parameter.in,
            },
            MAX_FIELD_DEPTH, // parameters are scalars; no nesting
          ),
        ),
      ),
    );
  }

  if (operation.requestBody) {
    nodes.push(heading(2, 'Request body'));
    if (operation.requestBody.description) {
      nodes.push(paragraph([text(operation.requestBody.description)]));
    }
    for (const [contentType, media] of Object.entries(operation.requestBody.content ?? {})) {
      nodes.push(...schemaNodes(contentType, media.schema));
    }
  }

  nodes.push(heading(2, 'SDK examples'));
  for (const snippet of getOperationSnippets(operationId)) {
    nodes.push(paragraph([strong(snippet.label)]));
    if (snippet.note) nodes.push(blockquote(snippet.note));
    nodes.push(code(snippet.fence, snippet.source));
  }

  nodes.push(heading(2, 'Responses'));
  for (const [status, response] of Object.entries(operation.responses)) {
    nodes.push(heading(3, `${status} — ${response.description ?? 'Response'}`));
    const contents = Object.entries(response.content ?? {});
    if (contents.length === 0) {
      nodes.push(paragraph([text('No response body.')]));
      continue;
    }
    for (const [contentType, media] of contents) {
      nodes.push(...schemaNodes(contentType, media.schema));
    }
  }

  return nodes;
}

function projectApiSnippet(operationId: string): AstNode[] {
  return getOperationSnippets(operationId).flatMap((snippet) => [
    paragraph([strong(snippet.label)]),
    ...(snippet.note ? [blockquote(snippet.note)] : []),
    code(snippet.fence, snippet.source),
  ]);
}

function projectApiClientSetup(): AstNode[] {
  return getSdkLanguages().flatMap((language) => [
    paragraph([strong(language.label)]),
    code(language.fence, language.frame),
  ]);
}

function projectApiInstall(): AstNode[] {
  return getSdkLanguages().flatMap((language) => [
    paragraph([strong(language.label)]),
    code(language.installFence, language.install),
  ]);
}

function projectApiResources(absoluteContentUrl: (url: string) => string): AstNode[] {
  return getApiGroups()
    .filter((group) => group.operations.length > 0)
    .flatMap((group) => [
      heading(3, group.operatorOnly ? `${group.title} (self-hosted)` : group.title),
      list(
        group.operations.map((operation) =>
          listItem([
            paragraph([
              inlineCode(operation.method),
              text(' '),
              link(absoluteContentUrl(operation.href), operation.title),
            ]),
          ]),
        ),
      ),
    ]);
}

function projectApiCredentials(): AstNode[] {
  const order = ['apiToken', 'tenantToken', 'docToken'];
  return [
    list(
      order.flatMap((name) => {
        const scheme = getSecurityScheme(name);
        if (!scheme) return [];
        const title = (scheme as { 'x-docs-title'?: string })['x-docs-title'] ?? name;
        return [
          listItem([
            paragraph([strong(title), ...(scheme.description ? [text(` — ${scheme.description}`)] : [])]),
          ]),
        ];
      }),
    ),
  ];
}

function projectApiGrants(
  kind: 'capability' | 'scope',
  absoluteContentUrl: (url: string) => string,
): AstNode[] {
  const grants = getGrantIndex(
    kind === 'capability' ? 'x-required-capability' : 'x-required-scope',
  ).filter((entry) => entry.grant !== '');

  return [
    list(
      grants.map(({ grant, operations }) =>
        listItem([
          paragraph([
            inlineCode(grant),
            text(' — '),
            ...operations.flatMap((operation, index) => [
              ...(index > 0 ? [text(', ')] : []),
              link(absoluteContentUrl(operation.href), operation.title),
            ]),
          ]),
        ]),
      ),
    ),
  ];
}

const DEPLOYMENT_MODE_LABELS: Record<string, string> = {
  saas: 'Managed SaaS',
  'self-hosted': 'Self-hosted',
};

/**
 * The `projectComponent` hook for this site: API-reference components plus
 * the deployment tab pair. Returns null for anything it does not know so
 * the kit's unknown-component rule stays fatal.
 */
export function projectCloudPdfComponent(
  node: AstNode,
  helpers: {
    resolveNodes: (nodes: AstNode[]) => AstNode[];
    absoluteContentUrl: (url: string) => string;
    stringAttribute: (node: AstNode, name: string) => string;
  },
): AstNode[] | null {
  switch (node.name) {
    case 'ApiOperation':
      return projectApiOperation(helpers.stringAttribute(node, 'operationId'));
    case 'ApiSnippet':
      return projectApiSnippet(helpers.stringAttribute(node, 'operationId'));
    case 'ApiClientSetup':
      return projectApiClientSetup();
    case 'ApiInstall':
      return projectApiInstall();
    case 'ApiResources':
      return projectApiResources(helpers.absoluteContentUrl);
    case 'ApiCredentials':
      return projectApiCredentials();
    case 'ApiGrants': {
      const kind = helpers.stringAttribute(node, 'kind');
      return projectApiGrants(kind === 'scope' ? 'scope' : 'capability', helpers.absoluteContentUrl);
    }
    case 'ApiOperationCount':
      return [text(String(getOperationCount()))];
    case 'DeploymentTabs':
      return helpers.resolveNodes(node.children ?? []);
    case 'DeploymentTab': {
      const mode = helpers.stringAttribute(node, 'mode');
      return [
        heading(3, DEPLOYMENT_MODE_LABELS[mode] ?? mode),
        ...helpers.resolveNodes(node.children ?? []),
      ];
    }
    default:
      return null;
  }
}
