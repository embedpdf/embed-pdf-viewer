import Link from 'next/link';
import { Fragment, type ReactNode } from 'react';
import { createHighlighter } from 'shiki';

import {
  getApiOperation,
  getApiVersion,
  getOperationSnippets,
  getSdkLanguages,
  getSecurityScheme,
  isOperatorOnly,
  resolveSchema,
  schemaType,
  type ApiParameter,
  type JsonSchema,
} from '@/lib/api-reference';

import { Heading } from './heading';
import { methodStyle } from './method-badge';
import { Tabs } from './tabs';

const highlighterPromise = createHighlighter({
  themes: ['material-theme-palenight'],
  langs: ['typescript', 'python', 'php', 'csharp', 'go', 'java', 'ruby'],
});

const STATUS_STYLES: Record<string, string> = {
  '2': 'border-[#B9E5CB] bg-[#EAF9F0] text-[#167645]',
  '3': 'border-[#B7D4FF] bg-[#EAF3FF] text-[#1D5FBF]',
  '4': 'border-[#F1D7A8] bg-[#FFF6E5] text-[#9A5A00]',
  '5': 'border-[#F2BFC4] bg-[#FFF0F1] text-[#B52D3B]',
};

const NEUTRAL_BADGE = 'border-cp-border bg-white text-cp-navy';
const CARD = 'border-cp-border overflow-hidden rounded-[14px] border bg-white';
const CARD_HEAD = 'border-cp-borderSoft flex flex-wrap items-center gap-2.5 border-b bg-[#F8FAFE] px-4 py-3';
const LEAD = 'text-cp-ink mt-4 max-w-[70ch] font-sans text-[16.5px] leading-[1.7]';
const HINT = 'text-cp-muted mt-4 max-w-[70ch] font-sans text-[15px] leading-[1.65]';

/** Nested schemas are inlined to this depth, then reduced to their type name. */
const MAX_FIELD_DEPTH = 3;

const SNIPPET_PANEL =
  '[&_.shiki]:!m-0 [&_.shiki]:overflow-x-auto [&_.shiki]:!bg-[#0E1A40] [&_.shiki]:px-[18px] [&_.shiki]:py-[17px] [&_.shiki]:font-mono [&_.shiki]:text-[13px] [&_.shiki]:leading-[1.8] [&_.snippet-frame]:opacity-60';

/**
 * The generated SDK examples for one operation, in all seven languages
 * behind the reference-wide language switcher. Used by every operation
 * page and embeddable in prose pages (`<ApiSnippet operationId="…" />`)
 * so hand-written pages never fork from the generated examples.
 */
