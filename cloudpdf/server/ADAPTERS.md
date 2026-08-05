# Server Adapter House Style

The server has four adapter families: **Secrets**, **KMS**, **Storage**, **CDN**. They differ in _what they do_ but share _how they're structured_. This document is the contract a new adapter must follow.

---

## File layout

Every family lives at the same shape:

```
<family>/
├── <Family>.ts                     interface (role-noun, includes `info`)
├── create<Family>.ts               factory function (switch on kind)
├── config/
│   ├── <Family>ConfigSchema.ts     Zod discriminated union over `kind`
│   └── load<Family>ConfigFromEnv.ts
└── adapters/
    ├── <Kind1><Family>.ts          one file per provider
    └── <Kind2><Family>.ts
```

Examples: `security/kms/adapters/AwsKmsKeyring.ts`, `storage/adapters/S3ObjectStore.ts`, `cdn/adapters/BunnyCdnSigner.ts`.

---

## Interface convention

```typescript
interface <Family> {
  readonly info: { kind: <FamilyKind>; ...public_diagnostic_fields };
  // family-specific methods
}
```

Rules:

- `kind` is the discriminator and matches the config Zod schema.
- Other `info` fields are **public identifiers only** — bucket names, distribution domains, key IDs, hostnames. **Never secrets.**
- Decorators (caching wrappers, etc.) add fields rather than mutating `kind`. Example: `info: { kind: 'aws-sm', cached: true }`, not `kind: 'aws-sm+cache'`.

---

## Lazy-load house pattern for cloud-SDK adapters

Every cloud-SDK adapter follows this exact shape. The pattern is non-negotiable so installs don't need every cloud SDK and so server boot stays fast.

### Canonical form

```typescript
import type { /* type-only imports for SDK shapes */ } from '@scope/package';
// NB: type-only imports don't trigger the lazy load — only `await import(...)` does.

type Module = typeof import('@scope/package');
type Client = InstanceType<Module['Client']>;

export class XxxAdapter implements YyyInterface {
  readonly info = { kind: 'xxx' as const, /* public diagnostics */ };

  // Promise-typed field — stored, not awaited at construction
  private readonly clientPromise: Promise<{ client: Client; /* commands */ }>;

  constructor(private readonly opts: XxxConfig) {
    this.clientPromise = this.createClient();
  }

  private async createClient(): Promise<{ client: Client; /* commands */ }> {
    const mod = (await import('@scope/package')) as Module;
    return {
      client: new mod.Client(/* ... */),
      // Capture command constructors here too — the SDK uses
      // command objects you instantiate per call.
    };
  }

  async someOperation(...) {
    const { client, /* commands */ } = await this.clientPromise;
    return client.send(new commands.SomeCommand(/* ... */));
  }
}
```

### Why this exact shape

| Decision                                                                            | Why                                                                                                                             |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `await import('@scope/package')` in a private async method                          | Dynamic import doesn't run at module load. The SDK package never resolves unless an instance is constructed.                    |
| `clientPromise` stored at construction (`this.clientPromise = this.createClient()`) | Single shared promise. First operation awaits it; subsequent operations reuse the same resolved client. No reconnection storms. |
| **Stored, not awaited** at construction                                             | Constructor stays synchronous. `new XxxAdapter(opts)` returns immediately. The connection happens on first use.                 |
| Command constructors returned alongside the client                                  | AWS SDK v3 / GCP / Azure use command objects. Capturing them in `createClient` avoids per-call `await import` calls.            |
| Type-only imports for SDK shapes                                                    | TypeScript can infer types from the SDK without forcing a runtime require. Pair `import type` with `typeof import(...)`.        |

### Azure variant — parallel imports

Azure adapters typically need two packages (`@azure/identity` for auth + a service SDK). Parallelize the imports:

```typescript
private async createClient(): Promise<Client> {
  const [identity, keys] = await Promise.all([
    import('@azure/identity') as Promise<typeof import('@azure/identity')>,
    import('@azure/keyvault-keys') as Promise<typeof import('@azure/keyvault-keys')>,
  ]);
  return new keys.CryptographyClient(this.keyId, new identity.DefaultAzureCredential());
}
```

### `optionalDependencies`

Every cloud-SDK package **must** be listed in `package.json` under `optionalDependencies`, never `dependencies`. This way:

- `npm install` doesn't pull SDKs the user isn't using.
- Errors at adapter construction time are clear: "Cannot find module '@scope/package' — install it to use the X adapter."
- CI can install with `--no-optional` to verify the core server works without any cloud SDK.

Current cloud-SDK adapters using the pattern (all match exactly):

| Adapter                        | SDK package                                   |
| ------------------------------ | --------------------------------------------- |
| `S3ObjectStore`                | `@aws-sdk/client-s3` + `s3-request-presigner` |
| `AwsKmsKeyring`                | `@aws-sdk/client-kms`                         |
| `GcpKmsKeyring`                | `@google-cloud/kms`                           |
| `AzureKeyVaultKeyring`         | `@azure/identity` + `@azure/keyvault-keys`    |
| `AwsSecretsManagerProvider`    | `@aws-sdk/client-secrets-manager`             |
| `GcpSecretManagerProvider`     | `@google-cloud/secret-manager`                |
| `AzureKeyVaultSecretsProvider` | `@azure/identity` + `@azure/keyvault-secrets` |
| `GcsObjectStore`               | `@google-cloud/storage`                       |
| `AzureBlobObjectStore`         | `@azure/storage-blob` + `@azure/identity`     |

Any new cloud-SDK adapter (CDN CloudFront / CloudCDN / AzureFD purge) follows the same shape.

