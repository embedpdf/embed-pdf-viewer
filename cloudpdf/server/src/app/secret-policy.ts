import type { LicenseGateStatus } from '../licensing/LicenseRuntime';

/**
 * Publicly-known dev fallback secrets. They live in the source tree, so a
 * deployment running on one of them offers no secrecy at all — anyone can
 * mint JWTs (hs256) or brute-force password-proof rows offline. They exist
 * purely so zero-config dev/try-it-out boots work, and are rejected the
 * moment the license says this is a real deployment.
 */
export const DEV_FALLBACK_SECRETS: ReadonlySet<string> = new Set([
  'cloudpdf-dev-secret-change-me',
  'cloudpdf-dev-password-session-secret',
  'cloudpdf-dev-password-verification-secret',
]);

/**
 * Minimum secret size under a production license. 32 bytes matches the
 * RFC 7518 requirement for HS256 keys (>= hash output size) and is a
 * sensible floor for the HMAC pepper secrets too.
 */
export const MIN_PRODUCTION_SECRET_BYTES = 32;

/**
 * Whether this license demands production secret hygiene.
 *
 * Development keys (`licenseKind: 'development'`) and the test gate keep
 * the dev fallbacks so local try-it-out deployments boot with zero config.
 * Anything else — subscription, evaluation, or an older certificate without
 * a `purpose` (licenseKind null) — is treated as a real deployment and must
 * not run on publicly-known or trivially-short secrets (fail closed).
 *
 * `access === 'none'` is exempt only because such a gate refuses all
 * traffic anyway; surfacing the license error, not a secrets error, is the
 * actionable message there.
 */
export function requiresProductionSecrets(status: LicenseGateStatus): boolean {
  if (status.access === 'none') return false;
  if (status.code === 'VALID_TEST_LICENSE') return false;
  return status.licenseKind !== 'development';
}

export interface SecretRequirement {
  /** Human name for error messages, e.g. `'PDF password verification HMAC secret'`. */
  name: string;
  /** Env var an operator sets to fix the error. */
  envVar: string;
  /** `buildApp` option that also fixes it (for programmatic embedders). */
  option: string;
}

/**
 * Assert a secret is production-grade: present, not one of the public dev
 * fallbacks, and at least {@link MIN_PRODUCTION_SECRET_BYTES} bytes. Throws
 * with the exact env var / option to set and how to generate a value.
 */
export function assertProductionSecret(
  value: string | Buffer | undefined,
  req: SecretRequirement,
): void {
  const bytes =
    value === undefined
      ? 0
      : typeof value === 'string'
        ? Buffer.byteLength(value, 'utf8')
        : value.byteLength;
  const isDevFallback = typeof value === 'string' && DEV_FALLBACK_SECRETS.has(value);
  if (value !== undefined && !isDevFallback && bytes >= MIN_PRODUCTION_SECRET_BYTES) return;

  const problem =
    value === undefined
      ? 'is not configured'
      : isDevFallback
        ? 'is the publicly-known dev fallback'
        : `is too short (${bytes} bytes, need >= ${MIN_PRODUCTION_SECRET_BYTES})`;
  throw new Error(
    `buildApp: this deployment runs on a production license but the ${req.name} ${problem}. ` +
      `Set ${req.envVar} (or the \`${req.option}\` option) to a random secret of at least ` +
      `${MIN_PRODUCTION_SECRET_BYTES} bytes, e.g.: openssl rand -base64 48`,
  );
}

/**
 * Resolve a secret from explicit option -> env var -> dev fallback, then
 * apply {@link assertProductionSecret} when `enforce` is set. The fallback
 * is what keeps dev-license and test boots zero-config; enforcement is what
 * keeps it out of real deployments.
 */
export function resolveSecret(input: {
  explicit: string | Buffer | undefined;
  env: NodeJS.ProcessEnv;
  requirement: SecretRequirement;
  devFallback: string;
  enforce: boolean;
}): string | Buffer {
  const fromEnv = input.env[input.requirement.envVar];
  const value = input.explicit ?? fromEnv ?? input.devFallback;
  if (input.enforce) {
    // Report "not configured" (rather than "dev fallback") when nothing was
    // supplied at all — that is the operator's actual situation.
    assertProductionSecret(input.explicit ?? fromEnv, input.requirement);
  }
  return value;
}