export async function ApiSnippet({ operationId }: { operationId: string }) {
  const snippets = getOperationSnippets(operationId);
  const highlighter = await highlighterPromise;
  const highlighted = snippets.map((snippet) => ({
    ...snippet,
    html: highlighter.codeToHtml(snippet.source, {
      lang: snippet.fence,
      theme: 'material-theme-palenight',
      transformers: [
        {
          // De-emphasise the shared frame (imports + client construction)
          // so the operation call stays the visual hero of every example.
          line(node, line) {
            if (line <= snippet.frameLines) this.addClassToHast(node, 'snippet-frame');
          },
        },
      ],
    }),
  }));

  return (
    <Tabs items={highlighted.map((snippet) => snippet.label)} storageKey="cloudpdf-sdk-language">
      {highlighted.map((snippet) => (
        <div key={snippet.language}>
          {snippet.note ? (
            <div className="flex gap-2.5 border-b border-[#283867] bg-[#132249] px-[18px] py-3 font-sans text-[13px] leading-5 text-[#C7D5F2]">
              <svg
                width={15}
                height={15}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mt-0.5 shrink-0 text-[#7B93D4]"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 16v-4M12 8h.01" />
              </svg>
              <span>{snippet.note}</span>
            </div>
          ) : null}
          <div className={SNIPPET_PANEL} dangerouslySetInnerHTML={{ __html: snippet.html }} />
        </div>
      ))}
    </Tabs>
  );
}

/**
 * The per-language client-construction block alone — for prose pages
 * that teach setup (authentication) without a specific operation call.
 */
export async function ApiClientSetup() {
  const languages = getSdkLanguages();
  const highlighter = await highlighterPromise;
  const blocks = languages.map((language) => ({
    ...language,
    html: highlighter.codeToHtml(language.frame, {
      lang: language.fence,
      theme: 'material-theme-palenight',
    }),
  }));

  return (
    <Tabs items={blocks.map((block) => block.label)} storageKey="cloudpdf-sdk-language">
      {blocks.map((block) => (
        <div
          key={block.language}
          className={SNIPPET_PANEL}
          dangerouslySetInnerHTML={{ __html: block.html }}
        />
      ))}
    </Tabs>
  );
}

export async function ApiOperation({ operationId }: { operationId: string }) {
  const { method, path, operation } = getApiOperation(operationId);

  return (
    <>
      <div className="border-cp-border mt-6 flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-[14px] border bg-white px-4 py-3.5 shadow-[0_1px_2px_rgba(10,26,77,0.05)]">
        <span
          className={`rounded-md border px-2.5 py-1 font-mono text-[11.5px] font-bold tracking-[0.04em] ${methodStyle(method)}`}
        >
          {method}
        </span>
        <span className="text-cp-navy order-last w-full break-words font-mono text-[15px] font-semibold leading-[1.5] sm:order-none sm:w-auto sm:min-w-0 sm:flex-1">
          <EndpointPath path={path} />
        </span>
        <span className="border-cp-border text-cp-muted ml-auto rounded-md border bg-[#F8FAFE] px-2 py-1 font-mono text-[11px] font-semibold">
          v{getApiVersion()}
        </span>
      </div>

      <p className={LEAD}>{operation.summary}</p>
      {operation.description ? (
        <p className="text-cp-muted mt-3 max-w-[70ch] font-sans text-[15.5px] leading-[1.7]">
          {operation.description}
        </p>
      ) : null}

      {isOperatorOnly(operation) ? (
        <div className="mt-5 flex max-w-[72ch] gap-3 rounded-[14px] border border-[#DCE4F2] bg-[#F6F8FC] px-[18px] py-3.5">
          <span className="text-cp-muted mt-0.5 shrink-0">
            <svg
              width={15}
              height={15}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.1"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="6" rx="1.5" />
              <rect x="3" y="14" width="18" height="6" rx="1.5" />
              <path d="M7 7h.01M7 17h.01" />
            </svg>
          </span>
          <p className="text-cp-muted font-sans text-[14.5px] leading-[1.6]">
            <span className="text-cp-navy font-bold">Self-hosted surface.</span> On managed
            CloudPDF this is operated by the platform — your account is already a tenant. Start at{' '}
            <Link
              href="/docs/api-reference/documents/list"
              className="text-cp-blue font-semibold hover:underline"
            >
              Tenant documents
            </Link>
            .
          </p>
        </div>
      ) : null}

      <Authentication operation={operation} />

      {operation.parameters?.length ? (
        <Section id="parameters" title="Parameters">
          <div className={`mt-5 ${CARD}`}>
            <FieldList fields={operation.parameters.map(parameterField)} side="request" />
          </div>
        </Section>
      ) : null}

      {operation.requestBody ? (
        <Section id="request-body" title="Request body">
          {operation.requestBody.description ? (
            <p className={HINT}>{operation.requestBody.description}</p>
          ) : null}
          <div className="mt-5 space-y-4">
            {Object.entries(operation.requestBody.content ?? {}).map(([contentType, media]) => (
              <div key={contentType} className={CARD}>
                <SchemaBlock
                  contentType={contentType}
                  schema={media.schema}
                  side="request"
                  required={operation.requestBody?.required}
                />
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section id="sdk-examples" title="SDK examples">
        <p className={HINT}>
          The selected SDK is remembered across the API reference. Values are examples; replace them
          with identifiers and input from your application.
        </p>
        <ApiSnippet operationId={operationId} />
      </Section>

      <Section id="responses" title="Responses">
        <div className="mt-5 space-y-4">
          {Object.entries(operation.responses).map(([status, response]) => {
            const contents = Object.entries(response.content ?? {});
            return (
              <div key={status} className={CARD}>
                <div className={CARD_HEAD}>
                  <span
                    className={`rounded-md border px-2 py-1 font-mono text-[11.5px] font-bold ${STATUS_STYLES[status[0]] ?? NEUTRAL_BADGE}`}
                  >
                    {status}
                  </span>
                  <span className="font-display text-cp-navy text-[14.5px] font-bold">
                    {response.description ?? 'Response'}
                  </span>
                </div>
                {contents.length ? (
                  contents.map(([contentType, media]) => (
                    <SchemaBlock
                      key={contentType}
                      contentType={contentType}
                      schema={media.schema}
                      side="response"
                    />
                  ))
                ) : (
                  <p className="text-cp-muted px-4 py-3.5 font-sans text-[14.5px]">
                    No response body.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Section>
    </>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section>
      <Heading as="h2" id={id}>
        {title}
      </Heading>
      {children}
    </section>
  );
}

/**
 * Path parameters read far better when they stand out from the static
 * segments. The <wbr> before each "/" lets a long path wrap between segments
 * rather than through the middle of an identifier.
 */
function EndpointPath({ path }: { path: string }) {
  return (
    <>
      {path
        .split(/(\{[^}]+\})/g)
        .filter(Boolean)
        .map((segment, index) =>
          segment.startsWith('{') ? (
            <span key={index} className="text-cp-blue">
              {segment}
            </span>
          ) : (
            <span key={index}>
              {segment.split('/').map((part, partIndex) => (
                <Fragment key={partIndex}>
                  {partIndex > 0 ? (
                    <>
                      <wbr />/
                    </>
                  ) : null}
                  {part}
                </Fragment>
              ))}
            </span>
          ),
        )}
    </>
  );
}

function Authentication({
  operation,
}: {
  operation: ReturnType<typeof getApiOperation>['operation'];
}) {
  const schemes = [
    ...new Set((operation.security ?? []).flatMap((alternative) => Object.keys(alternative))),
  ];
  const scopes = operation['x-required-scope'] ?? [];
  const capabilities = operation['x-required-capability'] ?? [];
  if (!schemes.length && !scopes.length && !capabilities.length) return null;

  return (
    <Section id="authentication" title="Authentication">
      {schemes.length > 1 ? (
        <p className={HINT}>Any one of these credentials is accepted.</p>
      ) : null}
      {schemes.length ? (
        <div className="mt-5 space-y-3">
          {schemes.map((scheme) => (
            <div key={scheme} className={`${CARD} flex gap-3.5 px-4 py-3.5`}>
              <span className="bg-cp-surface text-cp-blue mt-px inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg">
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="10" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
              </span>
              <div className="min-w-0">
                <div className="font-display text-cp-navy text-[14.5px] font-bold leading-[1.4]">
                  {getSecurityScheme(scheme)?.['x-docs-title'] ?? scheme}
                </div>
                {getSecurityScheme(scheme)?.description ? (
                  <p className="text-cp-muted mt-1 max-w-[68ch] font-sans text-[14.5px] leading-[1.6]">
                    {getSecurityScheme(scheme)?.description}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {scopes.length ? <ChipRow label="Required scope" values={scopes} /> : null}
      {capabilities.length ? <ChipRow label="Document capability" values={capabilities} /> : null}
    </Section>
  );
}

function ChipRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-2">
      <span className="font-display text-cp-navy text-[13.5px] font-bold">{label}</span>
      {values.map((value) => (
        <span
          key={value}
          className="border-cp-border text-cp-ink rounded-md border bg-[#F8FAFE] px-2 py-[3px] font-mono text-[12.5px]"
        >
          {value}
        </span>
      ))}
    </div>
  );
}

type Side = 'request' | 'response';

type Field = {
  key: string;
  name: string;
  schema?: JsonSchema;
  required?: boolean;
  description?: string;
  location?: string;
};

function parameterField(parameter: ApiParameter): Field {
  return {
    key: `${parameter.in}:${parameter.name}`,
    name: parameter.name,
    schema: parameter.schema,
    required: parameter.required,
    description: parameter.description,
    location: parameter.in,
  };
}

/** Object properties, unwrapping a `$ref` and/or an array wrapper on the way. */
function childFields(schema?: JsonSchema): Field[] {
  if (!schema) return [];
  let resolved = resolveSchema(schema).schema;
  if (resolved.type === 'array' && resolved.items) {
    resolved = resolveSchema(resolved.items).schema;
  }
  return Object.entries(resolved.properties ?? {}).map(([name, property]) => ({
    key: name,
    name,
    schema: property,
    required: (resolved.required ?? []).includes(name),
    description: property.description,
  }));
}

function FieldList({ fields, side, depth = 0 }: { fields: Field[]; side: Side; depth?: number }) {
  return (
    <div className="divide-cp-borderSoft divide-y">
      {fields.map((field) => (
        <FieldRow key={field.key} field={field} side={side} depth={depth} />
      ))}
    </div>
  );
}

function FieldRow({ field, side, depth }: { field: Field; side: Side; depth: number }) {
  const children = depth < MAX_FIELD_DEPTH ? childFields(field.schema) : [];

  return (
    <div className="px-4 py-3.5">
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1.5">
        <code>{field.name}</code>
        {field.location ? (
          <span className="text-cp-muted font-sans text-[11.5px] font-bold uppercase tracking-[0.06em]">
            {field.location}
          </span>
        ) : null}
        <span className="text-cp-muted break-words font-mono text-[12.5px]">
          {schemaType(field.schema)}
        </span>
        <Optionality side={side} required={field.required} />
        {field.schema?.default !== undefined ? (
          <span className="text-cp-muted font-mono text-[12px]">
            default {JSON.stringify(field.schema.default)}
          </span>
        ) : null}
      </div>
      {field.description ? (
        <p className="text-cp-muted mt-1.5 max-w-[68ch] font-sans text-[14.5px] leading-[1.6]">
          {field.description}
        </p>
      ) : null}
      {children.length ? (
        <div className="border-cp-borderSoft mt-3 rounded-[10px] border bg-[#FBFCFE]">
          <FieldList fields={children} side={side} depth={depth + 1} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * On the way in, the caller needs to know what it must send. On the way out,
 * every field is normally present, so flagging each one "required" is noise —
 * the useful signal there is the handful that may be missing.
 */
function Optionality({ side, required }: { side: Side; required?: boolean }) {
  if (side === 'request') return required ? <RequiredPill /> : null;
  return required ? null : (
    <span className="text-cp-muted text-[10px] font-bold uppercase tracking-[0.06em]">optional</span>
  );
}

function RequiredPill() {
  return (
    <span className="rounded border border-[#F5CDD1] bg-[#FFF3F4] px-1.5 py-px text-[10px] font-bold uppercase tracking-[0.06em] text-[#B52D3B]">
      required
    </span>
  );
}

/**
 * One content type of a request or response: the media header, then the fields.
 * Bodies with no properties (binary downloads, scalars) show their type alone.
 */
function SchemaBlock({
  contentType,
  schema,
  side,
  required,
}: {
  contentType: string;
  schema?: JsonSchema;
  side: Side;
  required?: boolean;
}) {
  const resolved = schema ? resolveSchema(schema).schema : undefined;
  const variants = resolved?.anyOf ?? resolved?.oneOf ?? [];
  const fields = childFields(schema);

  return (
    <>
      <div className={`${CARD_HEAD} border-t [&:first-child]:border-t-0`}>
        <code>{contentType}</code>
        {schema ? (
          <span className="text-cp-muted break-words font-mono text-[12.5px]">
            {schemaType(schema)}
          </span>
        ) : null}
        {required ? <RequiredPill /> : null}
      </div>
      {resolved?.description ? (
        <p className="border-cp-borderSoft text-cp-muted border-b px-4 py-3 font-sans text-[14.5px] leading-[1.6]">
          {resolved.description}
        </p>
      ) : null}
      {variants.length ? (
        <div className="divide-cp-borderSoft divide-y">
          {variants.map((variant, index) => (
            <div key={index} className="px-4 py-3.5">
              <div className="font-display text-cp-navy mb-2.5 text-[13.5px] font-bold">
                {variantLabel(variant) ?? `Option ${index + 1}`}
              </div>
              <div className="border-cp-borderSoft rounded-[10px] border bg-[#FBFCFE]">
                <FieldList fields={childFields(variant)} side={side} depth={1} />
              </div>
            </div>
          ))}
        </div>
      ) : fields.length ? (
        <FieldList fields={fields} side={side} />
      ) : null}
    </>
  );
}

/** anyOf branches are usually tagged unions — label them by the tag literal. */
function variantLabel(variant: JsonSchema) {
  const resolved = resolveSchema(variant).schema;
  for (const property of Object.values(resolved.properties ?? {})) {
    if (property.const !== undefined) return String(property.const);
    if (property.enum?.length === 1) return String(property.enum[0]);
  }
  return resolveSchema(variant).name;
}