---

## Config schema convention

`<family>/config/<Family>ConfigSchema.ts`:

```typescript
export const <Family>ConfigSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('a'), ...fields }),
  z.object({ kind: z.literal('b'), ...fields }),
]);
export type <Family>Config = z.infer<typeof <Family>ConfigSchema>;
```

Fields that may hold secrets: `z.union([SecretRefSchema, z.string()])`. The string form is for local-dev convenience (literal value); the `SecretRef` form is for production. The factory's resolver injection (see below) handles both.

---

## Factory convention

`<family>/create<Family>.ts`:

```typescript
export async function create<Family>(
  config: <Family>Config,
  opts: { resolver?: SecretResolver } = {},
): Promise<<Family>> {
  switch (config.kind) {
    case 'a': return new A<Family>(config, opts);
    case 'b': return new B<Family>(config, opts);
    // exhaustive — TypeScript enforces no missing cases
  }
}
```

The `{ resolver }` opt is the shared mechanism for resolving `SecretRef` fields in config. Each adapter that needs it pulls the resolver out of opts and resolves at construction (or lazily, depending on the adapter).

---

## Env-var loader convention

`<family>/config/load<Family>ConfigFromEnv.ts`:

```typescript
export function load<Family>ConfigFromEnv(env: NodeJS.ProcessEnv): <Family>Config {
  const kind = env['CLOUDPDF_<FAMILY>_KIND'] ?? '<default>';
  const raw = { kind, ...kindSpecificFields(env, kind) };
  return <Family>ConfigSchema.parse(raw); // throws with helpful message
}
```

Env-var conventions:

- `CLOUDPDF_<FAMILY>_KIND` — selector
- `CLOUDPDF_<FAMILY>_<KIND>_<FIELD>` — variant-specific fields
- Secret values accept the `secret://<provider>/<name>?jsonKey=...&encoding=...` URI form (parsed to `SecretRef`) or plain strings (used literally)

---

## Redaction

When a config is logged or surfaced through an admin endpoint, run it through `redactConfig` from `config/secrets/redact.ts`:

```typescript
import { redactConfig } from '../../config/secrets/redact';

logger.info({ config: redactConfig(myConfig) }, 'starting');
```

- `SecretRef`-shaped values become `<SecretRef provider/name>`
- Caller can pass `additionalSensitiveKeys` to redact literal-string secret values by field name

A test (`test/config-redact.test.ts`) pins that secret material never leaks through `JSON.stringify` of a redacted config.

---

## The bootstrap recipe

In `bin/cloudpdf-server.ts`:

```typescript
// 1. Secrets — primary user-facing utility.
//    Registry takes the full SecretsConfig and applies
//    CachingSecretsProvider automatically when config.cache is set.
const secrets = createSecretsProviderRegistry(loadSecretsConfigFromEnv(env));
const resolver = createSecretResolver(secrets);

// 2. Each family loads its config, takes the resolver
const [kms, objectStore, cdnSigner] = await Promise.all([
  createKmsKeyring(loadKmsConfigFromEnv(env), { resolver }),
  createObjectStore(loadObjectStoreConfigFromEnv(env), { resolver }),
  createCdnSigner(loadCdnConfigFromEnv(env), { resolver }),
]);

// 3. buildApp — Secrets is NOT here, stays in scope for user code
await buildApp({ kms, objectStore, cdnSigner /* ... */ });
```

No `createServerRuntime` or other bundler. Five lines of factory composition is the standard, and it keeps `secrets` and `resolver` first-class for user code that needs to fetch its own secrets (JWT signing keys, DB credentials, third-party integration tokens).

### Caching control

`createSecretsProviderRegistry(config)` applies `CachingSecretsProvider` to every provider when `config.cache` is present. Three tiers of control:

| Goal                                                      | How                                                                                                                                                            |
| --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Default deployment (caching on)                           | `config.cache: { ttlSec: 3600 }` — `loadSecretsConfigFromEnv` sets this by default                                                                             |
| Custom TTL                                                | `config.cache: { ttlSec: 300 }` (or `CLOUDPDF_SECRETS_CACHE_TTL_SEC=300`)                                                                                      |
| No caching                                                | Omit `cache` from the programmatic config; or `CLOUDPDF_SECRETS_CACHE_TTL_SEC=0`                                                                               |
| Per-provider caching, custom decorators, mocked providers | Skip the registry helper — build providers manually via `createSecretsProvider`, compose into a `Map<string, SecretsProvider>`, pass to `createSecretResolver` |

---

## Adding a new adapter — checklist

1. **Interface** — already exists for the family; you don't touch it.
2. **Zod schema variant** — add one entry to `<family>/config/<Family>ConfigSchema.ts`'s discriminated union.
3. **Adapter class** — one file in `<family>/adapters/<Kind><Family>.ts`. Implements the interface; exposes `info: { kind, ... }`; uses the lazy-load house pattern if it wraps a cloud SDK.
4. **Factory case** — one new `case` in `<family>/create<Family>.ts`'s switch. TypeScript fails the build if you forget.
5. **Env loader case** — one new branch in `<family>/config/load<Family>ConfigFromEnv.ts`'s kind-specific field reader.
6. **Optional dependency** — if the adapter wraps a cloud SDK, add the package to `package.json`'s `optionalDependencies`.
7. **Test** — one file at `test/<family>-<kind>.test.ts` covering construction, key operations, and that `info` exposes only public identifiers.

That's the entire surface. If a step doesn't apply (e.g., no cloud SDK → skip step 6), skip it explicitly in the PR description.
