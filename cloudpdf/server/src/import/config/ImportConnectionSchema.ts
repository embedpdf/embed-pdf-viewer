/**
 * Operator-registered import connections — the `connection` wire kind.
 *
 * A connection is pre-registered authority: which backend, which
 * bucket, WHO may exercise it (credential classes), FOR which tenants,
 * and over WHAT slice (scope). The wire request only ever names
 * `{ connectionId, key, revision? }`; everything here is deployment
 * configuration, never wire surface.
 *
 * Scope is a discriminated union so the invalid combinations are
 * unrepresentable rather than refined away:
 *
 *   - `whole-bucket`     the entire bucket. Legal ONLY with the
 *                        default `api-token` credential class — a
 *                        whole-bucket read is an operator-grade
 *                        capability (boot invariant below).
 *   - `shared-prefixes`  a fixed slice shared by every allowed
 *                        caller (e.g. a common assets folder).
 *   - `tenant-template`  a per-tenant slice: `{tenantId}` is
 *                        substituted with the AUTHENTICATED tenant at
 *                        resolution time. Scales to any tenant count
 *                        with zero per-tenant configuration.
 *
 * Template rules (all boot-enforced): exactly one `{tenantId}`
 * placeholder, no other `{...}` placeholders, and the template must
 * end with `/` — `tenants/{tenantId}` would let tenant `acme`
 * prefix-match `tenants/acme-other/...`, a real cross-tenant read.
 */
import { z } from 'zod';

/** UTF-8 byte length — provider key limits are byte rules, not code units. */
const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

const KeyPrefixSchema = z
  .string()
  .min(1)
  .refine((p) => !p.includes('\0'), 'prefix must not contain NUL')
  .refine((p) => utf8Bytes(p) <= 1024, 'prefix must be at most 1024 UTF-8 bytes');

export const TENANT_PLACEHOLDER = '{tenantId}';

export const KeyPrefixTemplateSchema = z
  .string()
  .min(1)
  .superRefine((template, ctx) => {
    const refuse = (message: string): void => {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message });
    };
    const first = template.indexOf(TENANT_PLACEHOLDER);
    if (first === -1) {
      refuse(`template must contain exactly one ${TENANT_PLACEHOLDER} placeholder`);
      return;
    }
    if (template.lastIndexOf(TENANT_PLACEHOLDER) !== first) {
      refuse(`template must contain exactly one ${TENANT_PLACEHOLDER} placeholder`);
      return;
    }
    const literal = template.replace(TENANT_PLACEHOLDER, '');
    if (/[{}]/.test(literal)) {
      refuse(`template contains an unknown placeholder; only ${TENANT_PLACEHOLDER} is supported`);
      return;
    }
    if (!template.endsWith('/')) {
      refuse(
        `template must end with '/' so tenant slices cannot prefix-collide (tenants/{tenantId} would let acme match acme-other)`,
      );
      return;
    }
    if (literal.includes('\0') || utf8Bytes(literal) > 900) {
      refuse('template literal content must be NUL-free and at most 900 UTF-8 bytes');
    }
  });

export const ImportConnectionScopeSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('whole-bucket') }),
  z.object({ kind: z.literal('shared-prefixes'), prefixes: z.array(KeyPrefixSchema).min(1) }),
  z.object({ kind: z.literal('tenant-template'), template: KeyPrefixTemplateSchema }),
]);
export type ImportConnectionScope = z.infer<typeof ImportConnectionScopeSchema>;

const connectionCommon = {
  id: z.string().min(1).max(128),
  /**
   * Which credential classes may exercise this connection.
   * DEFAULT: operator only — tenant-jwt is an explicit opt-in, and
   * even then never for whole-bucket scopes (boot invariant).
   */
  credentials: z
    .array(z.enum(['api-token', 'tenant-jwt']))
    .nonempty()
    .default(['api-token']),
  /** Tenant allowlist; '*' scales via the tenant-template scope. */
  tenants: z.union([z.literal('*'), z.array(z.string().min(1)).nonempty()]).default('*'),
  scope: ImportConnectionScopeSchema.default({ kind: 'whole-bucket' }),
};

export const ImportConnectionSchema = z
  .discriminatedUnion('kind', [
    z.object({
      kind: z.literal('s3'),
      ...connectionCommon,
      bucket: z.string().min(1),
      region: z.string().min(1),
      /** Non-AWS S3-compatible endpoint (R2, MinIO, Wasabi, ...). */
      endpoint: z.string().url().optional(),
      // NB: no roleArn/externalId yet — a parsed-but-ignored authority
      // option is a misconfiguration trap. The fields arrive together
      // with a working assumption implementation.
    }),
  ])
  .superRefine((conn, ctx) => {
    if (conn.credentials.includes('tenant-jwt') && conn.scope.kind === 'whole-bucket') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `connection ${conn.id}: tenant-jwt credentials require a key-prefix scope; whole-bucket access is api-token only`,
      });
    }
  });

export type ImportConnection = z.infer<typeof ImportConnectionSchema>;
export type S3ImportConnection = Extract<ImportConnection, { kind: 's3' }>;
