import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Per-SDK metadata. `install` is the published package coordinate and
 * the command that installs it — sourced from each SDK's own manifest
 * (go.mod, build.gradle, gemspec) or README, so the docs quote what is
 * actually published rather than a hand-typed guess.
 */
export const LANGUAGES = {
  typescript: {
    label: 'TypeScript',
    fence: 'typescript',
    method: (value) => value,
    pkg: '@cloudpdf/sdk',
    installFence: 'sh',
    install: 'npm install @cloudpdf/sdk',
  },
  python: {
    label: 'Python',
    fence: 'python',
    method: snakeCase,
    pkg: 'cloudpdf',
    installFence: 'sh',
    install: 'pip install cloudpdf',
  },
  php: {
    label: 'PHP',
    fence: 'php',
    method: (value) => value,
    pkg: 'cloudpdf/sdk',
    installFence: 'sh',
    install: 'composer require cloudpdf/sdk',
  },
  csharp: {
    label: '.NET',
    fence: 'csharp',
    method: (value) => `${pascalCase(value)}Async`,
    pkg: 'CloudPDF',
    installFence: 'sh',
    install: 'dotnet add package CloudPDF',
  },
  go: {
    label: 'Go',
    fence: 'go',
    method: pascalCase,
    pkg: 'github.com/embedpdf/cloudpdf-sdk-go/v3',
    installFence: 'sh',
    install: 'go get github.com/embedpdf/cloudpdf-sdk-go/v3',
  },
  java: {
    label: 'Java',
    fence: 'java',
    method: (value) => value,
    pkg: 'com.cloudpdf:sdk',
    installFence: 'groovy',
    install: "implementation 'com.cloudpdf:sdk'",
  },
  ruby: {
    label: 'Ruby',
    fence: 'ruby',
    method: snakeCase,
    pkg: 'cloudpdf',
    installFence: 'sh',
    install: 'gem install cloudpdf',
  },
};

export const LANGUAGE_NAMES = Object.keys(LANGUAGES);

/**
 * Every rendered example is a complete program: a per-language "frame"
 * (imports + client construction with token and base URL) wrapping the
 * operation call extracted from the generated SDK's reference.md.
 *
 * The call is derived truth — Fern generates it from the real SDK, so
 * method names and argument shapes track the code. The frame is
 * CloudPDF's editorial voice, defined once per language; without it the
 * seven Fern generators disagree about what "usage" means (Python
 * inlined construction, TypeScript showed a bare one-line call).
 * `frameLines` marks where the frame ends so the renderer can
 * de-emphasise the boilerplate and keep the call as the visual hero.
 */
const SNIPPET_BASE_URL = 'https://yourhost.com/path/to/api';

