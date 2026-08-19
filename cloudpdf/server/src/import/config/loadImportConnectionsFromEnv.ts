/**
 * Build the import-connection list from environment variables.
 *
 * Convention (mirrors CLOUDPDF_SECRETS_PROVIDERS: a declared registry
 * list, then per-name variables keyed by the UPPER_SNAKE name):
 *
 *   CLOUDPDF_IMPORT_CONNECTIONS=customer-archive,acme-invoices
 *
 *   CLOUDPDF_IMPORT_CONNECTION_CUSTOMER_ARCHIVE_KIND=s3
 *   CLOUDPDF_IMPORT_CONNECTION_CUSTOMER_ARCHIVE_S3_BUCKET=customer-documents
 *   CLOUDPDF_IMPORT_CONNECTION_CUSTOMER_ARCHIVE_S3_REGION=eu-west-1
 *   CLOUDPDF_IMPORT_CONNECTION_CUSTOMER_ARCHIVE_S3_ENDPOINT=   (optional; R2/MinIO)
 *   CLOUDPDF_IMPORT_CONNECTION_CUSTOMER_ARCHIVE_CREDENTIALS=api-token   (default)
 *   CLOUDPDF_IMPORT_CONNECTION_CUSTOMER_ARCHIVE_TENANTS=*               (default)
 *   CLOUDPDF_IMPORT_CONNECTION_CUSTOMER_ARCHIVE_SCOPE=whole-bucket      (default)
 *       | shared-prefixes  (+ _SCOPE_PREFIXES=a/,b/)
 *       | tenant-template  (+ _SCOPE_TEMPLATE=tenants/{tenantId}/)
 *
 * Credentials convention matches the storage family: the S3 SDK's
 * default credential chain (IAM role / env) — nothing credential-
 * shaped lives here.
 *
 * All validation is BOOT-TIME fail-closed: unknown kinds, mismatched
 * scope variables, template violations, tenant-jwt-on-whole-bucket,
 * and normalized env-name collisions (`customer-archive` vs
 * `customer_archive` both normalize to CUSTOMER_ARCHIVE) refuse to
 * start rather than surprise at request time.
 */
import { ImportConnectionSchema, type ImportConnection } from './ImportConnectionSchema';

export function loadImportConnectionsFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ImportConnection[] {
  const declared = (env['CLOUDPDF_IMPORT_CONNECTIONS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (declared.length === 0) return [];

  const seen = new Map<string, string>();
  const out: ImportConnection[] = [];
  for (const name of declared) {
    if (!/^[A-Za-z0-9_-]+$/.test(name)) {
      throw new Error(`import connection name '${name}' must use [A-Za-z0-9_-]`);
    }
    const norm = name.toUpperCase().replace(/-/g, '_');
    const prior = seen.get(norm);
    if (prior !== undefined) {
      throw new Error(
        `import connections '${prior}' and '${name}' collide as ${norm} in env naming`,
      );
    }
    seen.set(norm, name);

    const v = (suffix: string): string | undefined => {
      const raw = env[`CLOUDPDF_IMPORT_CONNECTION_${norm}_${suffix}`];
      return raw === undefined || raw === '' ? undefined : raw;
    };
    const req = (suffix: string): string => {
      const raw = v(suffix);
      if (raw === undefined) {
        throw new Error(
          `import connection '${name}': CLOUDPDF_IMPORT_CONNECTION_${norm}_${suffix} is required`,
        );
      }
      return raw;
    };
    const csv = (raw: string): string[] =>
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    const kind = (v('KIND') ?? '').toLowerCase();
    if (kind !== 's3') {
      throw new Error(
        `import connection '${name}': KIND must be 's3' (got '${kind || '(unset)'}'); gcs/azure-blob/fs sources arrive in later phases`,
      );
    }

    const scopeKind = (v('SCOPE') ?? 'whole-bucket').toLowerCase();
    let scope: unknown;
    if (scopeKind === 'whole-bucket') {
      if (v('SCOPE_PREFIXES') || v('SCOPE_TEMPLATE')) {
        throw new Error(
          `import connection '${name}': SCOPE=whole-bucket must not set SCOPE_PREFIXES/SCOPE_TEMPLATE`,
        );
      }
      scope = { kind: 'whole-bucket' };
    } else if (scopeKind === 'shared-prefixes') {
      if (v('SCOPE_TEMPLATE')) {
        throw new Error(
          `import connection '${name}': SCOPE=shared-prefixes must not set SCOPE_TEMPLATE`,
        );
      }
      scope = { kind: 'shared-prefixes', prefixes: csv(req('SCOPE_PREFIXES')) };
    } else if (scopeKind === 'tenant-template') {
      if (v('SCOPE_PREFIXES')) {
        throw new Error(
          `import connection '${name}': SCOPE=tenant-template must not set SCOPE_PREFIXES`,
        );
      }
      scope = { kind: 'tenant-template', template: req('SCOPE_TEMPLATE') };
    } else {
      throw new Error(
        `import connection '${name}': SCOPE must be whole-bucket, shared-prefixes, or tenant-template (got '${scopeKind}')`,
      );
    }

    const tenantsRaw = v('TENANTS');
    const credentialsRaw = v('CREDENTIALS');
    const endpoint = v('S3_ENDPOINT');
    const parsed = ImportConnectionSchema.safeParse({
      kind: 's3',
      id: name,
      bucket: req('S3_BUCKET'),
      region: req('S3_REGION'),
      ...(endpoint ? { endpoint } : {}),
      ...(credentialsRaw ? { credentials: csv(credentialsRaw) } : {}),
      ...(tenantsRaw ? { tenants: tenantsRaw === '*' ? '*' : csv(tenantsRaw) } : {}),
      scope,
    });
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => i.message).join('; ');
      throw new Error(`import connection '${name}': ${issues}`);
    }
    out.push(parsed.data);
  }
  return out;
}
