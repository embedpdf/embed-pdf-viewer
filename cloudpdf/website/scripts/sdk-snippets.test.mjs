import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReference } from './sdk-snippets.mjs';

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