const FRAMES = {
  typescript: {
    imports: () => ['import { CloudPDFClient } from "@cloudpdf/sdk";'],
    construction: [
      'const client = new CloudPDFClient({',
      `    baseUrl: "${SNIPPET_BASE_URL}",`,
      '    token: "<token>",',
      '});',
    ],
    marker: 'new CloudPDFClient(',
  },
  python: {
    imports: () => ['from cloudpdf import CloudPDFClient'],
    construction: [
      'client = CloudPDFClient(',
      '    token="<token>",',
      `    base_url="${SNIPPET_BASE_URL}",`,
      ')',
    ],
    marker: 'client = CloudPDFClient(',
  },
  php: {
    imports: () => ['use CloudPDF\\CloudPDFClient;'],
    construction: [
      '$client = new CloudPDFClient(',
      "    token: '<token>',",
      `    options: ['baseUrl' => '${SNIPPET_BASE_URL}'],`,
      ');',
    ],
    marker: 'new CloudPDFClient(',
  },
  csharp: {
    imports: () => ['using CloudPDF;'],
    construction: [
      'var client = new CloudPDFClient(',
      '    "<token>",',
      `    new ClientOptions { BaseUrl = "${SNIPPET_BASE_URL}" }`,
      ');',
    ],
    marker: 'new CloudPDFClient(',
  },
  go: {
    // The `client` variable deliberately shadows the client package —
    // Fern's own reference examples use the same convention, and the
    // extracted calls (`client.Tenants.List(…)`) depend on it.
    imports: (call) => [
      'import (',
      ...(call.includes('context.') ? ['    "context"', ''] : []),
      ...(call.includes('os.') ? ['    "os"', ''] : []),
      ...(call.includes('cloudpdf.')
        ? ['    cloudpdf "github.com/embedpdf/cloudpdf-sdk-go/v3"']
        : []),
      '    client "github.com/embedpdf/cloudpdf-sdk-go/v3/client"',
      '    option "github.com/embedpdf/cloudpdf-sdk-go/v3/option"',
      ')',
    ],
    construction: [
      'client := client.NewClient(',
      '    option.WithToken("<token>"),',
      `    option.WithBaseURL("${SNIPPET_BASE_URL}"),`,
      ')',
    ],
    marker: 'client.NewClient(',
  },
  java: {
    imports: () => ['import com.cloudpdf.api.CloudPDFClient;'],
    construction: [
      'CloudPDFClient client = CloudPDFClient',
      '    .builder()',
      '    .token("<token>")',
      `    .url("${SNIPPET_BASE_URL}")`,
      '    .build();',
    ],
    marker: 'CloudPDFClient client = CloudPDFClient',
  },
  ruby: {
    imports: () => ['require "cloudpdf"'],
    construction: [
      'client = CloudPDF::Client.new(',
      '  token: "<token>",',
      `  base_url: "${SNIPPET_BASE_URL}"`,
      ')',
    ],
    marker: 'CloudPDF::Client.new',
  },
};

/** Call-specific import lines that must hoist above the construction. */
const IMPORT_LINE = {
  typescript: /^import .+;$/,
  python: /^(?:from|import) \S.*$/,
  php: /^use .+;$/,
  csharp: /^using [A-Z][\w.]*;$/,
  java: /^import .+;$/,
  ruby: /^require .+$/,
};

/**
 * The Fern Python generator inlines the client import and construction
 * into every usage block; strip them so the shared frame is the only
 * construction, keeping all seven languages symmetric.
 */
function stripPythonConstruction(source) {
  const lines = source.split('\n');
  const out = [];
  let skipping = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (skipping) {
      if (trimmed === ')') skipping = false;
      continue;
    }
    if (trimmed === 'from cloudpdf import CloudPDFClient') continue;
    if (trimmed.startsWith('client = CloudPDFClient(')) {
      if (!trimmed.endsWith(')')) skipping = true;
      continue;
    }
    out.push(line);
  }
  return out.join('\n').trim();
}

function hoistLeadingImports(language, call) {
  const pattern = IMPORT_LINE[language];
  if (!pattern) return { hoisted: [], body: call };
  const lines = call.split('\n');
  const hoisted = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();
    if (line === '' && hoisted.length > 0) {
      index += 1;
      continue;
    }
    if (!pattern.test(line)) break;
    hoisted.push(line);
    index += 1;
  }
  return { hoisted, body: lines.slice(index).join('\n').trim() };
}

/**
 * Indent targets per language — DOCS style, not a universal rule: snippets
 * teach each language's readers in their own idiom. TypeScript re-indents
 * to the JS-ecosystem 2 (matching every other code block in the docs);
 * Python (PEP 8), PHP (PSR-12), Java, and C# keep their idiomatic 4; Ruby
 * already arrives at 2; Go stays as generated.
 */
const INDENT_TARGETS = { typescript: 2 };

/**
 * Whitespace hygiene for every displayed snippet: strip trailing
 * whitespace, collapse runs of blank lines, drop trailing blanks — and,
 * for languages with an indent target, re-scale leading indentation from
 * the detected unit (alignment remainders preserved).
 */
