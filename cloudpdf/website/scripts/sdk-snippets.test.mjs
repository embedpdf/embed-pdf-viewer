import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeSnippetWhitespace, parseReference } from './sdk-snippets.mjs';

function reference(summary, language, source = `${language} usage`) {
  return `## Methods
<details><summary><code>${summary}</code></summary>
#### 🔌 Usage
\`\`\`${language}
${source}
\`\`\`
</details>`;
}

test('extracts TypeScript method snippets from Fern reference markdown', () => {
  const snippets = parseReference(
    `## Tenants
<details><summary><code>client.tenants.<a href="/Client.ts">create</a>({ ...params })</code></summary>
#### 🔌 Usage
\`\`\`typescript
await client.tenants.create({ tenantId: "tenantId" });
\`\`\`
</details>`,
    'typescript',
  );

  assert.equal(
    snippets.get('Tenants:create')?.source,
    'await client.tenants.create({ tenantId: "tenantId" });',
  );
});

test('normalizes generated language method casing', () => {
  const python = parseReference(
    `## Deployment
<details><summary><code>client.deployment.license_status()</code></summary>
#### 🔌 Usage
\`\`\`python
client.deployment.license_status()
\`\`\`
</details>`,
    'python',
  );
  const csharp = parseReference(
    `## Deployment
<details><summary><code>client.Deployment.LicenseStatusAsync()</code></summary>
#### 🔌 Usage
\`\`\`csharp
await client.Deployment.LicenseStatusAsync();
\`\`\`
</details>`,
    'csharp',
  );

  assert.ok(python.has('Deployment:licenseStatus'));
  assert.ok(csharp.has('Deployment:licenseStatus'));
});

test('extracts every generated summary shape without sanitizing HTML', () => {
  const cases = [
    {
      language: 'typescript',
      summary: 'client.doc.<a href="/Client.ts">download</a>()',
      method: 'download',
    },
    {
      language: 'python',
      summary: 'client.deployment.<a href="client.py">license_status</a>()',
      method: 'licenseStatus',
    },
    {
      language: 'php',
      summary: '$client-&gt;deployment-&gt;licenseStatus()',
      method: 'licenseStatus',
    },
    {
      language: 'csharp',
      summary: 'client.Deployment.<a href="Client.cs">LicenseStatusAsync</a>()',
      method: 'licenseStatus',
    },
    {
      language: 'go',
      summary: 'client.Deployment.LicenseStatus()',
      method: 'licenseStatus',
    },
    {
      language: 'java',
      summary: 'client.deployment.licenseStatus()',
      method: 'licenseStatus',
    },
    {
      language: 'ruby',
      summary: 'client.deployment.<a href="client.rb">license_status</a>()',
      method: 'licenseStatus',
    },
  ];

  for (const { language, summary, method } of cases) {
    const snippets = parseReference(reference(summary, language), language);
    assert.equal(snippets.get(`Methods:${method}`)?.source, `${language} usage`);
  }
});

test('rejects unexpected nested markup in a method link', () => {
  const snippets = parseReference(
    reference(
      'client.doc.<a href="/Client.ts"><script>alert(1)</script>download</a>()',
      'typescript',
    ),
    'typescript',
  );

  assert.equal(snippets.size, 0);
});

test('normalizeSnippetWhitespace re-indents TypeScript to the docs 2-space style', () => {
  const framed = [
    'const client = new CloudPDFClient({',
    '    baseUrl: "https://yourhost.com",',
    '    token: "<token>",',
    '});',
    '',
    '',
    'await client.tenants.create({',
    '        id: "id",   ',
    '});',
    '',
  ].join('\n');
  assert.equal(
    normalizeSnippetWhitespace('typescript', framed),
    [
      'const client = new CloudPDFClient({',
      '  baseUrl: "https://yourhost.com",',
      '  token: "<token>",',
      '});',
      '',
      'await client.tenants.create({',
      '    id: "id",',
      '});',
    ].join('\n'),
  );
});

test('normalizeSnippetWhitespace leaves idiomatic-4 languages at 4', () => {
  const python = 'client = CloudPDFClient(\n    base_url="x",\n)\n';
  assert.equal(
    normalizeSnippetWhitespace('python', python),
    'client = CloudPDFClient(\n    base_url="x",\n)',
  );
});