export function normalizeSnippetWhitespace(language, source) {
  let lines = source.split('\n').map((line) => line.replace(/[ \t]+$/, ''));

  const target = INDENT_TARGETS[language];
  if (target) {
    const units = lines
      .filter((line) => /^ +\S/.test(line))
      .map((line) => line.match(/^ +/)[0].length);
    const unit = units.length ? Math.min(...units) : 0;
    if (unit > target) {
      lines = lines.map((line) => {
        const match = line.match(/^ +/);
        if (!match) return line;
        const depth = Math.floor(match[0].length / unit);
        const remainder = match[0].length % unit;
        return ' '.repeat(depth * target + remainder) + line.slice(match[0].length);
      });
    }
  }

  const collapsed = [];
  for (const line of lines) {
    if (line === '' && collapsed.at(-1) === '') continue;
    collapsed.push(line);
  }
  while (collapsed.at(-1) === '') collapsed.pop();
  return collapsed.join('\n');
}

export function frameSnippet(language, rawSource) {
  const frame = FRAMES[language];
  if (!frame) throw new Error(`No snippet frame for language: ${language}`);

  const call = language === 'python' ? stripPythonConstruction(rawSource) : rawSource.trim();
  const { hoisted, body } = hoistLeadingImports(language, call);
  const prefix = [...frame.imports(body), ...hoisted, '', ...frame.construction, ''];
  const source = [...prefix, body].join('\n');

  const constructions = source.split(frame.marker).length - 1;
  if (constructions !== 1) {
    throw new Error(
      `Snippet framing for ${language} produced ${constructions} client constructions:\n${source}`,
    );
  }
  return { source, frameLines: prefix.length };
}

const UPLOAD_PROXY_OVERRIDES = {
  typescript: {
    source: `import { readFile } from "node:fs/promises";

await client.documents.uploadProxy({
    file: new Blob([await readFile("document.pdf")], { type: "application/pdf" }),
    tenantId: "tenantId",
    id: "documentId",
});`,
  },
  python: {
    source: `with open("document.pdf", "rb") as pdf:
    result = client.documents.upload_proxy(
        file=pdf,
        tenant_id="tenantId",
        id="documentId",
    )`,
  },
  php: {
    source: `use CloudPDF\\Documents\\Requests\\UploadProxyDocumentsRequest;
use CloudPDF\\Utils\\File;

$result = $client->documents->uploadProxy(
    'tenantId',
    'documentId',
    new UploadProxyDocumentsRequest([
        'file' => File::createFromFilepath('document.pdf'),
    ]),
);`,
  },
  csharp: {
    source: `await using var pdf = File.OpenRead("document.pdf");
var result = await client.Documents.UploadProxyAsync(
    new UploadProxyDocumentsRequest {
        TenantId = "tenantId",
        Id = "documentId",
        File = new FileParameter {
            Stream = pdf,
            FileName = "document.pdf",
            ContentType = "application/pdf",
        },
    }
);`,
  },
  go: {
    source: `pdf, err := os.Open("document.pdf")
if err != nil {
    return err
}
defer pdf.Close()

result, err := client.Documents.UploadProxy(
    context.Background(),
    &cloudpdf.UploadProxyDocumentsRequest{
        TenantID: "tenantId",
        ID: "documentId",
        File: pdf,
    },
)`,
  },
  java: {
    source: `import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;

try (InputStream pdf = Files.newInputStream(Path.of("document.pdf"))) {
    var result = client.documents().uploadProxy(
        "tenantId",
        "documentId",
        pdf,
        "document.pdf"
    );
}`,
  },
  ruby: {
    source: `result = client.documents.upload_proxy(
  file: File.open("document.pdf", "rb"),
  tenant_id: "tenantId",
  id: "documentId"
)`,
  },
};

export function readOpenApi(repositoryRoot) {
  return JSON.parse(readFileSync(`${repositoryRoot}/cloudpdf/contract/openapi.json`, 'utf8'));
}

export function collectOperations(openapi) {
  const operations = [];
  const methods = ['get', 'post', 'put', 'patch', 'delete', 'head', 'options'];

  for (const [path, pathItem] of Object.entries(openapi.paths ?? {})) {
    for (const method of methods) {
      const operation = pathItem[method];
      if (!operation) continue;
      const credentials = [
        ...new Set((operation.security ?? []).flatMap((entry) => Object.keys(entry))),
      ];
      operations.push({
        operationId: operation.operationId,
        method,
        path,
        groups: operation['x-fern-sdk-group-name'],
        sdkMethod: operation['x-fern-sdk-method-name'],
        title: operation['x-docs-title'],
        summary: operation.summary,
        // API-token-only = operator surface; on managed CloudPDF these
        // operations belong to the platform, not the customer.
        operatorOnly: credentials.length === 1 && credentials[0] === 'apiToken',
      });
    }
  }

  return operations;
}

export function extractSnippetManifest({ openapi, repositoryRoot, artifactsRoot }) {
  const operations = collectOperations(openapi);
  const openapiSha256 = createHash('sha256')
    .update(readFileSync(`${repositoryRoot}/cloudpdf/contract/openapi.json`))
    .digest('hex');

  // Refuse stale inputs up front: extracting from a tree generated against an
  // older contract would produce a plausible manifest that CI then rejects.
  const trees = LANGUAGE_NAMES.map((language) => ({
    language,
    referenceFile: referencePath({ language, repositoryRoot, artifactsRoot }),
  }));
  const staleTrees = trees
    .map(({ language, referenceFile }) => {
      const problem = generationStampProblem({
        referenceFile,
        expectedOpenapiSha256: openapiSha256,
      });
      return problem ? `- ${language}: ${problem}` : null;
    })
    .filter(Boolean);
  if (staleTrees.length > 0) {
    throw new Error(
      `Stale generated SDKs:\n${staleTrees.join('\n')}\nRun \`pnpm api:sync\` from the repository root to regenerate them and rebuild the manifest.`,
    );
  }

  const references = Object.fromEntries(
    trees.map(({ language, referenceFile }) => [
      language,
      parseReference(readFileSync(referenceFile, 'utf8'), language),
    ]),
  );

  const snippets = {};
  const missing = [];

  for (const operation of operations) {
    snippets[operation.operationId] = {};
    const group = groupLabel(operation.groups);

    for (const language of LANGUAGE_NAMES) {
      const override =
        operation.operationId === 'documents.uploadProxy'
          ? UPLOAD_PROXY_OVERRIDES[language]
          : undefined;
      const source = override ?? references[language].get(snippetKey(group, operation.sdkMethod));
      if (!source) {
        missing.push(`${operation.operationId}:${language}`);
        continue;
      }
      const framed = frameSnippet(language, source.source);
      snippets[operation.operationId][language] = {
        status: source.status ?? 'available',
        ...(source.note ? { note: source.note } : {}),
        source: normalizeSnippetWhitespace(language, framed.source),
        frameLines: framed.frameLines,
      };
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing SDK snippets:\n${missing.map((value) => `- ${value}`).join('\n')}`);
  }

  return {
    schemaVersion: 2,
    canonicalVersion: openapi.info.version,
    openapiSha256,
    languages: Object.fromEntries(
      Object.entries(LANGUAGES).map(([name, config]) => [
        name,
        {
          label: config.label,
          fence: config.fence,
          pkg: config.pkg,
          install: config.install,
          installFence: config.installFence,
          // The standalone client-construction block (imports + client),
          // for prose pages that teach setup without a specific call.
          frame: [...FRAMES[name].imports(''), '', ...FRAMES[name].construction].join('\n'),
        },
      ]),
    ),
    operations: snippets,
  };
}

/**
 * A reference.md is only trustworthy when its tree was generated from the
 * contract being documented. record-sdk-metadata.mjs stamps every generated
 * tree with cloudpdf-generation.json; require its OpenAPI SHA-256 to match
 * before extracting so a stale scratch tree cannot silently feed the
 * manifest. Returns a human-readable problem, or null when the tree is fresh.
 */
export function generationStampProblem({ referenceFile, expectedOpenapiSha256 }) {
  const stampPath = `${dirname(referenceFile)}/cloudpdf-generation.json`;
  let stamp;
  try {
    stamp = JSON.parse(readFileSync(stampPath, 'utf8'));
  } catch {
    return 'never generated (no cloudpdf-generation.json in the SDK tree)';
  }
  const stamped = stamp.source?.openapiSha256;
  if (stamped !== expectedOpenapiSha256) {
    return `generated from OpenAPI ${stamped ? stamped.slice(0, 12) : 'unknown'} (${stamp.canonicalVersion ?? 'unknown version'}), but the contract is now ${expectedOpenapiSha256.slice(0, 12)}`;
  }
  return null;
}

function referencePath({ language, repositoryRoot, artifactsRoot }) {
  if (!artifactsRoot) {
    return language === 'typescript'
      ? `${repositoryRoot}/cloudpdf/sdk/reference.md`
      : `${repositoryRoot}/sdks/${language}/reference.md`;
  }

  const artifact = readdirSync(artifactsRoot)
    .filter((entry) => entry.startsWith(`cloudpdf-sdk-${language}-`))
    .sort()
    .at(-1);
  if (!artifact) throw new Error(`No downloaded SDK artifact found for ${language}`);

  const matches = findFiles(`${artifactsRoot}/${artifact}`, 'reference.md');
  if (matches.length !== 1) {
    throw new Error(
      `Expected one reference.md in ${artifact}, found ${matches.length}: ${matches.join(', ')}`,
    );
  }
  return matches[0];
}

function findFiles(directory, filename) {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = `${directory}/${entry}`;
    if (statSync(absolute).isDirectory()) return findFiles(absolute, filename);
    return entry === filename ? [absolute] : [];
  });
}

export function parseReference(source, language) {
  const config = LANGUAGES[language];
  if (!config) throw new Error(`Unsupported SDK language: ${language}`);

  const snippets = new Map();
  const headings = [...source.matchAll(/^## (.+)$/gm)];

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const group = heading[1].trim();
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? source.length;
    const section = source.slice(start, end);
    const details = section.match(/<details><summary>[\s\S]*?<\/details>/g) ?? [];

    for (const detail of details) {
      const summary = detail.match(/<summary><code>([\s\S]*?)<\/code><\/summary>/)?.[1];
      const usage = detail.match(/#### 🔌 Usage[\s\S]*?```([^\n]*)\n([\s\S]*?)```/);
      if (!summary || !usage) continue;

      const method = methodFromSummary(summary, language);
      if (!method) continue;
      snippets.set(snippetKey(group, method), { source: usage[2].trim() });
    }
  }

  return snippets;
}

function methodFromSummary(summary, language) {
  // Fern emits either a plain method, a method wrapped in a source link, or
  // an HTML-encoded PHP arrow. Extract only that narrow grammar instead of
  // stripping and decoding arbitrary HTML.
  const matches = [
    ...summary.matchAll(/(?:\.|->|-&gt;)(?:<a\b[^>]*>)?([A-Za-z_][A-Za-z0-9_]*)(?:<\/a>)?\s*\(/g),
  ];
  const raw = matches.at(-1)?.[1];
  if (!raw) return undefined;

  if (language === 'python' || language === 'ruby') return camelCase(raw);
  if (language === 'csharp' && raw.endsWith('Async')) return camelCase(raw.slice(0, -5));
  if (language === 'go') return camelCase(raw);
  return raw;
}

function snippetKey(group, method) {
  return `${group}:${method}`;
}

function groupLabel(groups) {
  return groups.map(titleCase).join(' ');
}

function titleCase(value) {
  const words = value.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return words.replace(/\b\w/g, (character) => character.toUpperCase());
}

function snakeCase(value) {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[- ]+/g, '_')
    .toLowerCase();
}

function pascalCase(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function camelCase(value) {
  if (value.includes('_')) {
    return value.replace(/_([a-z0-9])/g, (_, character) => character.toUpperCase());
  }
  return value.charAt(0).toLowerCase() + value.slice(1);
}

export function repositoryRootFrom(importMetaUrl) {
  return fileURLToPath(new URL('../../../', importMetaUrl)).replace(/\/$/, '');
}
